"""Vendor (host) API tests: onboarding, fleet management, bookings and earnings."""
import os
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from settings import API


# Two test users: a vendor (user_test_vendor) and a non-vendor (user_test_renter)
VENDOR_TOKEN = "test_vendor_token_111"
RENTER_TOKEN = "test_renter_token_222"
VAUTH = {"Authorization": f"Bearer {VENDOR_TOKEN}"}
RAUTH = {"Authorization": f"Bearer {RENTER_TOKEN}"}


@pytest.fixture(scope="session", autouse=True)
def seed_vendor_data():
    async def _seed():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        # Wipe prior test docs for these two users
        for uid in ("user_test_vendor", "user_test_renter"):
            await db.bookings.delete_many({"user_id": uid})
        await db.cars.delete_many({"vendor_id": "user_test_vendor"})
        await db.vendor_payouts.delete_many({"vendor_id": "user_test_vendor"})

        # Vendor user (starts as NON-vendor; onboarding test will flip is_vendor)
        await db.users.update_one(
            {"user_id": "user_test_vendor"},
            {"$set": {
                "user_id": "user_test_vendor",
                "email": "TEST_vendor@elitereserve.example",
                "name": "Vendor Tester",
                "picture": None,
                "wallet_balance": 50000.0,
                "is_vendor": False,
            }, "$unset": {"vendor_profile": ""}},
            upsert=True,
        )
        # Renter user (will remain non-vendor for 403 tests)
        await db.users.update_one(
            {"user_id": "user_test_renter"},
            {"$set": {
                "user_id": "user_test_renter",
                "email": "TEST_renter@elitereserve.example",
                "name": "Renter Tester",
                "picture": None,
                "wallet_balance": 50000.0,
                "is_vendor": False,
            }},
            upsert=True,
        )
        now = datetime.now(timezone.utc)
        exp = now + timedelta(days=7)
        for tok, uid in [(VENDOR_TOKEN, "user_test_vendor"), (RENTER_TOKEN, "user_test_renter")]:
            await db.user_sessions.update_one(
                {"session_token": tok},
                {"$set": {"session_token": tok, "user_id": uid, "expires_at": exp, "created_at": now}},
                upsert=True,
            )
        client.close()
    asyncio.get_event_loop().run_until_complete(_seed())
    yield


# Before onboarding: auth/me and 403 for non-vendors
class TestVendorAuth:
    def test_me_returns_is_vendor_false_before_onboard(self):
        r = requests.get(f"{API}/auth/me", headers=VAUTH)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["is_vendor"] is False
        assert "wallet_balance" in u

    def test_non_vendor_blocked_from_dashboard(self):
        r = requests.get(f"{API}/vendor/dashboard", headers=RAUTH)
        assert r.status_code == 403

    def test_non_vendor_blocked_from_cars_list(self):
        r = requests.get(f"{API}/vendor/cars", headers=RAUTH)
        assert r.status_code == 403

    def test_non_vendor_blocked_from_post_car(self):
        r = requests.post(f"{API}/vendor/cars", headers=RAUTH, json={
            "brand": "X", "model": "Y", "category": "SUV", "price_per_day": 100,
            "fuel_type": "Petrol", "transmission": "Auto", "seats": 4,
            "image": "https://example.com/x.jpg", "description": "t",
        })
        assert r.status_code == 403

    def test_non_vendor_blocked_from_bookings(self):
        r = requests.get(f"{API}/vendor/bookings", headers=RAUTH)
        assert r.status_code == 403

    def test_non_vendor_blocked_from_revenue(self):
        r = requests.get(f"{API}/vendor/revenue", headers=RAUTH)
        assert r.status_code == 403

    def test_non_vendor_blocked_from_payouts(self):
        r = requests.post(f"{API}/vendor/payouts", headers=RAUTH, json={"amount": 100})
        assert r.status_code == 403


# Onboarding
class TestVendorOnboard:
    def test_onboard_flips_is_vendor_and_persists_profile(self):
        payload = {
            "company": "TEST_EliteReserve Hosts Co.",
            "phone": "+61 400 111 222",
            "abn": "12345678901",
            "license_no": "DL-TEST-999",
            "bank_account_name": "Vendor Tester",
            "bank_bsb": "062-000",
            "bank_account_no": "11223344",
        }
        r = requests.post(f"{API}/vendor/onboard", json=payload, headers=VAUTH)
        assert r.status_code == 200, r.text
        # auth/me now reflects is_vendor=true
        me = requests.get(f"{API}/auth/me", headers=VAUTH).json()
        assert me["is_vendor"] is True
        # vendor/me reflects profile
        vm = requests.get(f"{API}/vendor/me", headers=VAUTH).json()
        assert vm["is_vendor"] is True
        assert vm["vendor_profile"]["company"] == payload["company"]
        assert vm["vendor_profile"]["bank_account_no"] == payload["bank_account_no"]

    def test_patch_profile_persists(self):
        r = requests.patch(f"{API}/vendor/profile", json={"company": "TEST_EliteReserve Hosts Updated", "phone": "+61 400 999 000"}, headers=VAUTH)
        assert r.status_code == 200
        vm = requests.get(f"{API}/vendor/me", headers=VAUTH).json()
        assert vm["vendor_profile"]["company"] == "TEST_EliteReserve Hosts Updated"
        assert vm["vendor_profile"]["phone"] == "+61 400 999 000"
        # original fields preserved
        assert vm["vendor_profile"]["bank_account_no"] == "11223344"


# Fleet CRUD
class TestVendorCars:
    created_car_id = None

    def test_initial_vendor_cars_empty(self):
        r = requests.get(f"{API}/vendor/cars", headers=VAUTH)
        assert r.status_code == 200
        assert r.json() == []

    def test_create_vendor_car(self):
        payload = {
            "brand": "TEST_McLaren", "model": "Artura", "category": "Sports",
            "price_per_day": 1100.0, "weekly_price": 6500.0, "security_deposit": 500.0,
            "fuel_type": "Hybrid", "transmission": "Automatic", "seats": 2,
            "image": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
            "gallery": [], "features": ["V6", "Hybrid"], "description": "TEST vendor car",
            "horsepower": 671, "top_speed": 330, "acceleration": "3.0s",
        }
        r = requests.post(f"{API}/vendor/cars", json=payload, headers=VAUTH)
        assert r.status_code == 200, r.text
        car = r.json()
        assert car["vendor_id"] == "user_test_vendor"
        assert car["brand"] == "TEST_McLaren"
        assert car["car_id"].startswith("vcar_")
        # default gallery copied from image
        assert car["gallery"] == [payload["image"]]
        TestVendorCars.created_car_id = car["car_id"]

        # GET /vendor/cars returns it
        listed = requests.get(f"{API}/vendor/cars", headers=VAUTH).json()
        assert any(c["car_id"] == car["car_id"] for c in listed)

        # Public /cars also includes it
        public = requests.get(f"{API}/cars").json()
        assert any(c["car_id"] == car["car_id"] for c in public)

    def test_patch_vendor_car(self):
        cid = TestVendorCars.created_car_id
        assert cid
        r = requests.patch(f"{API}/vendor/cars/{cid}", headers=VAUTH, json={
            "brand": "TEST_McLaren", "model": "Artura GT", "category": "Sports",
            "price_per_day": 1250.0, "fuel_type": "Hybrid", "transmission": "Automatic", "seats": 2,
            "image": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
            "description": "TEST updated", "horsepower": 700,
        })
        assert r.status_code == 200, r.text
        car = r.json()
        assert car["model"] == "Artura GT"
        assert car["price_per_day"] == 1250.0
        assert car["horsepower"] == 700

    def test_block_and_unblock_dates(self):
        cid = TestVendorCars.created_car_id
        dates = ["2030-01-10", "2030-01-11", "2030-01-12"]
        r = requests.post(f"{API}/vendor/cars/{cid}/block", json={"dates": dates}, headers=VAUTH)
        assert r.status_code == 200
        # verify persistence via direct mongo
        async def _fetch():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            car = await db.cars.find_one({"car_id": cid}, {"_id": 0})
            client.close()
            return car
        car = asyncio.get_event_loop().run_until_complete(_fetch())
        assert set(dates).issubset(set(car["blocked_dates"]))

        # unblock partial
        r2 = requests.post(f"{API}/vendor/cars/{cid}/unblock", json={"dates": ["2030-01-11"]}, headers=VAUTH)
        assert r2.status_code == 200
        car2 = asyncio.get_event_loop().run_until_complete(_fetch())
        assert "2030-01-11" not in car2["blocked_dates"]
        assert "2030-01-10" in car2["blocked_dates"]

    def test_delete_404_when_not_owner(self):
        # Onboard renter as a separate vendor (so 403 doesn't short-circuit), then DELETE someone else's car
        # Simpler: try to DELETE a seed car (no vendor_id) — should 404
        r = requests.delete(f"{API}/vendor/cars/car_tesla_plaid", headers=VAUTH)
        assert r.status_code == 404

    def test_delete_owned_car(self):
        # Create a throwaway car
        payload = {
            "brand": "TEST_TempCar", "model": "Z", "category": "SUV", "price_per_day": 100.0,
            "fuel_type": "Petrol", "transmission": "Automatic", "seats": 4,
            "image": "https://example.com/z.jpg", "description": "TEST",
        }
        r = requests.post(f"{API}/vendor/cars", json=payload, headers=VAUTH)
        cid = r.json()["car_id"]
        d = requests.delete(f"{API}/vendor/cars/{cid}", headers=VAUTH)
        assert d.status_code == 200
        # Verify gone
        listed = requests.get(f"{API}/vendor/cars", headers=VAUTH).json()
        assert not any(c["car_id"] == cid for c in listed)


# Bookings on a host car, dashboard, revenue and payouts
class TestVendorBookingsRevenue:
    def test_seed_completed_booking_for_dashboard(self):
        """Insert a completed booking directly so dashboard/revenue math is exercised."""
        cid = TestVendorCars.created_car_id
        assert cid
        async def _insert():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            now = datetime.now(timezone.utc)
            await db.bookings.insert_one({
                "booking_id": "bk_TEST_completed_1",
                "user_id": "user_test_renter",
                "car_id": cid,
                "car_brand": "TEST_McLaren", "car_model": "Artura GT",
                "car_image": "https://example.com/x.jpg",
                "pickup_location": "MEL", "drop_location": "MEL",
                "pickup_datetime": (now - timedelta(days=10)).isoformat(),
                "drop_datetime": (now - timedelta(days=8)).isoformat(),
                "days": 2,
                "subtotal": 2500.0, "discount": 0.0, "taxes": 200.0, "total": 2500.0,
                "coupon_code": None, "status": "completed", "payment_method": "wallet",
                "created_at": now.isoformat(),
            })
            client.close()
        asyncio.get_event_loop().run_until_complete(_insert())

    def test_dashboard_kpis(self):
        r = requests.get(f"{API}/vendor/dashboard", headers=VAUTH)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_vehicles"] >= 1
        assert d["completed_rentals"] >= 1
        assert d["gross_revenue"] >= 2500.0
        # commission 15%, net 85%
        assert round(d["commission"], 2) == round(d["gross_revenue"] * 0.15, 2)
        assert round(d["net_earnings"], 2) == round(d["gross_revenue"] * 0.85, 2)
        assert 0 <= d["utilization"] <= 100
        assert isinstance(d["monthly"], list)
        assert len(d["monthly"]) == 6
        assert all("label" in m and "value" in m for m in d["monthly"])

    def test_bookings_enriched(self):
        r = requests.get(f"{API}/vendor/bookings", headers=VAUTH)
        assert r.status_code == 200
        bks = r.json()
        assert len(bks) >= 1
        b = next(x for x in bks if x["booking_id"] == "bk_TEST_completed_1")
        assert b["customer_name"] == "Renter Tester"
        assert b["customer_email"] == "TEST_renter@elitereserve.example"
        assert b["commission"] == round(b["total"] * 0.15, 2)
        assert b["net"] == round(b["total"] - b["commission"], 2)

    def test_revenue_breakdown(self):
        r = requests.get(f"{API}/vendor/revenue", headers=VAUTH)
        assert r.status_code == 200, r.text
        rev = r.json()
        assert rev["gross"] >= 2500.0
        assert rev["commission"] == round(rev["gross"] * 0.15, 2)
        # GST 10% on net (gross - commission)
        assert rev["tax"] == round((rev["gross"] - rev["commission"]) * 0.10, 2)
        assert "invoices" in rev and len(rev["invoices"]) >= 1
        inv = rev["invoices"][0]
        assert inv["gross"] > 0
        assert inv["commission"] == round(inv["gross"] * 0.15, 2)
        assert inv["net"] == round(inv["gross"] * 0.85, 2)

    def test_payout_request_and_listing(self):
        before = requests.get(f"{API}/vendor/revenue", headers=VAUTH).json()
        avail_before = before["available"]
        r = requests.post(f"{API}/vendor/payouts", json={"amount": 100.0}, headers=VAUTH)
        assert r.status_code == 200, r.text
        po = r.json()
        assert po["status"] == "processing"
        assert po["amount"] == 100.0
        # bank_last4 is last 4 of bank_account_no '11223344' = '3344'
        assert po["bank_last4"] == "3344"

        after = requests.get(f"{API}/vendor/revenue", headers=VAUTH).json()
        assert any(p["payout_id"] == po["payout_id"] for p in after["payouts"])
        # paid_out includes the new processing payout
        assert round(after["paid_out"] - before["paid_out"], 2) == 100.0
        # available reduced by 100
        assert round(avail_before - after["available"], 2) == 100.0

    def test_payout_negative_rejected(self):
        r = requests.post(f"{API}/vendor/payouts", json={"amount": -50}, headers=VAUTH)
        assert r.status_code == 400
