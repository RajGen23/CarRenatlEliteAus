"""Marketplace rules: host approval, listing ownership, private documents,
availability, booking dates, trip completion and renter privacy.
"""
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from settings import ADMIN_PASSWORD, ADMIN_USERNAME, API

DEMO_CAR = "vcar_demo_porsche_911"
MARKET_TZ = ZoneInfo("Australia/Melbourne")
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
RENTER_PROFILE = {
    "full_name": "Rules Tester",
    "phone": "+61 400 555 010",
    "dob": "1988-02-14",
    "address_line1": "9 Private Street",
    "city": "Melbourne",
    "state": "VIC",
    "postcode": "3000",
    "license_no": "VIC-RULES-01",
    "license_expiry": "2031-01-01",
}


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def _register(prefix: str) -> tuple:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/register", json={
        "username": uname, "password": "Rules@123", "name": prefix,
        "email": f"{uname}@example.com", "accept_terms": True,
    })
    assert r.status_code == 200, r.text
    return uname, r.json()["session_token"], r.json()["user"]["user_id"]


def _renter(prefix: str = "TEST_rules_renter") -> str:
    _, tok, _ = _register(prefix)
    assert requests.patch(f"{API}/profile/renter", json=RENTER_PROFILE, headers=_hdr(tok)).status_code == 200
    assert requests.post(f"{API}/wallet/topup", json={"amount": 50000}, headers=_hdr(tok)).status_code == 200
    return tok


def _host(prefix: str = "TEST_rules_host") -> tuple:
    _, tok, uid = _register(prefix)
    r = requests.post(f"{API}/vendor/onboard", headers=_hdr(tok), json={
        "company": f"{prefix} Pty Ltd", "phone": "+61 400 000 111", "license_no": "HOST-1",
        "bank_account_name": prefix, "bank_bsb": "063-000", "bank_account_no": "99887766",
    })
    assert r.status_code == 200, r.text
    return tok, uid


def _car_payload(**overrides) -> dict:
    expiry = (datetime.now(timezone.utc) + timedelta(days=200)).date().isoformat()
    payload = {
        "brand": "TEST_Rules", "model": "GT", "category": "Sports", "price_per_day": 500.0,
        "fuel_type": "Petrol", "transmission": "Automatic", "seats": 2,
        "image": "https://example.com/gt.jpg", "description": "TEST rules car",
        "insurance_expiry": expiry,
        "insurance_document": {"content_type": "image/png", "data_b64": TINY_PNG},
        "registration_document": {"content_type": "image/png", "data_b64": TINY_PNG},
    }
    payload.update(overrides)
    return payload


def _window(start_days: float, length_days: float = 2) -> tuple:
    pickup = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=start_days)
    return pickup, pickup + timedelta(days=length_days)


def _book(tok: str, car_id: str, pickup: datetime, drop: datetime, **extra):
    return requests.post(f"{API}/bookings", headers=_hdr(tok), json={
        "car_id": car_id, "pickup_location": "Melbourne", "drop_location": "Melbourne",
        "pickup_datetime": pickup.isoformat(), "drop_datetime": drop.isoformat(),
        "accept_rental_terms": True, **extra,
    })


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    database = client[os.environ["DB_NAME"]]
    yield database

    async def _cleanup():
        test_cars = {"brand": {"$regex": "^TEST_(Rules|Hijack)$"}}
        car_ids = [c["car_id"] async for c in database.cars.find(test_cars, {"_id": 0, "car_id": 1})]
        car_ids += [c["car_id"] async for c in database.cars.find({"car_id": {"$regex": "^vcar_TEST_"}}, {"car_id": 1})]
        await database.vehicle_documents.delete_many({"car_id": {"$in": car_ids}})
        await database.cars.delete_many({"car_id": {"$in": car_ids}})
    _run(_cleanup())
    client.close()


@pytest.fixture(scope="module")
def admin():
    return _hdr(_login(ADMIN_USERNAME, ADMIN_PASSWORD))


@pytest.fixture(scope="module")
def demo_host():
    return _hdr(_login("vendordemo", "Vendor@123"))


@pytest.fixture(scope="module")
def free_dates():
    """Hand out non-overlapping future windows so tests don't collide with each other."""
    slots = iter(range(random.randint(2000, 3500) // 5 * 5, 10_000, 5))
    return lambda length=2: _window(next(slots), length)


class TestHostApproval:
    def test_unapproved_host_is_hidden_and_cannot_operate(self, db, admin):
        tok, uid = _host()
        _run(db.users.update_one({"user_id": uid}, {"$set": {"vendor_profile.kyc_status": "pending"}}))

        r = requests.post(f"{API}/vendor/cars", json=_car_payload(), headers=_hdr(tok))
        assert r.status_code == 200, r.text
        car_id = r.json()["car_id"]
        assert r.json()["listing_status"] == "host_pending"

        approve = requests.post(f"{API}/admin/cars/{car_id}/approve", headers=admin)
        assert approve.status_code == 200, approve.text

        public_ids = {c["car_id"] for c in requests.get(f"{API}/cars").json()}
        assert car_id not in public_ids
        assert requests.get(f"{API}/cars/{car_id}").status_code == 404

        renter = _renter()
        pickup, drop = _window(30)
        assert _book(renter, car_id, pickup, drop).status_code == 400

        payout = requests.post(f"{API}/vendor/payouts", json={"amount": 10}, headers=_hdr(tok))
        assert payout.status_code == 403

        dash = requests.get(f"{API}/vendor/dashboard", headers=_hdr(tok)).json()
        assert dash["kyc_status"] == "pending" and dash["host_approved"] is False

        kyc = requests.post(f"{API}/admin/vendors/{uid}/kyc", json={"decision": "approved"}, headers=admin)
        assert kyc.status_code == 200
        assert requests.get(f"{API}/cars/{car_id}").status_code == 200

        rejected = requests.post(f"{API}/admin/vendors/{uid}/kyc", json={"decision": "rejected"}, headers=admin)
        assert rejected.status_code == 200
        assert car_id not in {c["car_id"] for c in requests.get(f"{API}/cars").json()}

    def test_expired_insurance_hides_car(self, db, admin):
        tok, _ = _host("TEST_rules_insured")
        car_id = requests.post(f"{API}/vendor/cars", json=_car_payload(), headers=_hdr(tok)).json()["car_id"]
        assert requests.post(f"{API}/admin/cars/{car_id}/approve", headers=admin).status_code == 200
        assert requests.get(f"{API}/cars/{car_id}").status_code == 200

        _run(db.cars.update_one({"car_id": car_id}, {"$set": {"insurance_expiry": "2021-06-30"}}))
        assert requests.get(f"{API}/cars/{car_id}").status_code == 404
        fleet = requests.get(f"{API}/vendor/cars", headers=_hdr(tok)).json()
        assert next(c for c in fleet if c["car_id"] == car_id)["listing_status"] == "insurance_expired"

    def test_vendor_car_without_documents_cannot_be_approved(self, db, admin):
        _, uid = _host("TEST_rules_nodocs")
        car_id = f"vcar_TEST_{uuid.uuid4().hex[:8]}"
        _run(db.cars.insert_one({
            "car_id": car_id, "vendor_id": uid, "brand": "TEST", "model": "Legacy",
            "approval_status": "pending", "available": True, "price_per_day": 100.0,
            "insurance_expiry": "2099-01-01",
        }))
        r = requests.post(f"{API}/admin/cars/{car_id}/approve", headers=admin)
        assert r.status_code == 400


class TestListingOwnership:
    def test_create_cannot_overwrite_another_car(self, db):
        tok, uid = _host("TEST_rules_takeover")
        before = _run(db.cars.find_one({"car_id": "car_lambo_aventador"}, {"_id": 0}))

        r = requests.post(
            f"{API}/vendor/cars", json=_car_payload(car_id="car_lambo_aventador", brand="TEST_Hijack"),
            headers=_hdr(tok),
        )
        assert r.status_code == 200, r.text
        assert r.json()["car_id"] != "car_lambo_aventador"

        after = _run(db.cars.find_one({"car_id": "car_lambo_aventador"}, {"_id": 0}))
        assert after.get("vendor_id") == before.get("vendor_id")
        assert after["brand"] == before["brand"]

    def test_cannot_edit_another_hosts_car(self, demo_host):
        tok, _ = _host("TEST_rules_editor")
        r = requests.patch(f"{API}/vendor/cars/{DEMO_CAR}", json=_car_payload(), headers=_hdr(tok))
        assert r.status_code == 404
        r = requests.post(f"{API}/vendor/cars/{DEMO_CAR}/block", json={"dates": ["2031-01-01"]}, headers=_hdr(tok))
        assert r.status_code == 404


class TestPrivateDocuments:
    def test_documents_are_not_public(self, db, admin):
        tok, _ = _host("TEST_rules_docs")
        car = requests.post(f"{API}/vendor/cars", json=_car_payload(), headers=_hdr(tok)).json()
        car_id = car["car_id"]
        assert requests.post(f"{API}/admin/cars/{car_id}/approve", headers=admin).status_code == 200

        public = requests.get(f"{API}/cars/{car_id}").json()
        listed = next(c for c in requests.get(f"{API}/cars").json() if c["car_id"] == car_id)
        for record in (public, listed):
            assert not any("doc" in key for key in record), record.keys()
        assert TINY_PNG not in requests.get(f"{API}/cars/{car_id}").text

        stored = _run(db.cars.find_one({"car_id": car_id}, {"_id": 0}))
        assert not any("doc" in key for key in stored)

        other_tok, _ = _host("TEST_rules_snoop")
        assert requests.get(f"{API}/vendor/cars/{car_id}/documents/insurance", headers=_hdr(other_tok)).status_code == 404
        assert requests.get(f"{API}/admin/cars/{car_id}/documents/insurance").status_code == 401

        admin_doc = requests.get(f"{API}/admin/cars/{car_id}/documents/registration", headers=admin)
        assert admin_doc.status_code == 200
        assert admin_doc.json()["data_b64"] == TINY_PNG
        admin_list = next(c for c in requests.get(f"{API}/admin/cars", headers=admin).json() if c["car_id"] == car_id)
        assert admin_list["documents"] == ["insurance", "registration"]


class TestBookingDates:
    def test_rejects_past_and_reversed_dates(self):
        renter = _renter()
        now = datetime.now(timezone.utc)
        r = _book(renter, DEMO_CAR, now - timedelta(days=2), now - timedelta(days=1))
        assert r.status_code == 400 and "future" in r.json()["detail"].lower()

        r = _book(renter, DEMO_CAR, now + timedelta(days=5), now + timedelta(days=4))
        assert r.status_code == 400 and "after" in r.json()["detail"].lower()

        r = _book(renter, DEMO_CAR, now + timedelta(days=5), now + timedelta(days=5))
        assert r.status_code == 400

        bad = requests.post(f"{API}/bookings", headers=_hdr(renter), json={
            "car_id": DEMO_CAR, "pickup_location": "M", "drop_location": "M",
            "pickup_datetime": "next tuesday", "drop_datetime": "2031-01-01T10:00:00Z",
            "accept_rental_terms": True,
        })
        assert bad.status_code == 400


class TestDoubleBooking:
    def test_confirmed_dates_cannot_be_booked_again(self, demo_host, free_dates):
        first, second, third = _renter(), _renter(), _renter()
        pickup, drop = free_dates(3)

        a = _book(first, DEMO_CAR, pickup, drop)
        b = _book(second, DEMO_CAR, pickup + timedelta(days=1), drop + timedelta(days=1))
        assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)

        accepted = requests.post(f"{API}/vendor/bookings/{a.json()['booking_id']}/accept", headers=demo_host)
        assert accepted.status_code == 200, accepted.text

        clashing = next(x for x in requests.get(f"{API}/bookings", headers=_hdr(second)).json()
                        if x["booking_id"] == b.json()["booking_id"])
        assert clashing["status"] == "declined"
        assert clashing["decline_reason"] == "Dates no longer available"

        overlap = _book(third, DEMO_CAR, pickup + timedelta(hours=6), drop - timedelta(hours=6))
        assert overlap.status_code == 409

        back_to_back = _book(third, DEMO_CAR, drop + timedelta(hours=1), drop + timedelta(days=1))
        assert back_to_back.status_code == 200, back_to_back.text

        availability = requests.get(f"{API}/cars/{DEMO_CAR}/availability").json()
        assert any(r["start"] <= pickup.strftime("%Y-%m-%dT%H:%M:%SZ") < r["end"] for r in availability["booked"])

    def test_accept_rechecks_availability(self, demo_host, db, free_dates):
        first, second = _renter(), _renter()
        pickup, drop = free_dates()
        a = _book(first, DEMO_CAR, pickup, drop).json()["booking_id"]
        b = _book(second, DEMO_CAR, pickup, drop).json()["booking_id"]
        # simulate a request that slipped past the automatic decline
        assert requests.post(f"{API}/vendor/bookings/{a}/accept", headers=demo_host).status_code == 200
        _run(db.bookings.update_one({"booking_id": b}, {"$set": {"status": "pending", "auto_declined": False}}))

        r = requests.post(f"{API}/vendor/bookings/{b}/accept", headers=demo_host)
        assert r.status_code == 409
        state = _run(db.bookings.find_one({"booking_id": b}, {"_id": 0, "status": 1}))
        assert state["status"] == "declined"

    def test_blocked_dates_are_unavailable(self, demo_host, free_dates):
        renter = _renter()
        pickup, drop = free_dates()
        day = pickup.astimezone(MARKET_TZ).date().isoformat()
        blocked = requests.post(f"{API}/vendor/cars/{DEMO_CAR}/block", json={"dates": [day]}, headers=demo_host)
        assert blocked.status_code == 200, blocked.text
        try:
            r = _book(renter, DEMO_CAR, pickup, drop)
            assert r.status_code == 409
            assert day in requests.get(f"{API}/cars/{DEMO_CAR}/availability").json()["blocked_dates"]
        finally:
            requests.post(f"{API}/vendor/cars/{DEMO_CAR}/unblock", json={"dates": [day]}, headers=demo_host)

    def test_cannot_block_dates_with_confirmed_booking(self, demo_host, free_dates):
        renter = _renter()
        pickup, drop = free_dates()
        bid = _book(renter, DEMO_CAR, pickup, drop).json()["booking_id"]
        assert requests.post(f"{API}/vendor/bookings/{bid}/accept", headers=demo_host).status_code == 200
        day = (pickup + timedelta(days=1)).date().isoformat()
        r = requests.post(f"{API}/vendor/cars/{DEMO_CAR}/block", json={"dates": [day]}, headers=demo_host)
        assert r.status_code == 409

    def test_invalid_block_dates_rejected(self, demo_host):
        r = requests.post(f"{API}/vendor/cars/{DEMO_CAR}/block", json={"dates": ["01/02/2031"]}, headers=demo_host)
        assert r.status_code == 400


class TestTripCompletion:
    def test_trips_finish_without_renter_opening_app(self, demo_host, db, free_dates):
        renter = _renter()
        pickup, drop = free_dates()
        bid = _book(renter, DEMO_CAR, pickup, drop).json()["booking_id"]
        assert requests.post(f"{API}/vendor/bookings/{bid}/accept", headers=demo_host).status_code == 200

        ended = datetime.now(timezone.utc) - timedelta(hours=1)
        _run(db.bookings.update_one({"booking_id": bid}, {"$set": {
            "pickup_datetime": (ended - timedelta(days=2)).isoformat(),
            "drop_datetime": ended.isoformat(),
            "pickup_at": (ended - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "drop_at": ended.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }}))
        assert requests.get(f"{API}/vendor/dashboard", headers=demo_host).status_code == 200
        state = _run(db.bookings.find_one({"booking_id": bid}, {"_id": 0, "status": 1, "completed_at": 1}))
        assert state["status"] == "completed"
        assert state.get("completed_at")


class TestRenterPrivacy:
    def test_contact_details_only_after_acceptance(self, demo_host, free_dates):
        renter = _renter("TEST_rules_private")
        pickup, drop = free_dates()
        bid = _book(renter, DEMO_CAR, pickup, drop).json()["booking_id"]

        requests_list = requests.get(f"{API}/vendor/requests", headers=demo_host).json()["requests"]
        card = next(x for x in requests_list if x["booking_id"] == bid)["renter"]
        for field in ("email", "phone", "dob", "address", "license_no"):
            assert field not in card
        pending = next(x for x in requests.get(f"{API}/vendor/bookings", headers=demo_host).json()
                       if x["booking_id"] == bid)
        assert pending["customer_email"] == "" and pending["customer_phone"] == ""

        assert requests.post(f"{API}/vendor/bookings/{bid}/accept", headers=demo_host).status_code == 200
        confirmed = next(x for x in requests.get(f"{API}/vendor/bookings", headers=demo_host).json()
                         if x["booking_id"] == bid)
        assert confirmed["customer_phone"] == RENTER_PROFILE["phone"]
        assert confirmed["customer_license_no"] == RENTER_PROFILE["license_no"]
        assert confirmed["customer_email"].endswith("@example.com")
        assert RENTER_PROFILE["address_line1"] not in str(confirmed)
        assert RENTER_PROFILE["dob"] not in str(confirmed)
