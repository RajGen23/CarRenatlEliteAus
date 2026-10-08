"""Host approval flow (request to book): backend tests.

Covers:
 * renter profile GET/PATCH (complete flag)
 * POST /bookings creates pending, wallet untouched, has request_expires_at
 * POST /bookings rejected 400 when renter profile incomplete
 * vendor/requests renter card shape + decline_reasons
 * vendor accept -> upcoming/paid=true, wallet debited exactly once
 * vendor decline w/ reason + note; invalid reason 400; non-pending 400
 * authorisation: 403 non-owner accept/decline; 403 non-vendor list
 * cancel of pending -> refund 0; cancel of upcoming -> 80% refund
 * auto-decline after 24h via mongo expires_at rewind
 * vendor/dashboard exposes pending_requests count
"""

import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from settings import API



DEMO_CAR = "vcar_demo_porsche_911"
SEEDED_REQUEST = "bk_demo_request_01"


# helpers

def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _register(username: str, password: str, name: str, email: str) -> str:
    r = requests.post(f"{API}/auth/register", json={"username": username, "password": password, "name": name, "email": email})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def _hdr(tok: str):
    return {"Authorization": f"Bearer {tok}"}


def _wallet(tok: str) -> float:
    r = requests.get(f"{API}/wallet", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return float(r.json()["balance"])


def _valid_profile():
    return {
        "full_name": "Renter Demo",
        "phone": "+61 400 111 222",
        "dob": "1990-05-01",
        "address_line1": "1 Demo Lane",
        "city": "Melbourne",
        "state": "VIC",
        "postcode": "3000",
        "license_no": "DL-TEST-999",
        "license_expiry": "2030-12-31",
    }


def _save_profile(tok: str, profile: dict):
    r = requests.patch(f"{API}/profile/renter", json=profile, headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return r.json()


def _create_booking(tok: str, car_id: str = DEMO_CAR):
    now = datetime.now(timezone.utc)
    p = now + timedelta(days=3)
    d = now + timedelta(days=5)
    payload = {
        "car_id": car_id,
        "pickup_location": "Melbourne",
        "drop_location": "Melbourne",
        "pickup_datetime": p.isoformat(),
        "drop_datetime": d.isoformat(),
    }
    r = requests.post(f"{API}/bookings", json=payload, headers=_hdr(tok))
    return r


# fixtures

@pytest.fixture(scope="session")
def renter_token():
    return _login("userdemo", "User@123")


@pytest.fixture(scope="session")
def vendor_token():
    return _login("vendordemo", "Vendor@123")


@pytest.fixture(scope="session")
def fresh_renter():
    """Brand new user without renter profile for the 400 test."""
    uname = f"TEST_freshrenter_{uuid.uuid4().hex[:6]}"
    tok = _register(uname, "User@123", "Fresh Renter", f"{uname}@example.com")
    # top up so wallet balance is not the reason for 400
    r = requests.post(f"{API}/wallet/topup", json={"amount": 5000.0}, headers=_hdr(tok))
    assert r.status_code == 200, r.text
    return {"username": uname, "token": tok}


@pytest.fixture(scope="session")
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    yield client[os.environ["DB_NAME"]]
    client.close()


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


# =====================================================
# Renter profile
# =====================================================
class TestRenterProfile:
    def test_get_returns_shape(self, renter_token):
        r = requests.get(f"{API}/profile/renter", headers=_hdr(renter_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "profile" in body and "complete" in body and "required_fields" in body
        assert set(body["required_fields"]) >= {"full_name", "phone", "dob", "address_line1", "city", "state", "postcode", "license_no", "license_expiry"}

    def test_patch_saves_all_fields_and_completes(self, renter_token):
        profile = _valid_profile()
        r = requests.patch(f"{API}/profile/renter", json=profile, headers=_hdr(renter_token))
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["complete"] is True
        for k, v in profile.items():
            assert saved["profile"][k] == v
        # GET reflects it
        got = requests.get(f"{API}/profile/renter", headers=_hdr(renter_token)).json()
        assert got["complete"] is True
        for k, v in profile.items():
            assert got["profile"][k] == v


# =====================================================
# Create booking behaviour
# =====================================================
class TestCreateBooking:
    def test_incomplete_profile_rejects_400(self, fresh_renter):
        r = _create_booking(fresh_renter["token"])
        assert r.status_code == 400, r.text
        assert "profile" in r.json()["detail"].lower()

    def test_pending_created_wallet_unchanged(self, renter_token):
        # ensure profile complete
        _save_profile(renter_token, _valid_profile())
        before = _wallet(renter_token)
        r = _create_booking(renter_token)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "pending"
        assert b["paid"] is False
        assert "request_expires_at" in b
        # request_expires_at ~24h ahead
        exp = datetime.fromisoformat(b["request_expires_at"].replace("Z", "+00:00"))
        delta_hrs = (exp - datetime.now(timezone.utc)).total_seconds() / 3600.0
        assert 23.0 <= delta_hrs <= 25.0
        after = _wallet(renter_token)
        assert round(before - after, 2) == 0.0
        # stash id
        TestCreateBooking.booking_id = b["booking_id"]
        TestCreateBooking.total = b["total"]


# =====================================================
# Vendor requests + accept + decline
# =====================================================
class TestVendorRequests:
    def test_non_vendor_forbidden(self, renter_token):
        r = requests.get(f"{API}/vendor/requests", headers=_hdr(renter_token))
        assert r.status_code == 403

    def test_list_pending_with_renter_card(self, vendor_token):
        r = requests.get(f"{API}/vendor/requests", headers=_hdr(vendor_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "requests" in body and "decline_reasons" in body
        assert isinstance(body["decline_reasons"], list) and len(body["decline_reasons"]) >= 3
        assert len(body["requests"]) >= 1
        # find the seeded demo request OR the one we just created
        req = next((x for x in body["requests"] if x["booking_id"] == SEEDED_REQUEST), body["requests"][0])
        renter = req.get("renter")
        assert renter is not None
        # all required renter card fields
        for k in ("name", "picture", "email", "phone", "dob", "address", "license_no", "license_expiry",
                  "license_verified", "id_verified", "member_since", "trips", "cancellations", "rating"):
            assert k in renter, f"renter card missing '{k}'"

    def test_accept_debits_renter_wallet_exactly_once(self, renter_token, vendor_token):
        # get the fresh booking id from earlier test (or create one)
        booking_id = getattr(TestCreateBooking, "booking_id", None)
        total = getattr(TestCreateBooking, "total", None)
        assert booking_id and total, "prior create-booking test did not run"

        wallet_before = _wallet(renter_token)
        r = requests.post(f"{API}/vendor/bookings/{booking_id}/accept", headers=_hdr(vendor_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "upcoming"
        assert round(body["charged"], 2) == round(total, 2)
        wallet_after = _wallet(renter_token)
        assert round(wallet_before - wallet_after, 2) == round(total, 2)

        # second accept -> 400 (not pending anymore)
        r2 = requests.post(f"{API}/vendor/bookings/{booking_id}/accept", headers=_hdr(vendor_token))
        assert r2.status_code == 400

        # persisted state
        got = requests.get(f"{API}/bookings", headers=_hdr(renter_token)).json()
        b = next(x for x in got if x["booking_id"] == booking_id)
        assert b["status"] == "upcoming"
        assert b.get("paid") is True

    def test_decline_stores_reason_and_note(self, renter_token, vendor_token):
        # create fresh pending booking to decline
        _save_profile(renter_token, _valid_profile())
        r = _create_booking(renter_token)
        assert r.status_code == 200, r.text
        booking_id = r.json()["booking_id"]
        wallet_before = _wallet(renter_token)

        # invalid reason -> 400
        r_bad = requests.post(f"{API}/vendor/bookings/{booking_id}/decline",
                              json={"reason": "not-a-real-reason"}, headers=_hdr(vendor_token))
        assert r_bad.status_code == 400

        # good decline
        reasons = requests.get(f"{API}/vendor/requests", headers=_hdr(vendor_token)).json()["decline_reasons"]
        r_ok = requests.post(f"{API}/vendor/bookings/{booking_id}/decline",
                             json={"reason": reasons[0], "note": "TEST decline note"},
                             headers=_hdr(vendor_token))
        assert r_ok.status_code == 200, r_ok.text
        assert r_ok.json()["status"] == "declined"

        # wallet unchanged
        assert round(wallet_before - _wallet(renter_token), 2) == 0.0

        # persistent state
        got = requests.get(f"{API}/bookings", headers=_hdr(renter_token)).json()
        b = next(x for x in got if x["booking_id"] == booking_id)
        assert b["status"] == "declined"
        assert b["decline_reason"] == reasons[0]
        assert b["decline_note"] == "TEST decline note"

        # declining again -> 400 (not pending)
        r_again = requests.post(f"{API}/vendor/bookings/{booking_id}/decline",
                                json={"reason": reasons[0]}, headers=_hdr(vendor_token))
        assert r_again.status_code == 400


# =====================================================
# Authorisation
# =====================================================
class TestAuthorisation:
    def test_other_vendor_cannot_accept(self, renter_token, vendor_token, db):
        """Register a NEW vendor and try to accept the seeded request on the demo car."""
        uname = f"TEST_ven_{uuid.uuid4().hex[:6]}"
        tok = _register(uname, "Vendor@123", "Fake Vendor", f"{uname}@example.com")
        # onboard so is_vendor=true
        r = requests.post(f"{API}/vendor/onboard", headers=_hdr(tok), json={
            "company": "TEST Co", "phone": "+61 400 000 000", "abn": "12345678901",
            "license_no": "L-TEST", "bank_account_name": "T", "bank_bsb": "062-000", "bank_account_no": "12345678",
        })
        assert r.status_code == 200, r.text

        # create a pending booking to try accept on
        _save_profile(renter_token, _valid_profile())
        r2 = _create_booking(renter_token)
        assert r2.status_code == 200, r2.text
        booking_id = r2.json()["booking_id"]

        rej = requests.post(f"{API}/vendor/bookings/{booking_id}/accept", headers=_hdr(tok))
        assert rej.status_code == 403

        rej2 = requests.post(f"{API}/vendor/bookings/{booking_id}/decline",
                             json={"reason": "Other"}, headers=_hdr(tok))
        assert rej2.status_code == 403

        # cleanup: renter cancels their own pending
        c = requests.post(f"{API}/bookings/{booking_id}/cancel", headers=_hdr(renter_token))
        assert c.status_code == 200, c.text


# =====================================================
# Cancel semantics
# =====================================================
class TestCancel:
    def test_cancel_pending_no_refund(self, renter_token):
        _save_profile(renter_token, _valid_profile())
        r = _create_booking(renter_token)
        assert r.status_code == 200, r.text
        bid = r.json()["booking_id"]

        wallet_before = _wallet(renter_token)
        c = requests.post(f"{API}/bookings/{bid}/cancel", headers=_hdr(renter_token))
        assert c.status_code == 200, c.text
        assert c.json()["refund"] == 0.0
        assert round(_wallet(renter_token) - wallet_before, 2) == 0.0

    def test_cancel_upcoming_80pc_refund(self, renter_token, vendor_token):
        _save_profile(renter_token, _valid_profile())
        r = _create_booking(renter_token)
        assert r.status_code == 200, r.text
        bid = r.json()["booking_id"]
        total = r.json()["total"]

        # host accepts -> renter charged
        a = requests.post(f"{API}/vendor/bookings/{bid}/accept", headers=_hdr(vendor_token))
        assert a.status_code == 200, a.text

        wallet_before = _wallet(renter_token)
        c = requests.post(f"{API}/bookings/{bid}/cancel", headers=_hdr(renter_token))
        assert c.status_code == 200, c.text
        expected_refund = round(total * 0.8, 2)
        assert c.json()["refund"] == expected_refund
        assert round(_wallet(renter_token) - wallet_before, 2) == expected_refund


# =====================================================
# Auto-decline after 24h
# =====================================================
class TestAutoDecline:
    def test_expired_pending_flips_to_declined(self, renter_token, vendor_token, db):
        _save_profile(renter_token, _valid_profile())
        r = _create_booking(renter_token)
        assert r.status_code == 200, r.text
        bid = r.json()["booking_id"]

        # rewind expires_at into the past
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        _run(db.bookings.update_one({"booking_id": bid}, {"$set": {"request_expires_at": past}}))

        # trigger expire via GET /bookings
        got = requests.get(f"{API}/bookings", headers=_hdr(renter_token)).json()
        b = next(x for x in got if x["booking_id"] == bid)
        assert b["status"] == "declined"
        assert b["decline_reason"] == "No response from host within 24 hours"


# =====================================================
# Vendor dashboard pending count
# =====================================================
class TestVendorDashboard:
    def test_pending_requests_field_present(self, vendor_token):
        r = requests.get(f"{API}/vendor/dashboard", headers=_hdr(vendor_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "pending_requests" in d
        assert isinstance(d["pending_requests"], int)
        assert d["pending_requests"] >= 0
