"""Username and password authentication API tests."""
import os
import asyncio
import pytest
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from settings import API


def _reset_demo_lockouts():
    """Make demo accounts safe for repeated runs (clear lockout/failed counters)."""
    async def _r():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.users.update_many(
            {"username": {"$in": ["userdemo", "vendordemo"]}},
            {"$set": {"failed_login_attempts": 0, "locked_until": None}},
        )
        client.close()
    asyncio.get_event_loop().run_until_complete(_r())


@pytest.fixture(scope="session", autouse=True)
def _prep():
    _reset_demo_lockouts()
    yield
    _reset_demo_lockouts()


# Seeded demo accounts
class TestSeededAccounts:
    def test_login_userdemo_username(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": "userdemo", "password": "User@123"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_token" in d and len(d["session_token"]) > 20
        u = d["user"]
        assert u["username"] == "userdemo"
        assert u["is_vendor"] is False
        assert u["wallet_balance"] == 5000.0

    def test_login_userdemo_via_email(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": "userdemo@elitereserve.example", "password": "User@123"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["username"] == "userdemo"

    def test_login_vendordemo(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": "vendordemo", "password": "Vendor@123"})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["is_vendor"] is True
        assert u["username"] == "vendordemo"
        token = r.json()["session_token"]
        # /vendor/me must contain vendor profile
        v = requests.get(f"{API}/vendor/me", headers={"Authorization": f"Bearer {token}"})
        assert v.status_code == 200
        vp = v.json()["vendor_profile"]
        assert vp["company"] == "LuxFleet Melbourne Pty Ltd"
        assert vp["kyc_status"] == "approved"

    def test_vendordemo_has_two_seeded_cars(self):
        login = requests.post(f"{API}/auth/login", json={"identifier": "vendordemo", "password": "Vendor@123"}).json()
        token = login["session_token"]
        r = requests.get(f"{API}/vendor/cars", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        cars = r.json()
        ids = {c["car_id"] for c in cars}
        assert "vcar_demo_porsche_911" in ids
        assert "vcar_demo_range_rover" in ids


# Failure & lockout
class TestLoginFailures:
    def test_login_unknown_user(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": "no_such_user_xyz", "password": "whatever"})
        assert r.status_code == 401
        assert "Invalid username or password" in r.json()["detail"]

    def test_wrong_password_then_lockout_then_recover(self):
        _reset_demo_lockouts()
        # 5 failed attempts -> lockout (429)
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"identifier": "userdemo", "password": "WRONG_pw_" + str(i)})
            assert r.status_code == 401, f"attempt {i}: {r.status_code} {r.text}"
        # 6th attempt should be locked (429)
        r6 = requests.post(f"{API}/auth/login", json={"identifier": "userdemo", "password": "User@123"})
        assert r6.status_code == 429, r6.text

        # verify failed_login_attempts in DB
        async def _check():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            u = await db.users.find_one({"username": "userdemo"})
            client.close()
            return u
        u = asyncio.get_event_loop().run_until_complete(_check())
        assert int(u.get("failed_login_attempts", 0)) >= 5
        assert u.get("locked_until") is not None

        # clear lockout window and verify correct pw works again
        _reset_demo_lockouts()
        ok = requests.post(f"{API}/auth/login", json={"identifier": "userdemo", "password": "User@123"})
        assert ok.status_code == 200, ok.text


# Register flow
class TestRegister:
    new_username = f"test_user_{int(datetime.now(timezone.utc).timestamp())}"

    def test_register_success(self):
        r = requests.post(f"{API}/auth/register", json={
            "username": self.new_username,
            "password": "Passw0rd!",
            "name": "TEST_Newbie",
            "email": f"{self.new_username}@test.local",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_token" in d
        assert d["user"]["username"] == self.new_username
        assert d["user"]["wallet_balance"] == 5000.0
        TestRegister.token = d["session_token"]

    def test_register_duplicate_username(self):
        r = requests.post(f"{API}/auth/register", json={
            "username": self.new_username,
            "password": "Anotherpw1",
        })
        assert r.status_code == 409

    def test_register_weak_password(self):
        r = requests.post(f"{API}/auth/register", json={"username": f"x_{self.new_username}", "password": "123"})
        assert r.status_code == 400

    def test_register_invalid_username_chars(self):
        r = requests.post(f"{API}/auth/register", json={"username": "bad name!", "password": "Goodpw1"})
        assert r.status_code == 400

    def test_me_with_registered_token(self):
        token = TestRegister.token
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["username"] == self.new_username

    def test_logout_invalidates_token(self):
        token = TestRegister.token
        r = requests.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 401


# Idempotency of seed
class TestSeedIdempotency:
    def test_only_one_userdemo(self):
        async def _count():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            n_u = await db.users.count_documents({"username": "userdemo"})
            n_v = await db.users.count_documents({"username": "vendordemo"})
            n_c = await db.cars.count_documents({"car_id": {"$in": ["vcar_demo_porsche_911", "vcar_demo_range_rover"]}})
            client.close()
            return n_u, n_v, n_c
        n_u, n_v, n_c = asyncio.get_event_loop().run_until_complete(_count())
        assert n_u == 1
        assert n_v == 1
        assert n_c == 2


# Consumer regression with the NEW login token
class TestConsumerRegressionWithNewToken:
    @classmethod
    def setup_class(cls):
        _reset_demo_lockouts()
        r = requests.post(f"{API}/auth/login", json={"identifier": "userdemo", "password": "User@123"})
        assert r.status_code == 200, r.text
        cls.token = r.json()["session_token"]
        cls.auth = {"Authorization": f"Bearer {cls.token}"}

    def test_wallet(self):
        r = requests.get(f"{API}/wallet", headers=self.auth)
        assert r.status_code == 200
        assert r.json()["balance"] >= 0

    def test_list_cars(self):
        r = requests.get(f"{API}/cars")
        assert r.status_code == 200
        assert len(r.json()) >= 12

    def test_coupons(self):
        r = requests.get(f"{API}/coupons")
        assert r.status_code == 200
        codes = {c["code"] for c in r.json()}
        assert {"LUXURY10", "WEEKEND20", "VIP30"}.issubset(codes)

    def test_bookings_list(self):
        r = requests.get(f"{API}/bookings", headers=self.auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
