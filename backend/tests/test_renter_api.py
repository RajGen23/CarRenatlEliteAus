"""Backend API tests: renter flows (cars, bookings, reviews, wishlist)."""
import os
import pytest
import requests
import asyncio
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from settings import API


TOKEN = "test_session_token_123"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture(scope="session", autouse=True)
def seed_user():
    """Seed test user/session before all tests."""
    async def _seed():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.bookings.delete_many({"user_id": "user_test_1"})
        await db.reviews.delete_many({"user_id": "user_test_1"})
        await db.wishlist.delete_many({"user_id": "user_test_1"})
        await db.users.update_one(
            {"user_id": "user_test_1"},
            {"$set": {
                "user_id": "user_test_1",
                "email": "test@elitereserve.example",
                "name": "Test Driver",
                "picture": None,
                "wallet_balance": 10000.0,
                "renter_profile": {
                    "full_name": "Test Driver", "phone": "+61 400 000 001", "dob": "1990-01-01",
                    "address_line1": "1 Test St", "city": "Melbourne", "state": "VIC", "postcode": "3000",
                    "license_no": "TEST-DL-1", "license_expiry": "2030-01-01",
                },
            }},
            upsert=True,
        )
        await db.user_sessions.update_one(
            {"session_token": TOKEN},
            {"$set": {
                "session_token": TOKEN,
                "user_id": "user_test_1",
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                "created_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        client.close()
    asyncio.get_event_loop().run_until_complete(_seed())
    yield


# HEALTH
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# CARS
class TestCars:
    def test_list_cars_returns_12(self):
        r = requests.get(f"{API}/cars")
        assert r.status_code == 200
        cars = r.json()
        assert len(cars) >= 12
        assert all("car_id" in c and "brand" in c for c in cars)

    def test_filter_category_sports(self):
        r = requests.get(f"{API}/cars", params={"category": "Sports"})
        assert r.status_code == 200
        cars = r.json()
        assert len(cars) > 0
        assert all(c["category"] == "Sports" for c in cars)

    def test_search_tesla(self):
        r = requests.get(f"{API}/cars", params={"search": "Tesla"})
        assert r.status_code == 200
        cars = r.json()
        assert len(cars) >= 1
        assert any("Tesla" in c["brand"] for c in cars)

    def test_sort_price_asc(self):
        r = requests.get(f"{API}/cars", params={"sort": "price_asc"})
        cars = r.json()
        prices = [c["price_per_day"] for c in cars]
        assert prices == sorted(prices)

    def test_sort_price_desc(self):
        r = requests.get(f"{API}/cars", params={"sort": "price_desc"})
        cars = r.json()
        prices = [c["price_per_day"] for c in cars]
        assert prices == sorted(prices, reverse=True)

    def test_sort_rating(self):
        r = requests.get(f"{API}/cars", params={"sort": "rating"})
        cars = r.json()
        ratings = [c["rating"] for c in cars]
        assert ratings == sorted(ratings, reverse=True)

    def test_featured_returns_up_to_5(self):
        r = requests.get(f"{API}/cars/featured")
        assert r.status_code == 200
        cars = r.json()
        assert len(cars) <= 5
        ratings = [c["rating"] for c in cars]
        assert ratings == sorted(ratings, reverse=True)

    def test_get_car_by_id(self):
        r = requests.get(f"{API}/cars/car_tesla_plaid")
        assert r.status_code == 200
        assert r.json()["brand"] == "Tesla"

    def test_get_car_404(self):
        r = requests.get(f"{API}/cars/nonexistent_xyz")
        assert r.status_code == 404


# COUPONS
class TestCoupons:
    def test_list_coupons(self):
        r = requests.get(f"{API}/coupons")
        assert r.status_code == 200
        codes = {c["code"] for c in r.json()}
        assert {"LUXURY10", "WEEKEND20", "VIP30"}.issubset(codes)

    def test_validate_valid(self):
        r = requests.post(f"{API}/coupons/validate", json={"code": "LUXURY10", "subtotal": 1000})
        assert r.status_code == 200
        d = r.json()
        assert d["discount_pct"] == 10
        assert d["discount"] == 100.0

    def test_validate_invalid(self):
        r = requests.post(f"{API}/coupons/validate", json={"code": "FAKE99", "subtotal": 1000})
        assert r.status_code == 404


# AUTH
class TestAuth:
    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self):
        r = requests.get(f"{API}/auth/me", headers=AUTH)
        assert r.status_code == 200
        u = r.json()
        assert u["user_id"] == "user_test_1"
        assert u["email"] == "test@elitereserve.example"

    def test_logout_invalidates_session(self):
        # logout
        r = requests.post(f"{API}/auth/logout", headers=AUTH)
        assert r.status_code == 200
        # subsequent /me must be 401
        r2 = requests.get(f"{API}/auth/me", headers=AUTH)
        assert r2.status_code == 401
        # re-seed session for downstream tests
        async def _reseed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            await db.user_sessions.update_one(
                {"session_token": TOKEN},
                {"$set": {
                    "session_token": TOKEN,
                    "user_id": "user_test_1",
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                    "created_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            client.close()
        asyncio.get_event_loop().run_until_complete(_reseed())


# BOOKINGS
class TestBookings:
    booking_id = None

    def test_create_booking_with_coupon(self):
        # reset wallet for clean test
        async def _reset():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            await db.users.update_one({"user_id": "user_test_1"}, {"$set": {"wallet_balance": 10000.0}})
            client.close()
        asyncio.get_event_loop().run_until_complete(_reset())

        base = datetime.now(timezone.utc).replace(microsecond=0)
        pickup = (base + timedelta(days=1)).isoformat()
        drop = (base + timedelta(days=3)).isoformat()
        payload = {
            "car_id": "car_tesla_plaid",  # 890/day
            "pickup_location": "JFK",
            "drop_location": "LGA",
            "pickup_datetime": pickup,
            "drop_datetime": drop,
            "coupon_code": "LUXURY10",
            "payment_method": "wallet",
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=AUTH)
        assert r.status_code == 200, r.text
        b = r.json()
        TestBookings.booking_id = b["booking_id"]
        # 2 days * 890 = 1780, discount 10% = 178, taxes 8% of 1602 = 128.16, total = 1730.16
        assert b["subtotal"] == 1780.0
        assert b["discount"] == 178.0
        assert b["coupon_code"] == "LUXURY10"
        assert b["status"] == "pending"
        assert b["total"] == round(1780 - 178 + (1780 - 178) * 0.08, 2)

        # the renter is only charged once the host accepts the request
        me = requests.get(f"{API}/auth/me", headers=AUTH).json()
        assert me["wallet_balance"] == 10000.0

    def test_list_my_bookings(self):
        r = requests.get(f"{API}/bookings", headers=AUTH)
        assert r.status_code == 200
        bookings = r.json()
        assert any(b["booking_id"] == TestBookings.booking_id for b in bookings)

    def test_cancel_pending_request_refunds_nothing(self):
        bid = TestBookings.booking_id
        assert bid
        # get total
        bookings = requests.get(f"{API}/bookings", headers=AUTH).json()
        bk = next(b for b in bookings if b["booking_id"] == bid)
        before_balance = requests.get(f"{API}/auth/me", headers=AUTH).json()["wallet_balance"]

        r = requests.post(f"{API}/bookings/{bid}/cancel", headers=AUTH)
        assert r.status_code == 200
        refund = r.json()["refund"]
        assert bk["status"] == "pending"
        assert refund == 0.0

        after_balance = requests.get(f"{API}/auth/me", headers=AUTH).json()["wallet_balance"]
        assert after_balance == before_balance

        # status updated
        bookings2 = requests.get(f"{API}/bookings", headers=AUTH).json()
        bk2 = next(b for b in bookings2 if b["booking_id"] == bid)
        assert bk2["status"] == "cancelled"


# REVIEWS
class TestReviews:
    def test_create_and_get_review(self):
        r = requests.post(
            f"{API}/reviews",
            json={"car_id": "car_lambo_aventador", "rating": 5, "comment": "TEST_amazing"},
            headers=AUTH,
        )
        assert r.status_code == 200
        rid = r.json()["review_id"]
        assert rid.startswith("rv_")

        r2 = requests.get(f"{API}/cars/car_lambo_aventador/reviews")
        assert r2.status_code == 200
        reviews = r2.json()
        assert any(rv["review_id"] == rid for rv in reviews)


# WISHLIST
class TestWishlist:
    def test_add_get_remove(self):
        # add
        r = requests.post(f"{API}/wishlist/car_porsche_911", headers=AUTH)
        assert r.status_code == 200
        # get
        r2 = requests.get(f"{API}/wishlist", headers=AUTH)
        assert r2.status_code == 200
        cars = r2.json()
        assert any(c["car_id"] == "car_porsche_911" for c in cars)
        # remove
        r3 = requests.delete(f"{API}/wishlist/car_porsche_911", headers=AUTH)
        assert r3.status_code == 200
        r4 = requests.get(f"{API}/wishlist", headers=AUTH).json()
        assert not any(c["car_id"] == "car_porsche_911" for c in r4)


# WALLET
class TestWallet:
    def test_get_balance(self):
        r = requests.get(f"{API}/wallet", headers=AUTH)
        assert r.status_code == 200
        assert "balance" in r.json()

    def test_topup_increments(self):
        before = requests.get(f"{API}/wallet", headers=AUTH).json()["balance"]
        r = requests.post(f"{API}/wallet/topup", json={"amount": 500.0}, headers=AUTH)
        assert r.status_code == 200
        after = r.json()["balance"]
        assert round(after - before, 2) == 500.0

    def test_topup_negative_rejected(self):
        r = requests.post(f"{API}/wallet/topup", json={"amount": -10}, headers=AUTH)
        assert r.status_code == 400
