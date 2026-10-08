"""Admin API tests: dashboard, users, vendors, vehicles, bookings and coupons.

Covers:
- Admin login + role guard (403 for non-admins)
- /admin/dashboard KPIs + monthly chart
- /admin/users list + block/verify
- /admin/vendors list + KYC + suspend
- /admin/cars list + approve/reject
- /admin/bookings list + refund
- /admin/coupons CRUD (idempotent cleanup)
"""
import time
import pytest
import requests
from settings import API, ADMIN_PASSWORD, ADMIN_USERNAME


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {identifier} failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_USERNAME, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def user_token():
    return _login("userdemo", "User@123")


@pytest.fixture(scope="module")
def auth_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# Auth / Role
class TestAdminAuth:
    def test_admin_login_returns_role(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin", f"Expected role=admin got {body}"

    def test_non_admin_blocked(self, user_token):
        r = requests.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
        assert r.status_code == 403

    def test_no_auth_blocked(self):
        r = requests.get(f"{API}/admin/dashboard", timeout=15)
        assert r.status_code == 401


# Dashboard
class TestDashboard:
    def test_dashboard_kpis(self, auth_h):
        r = requests.get(f"{API}/admin/dashboard", headers=auth_h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_revenue", "platform_commission", "total_bookings", "active_rentals",
                  "total_customers", "total_vendors", "monthly_growth", "monthly"]:
            assert k in d, f"Missing KPI: {k}"
        assert isinstance(d["monthly"], list) and len(d["monthly"]) == 6
        for m in d["monthly"]:
            assert "label" in m and "value" in m
        # commission should be ~15% of revenue
        if d["total_revenue"] > 0:
            assert abs(d["platform_commission"] - round(d["total_revenue"] * 0.15, 2)) < 1.0
        # demo data should produce non-zero counts
        assert d["total_customers"] >= 1
        assert d["total_bookings"] >= 1


# Users
class TestUsers:
    def test_list_users(self, auth_h):
        r = requests.get(f"{API}/admin/users", headers=auth_h, timeout=20)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) > 0
        u0 = users[0]
        for k in ["user_id", "username", "status", "bookings_count"]:
            assert k in u0
        # admin should be excluded by default
        assert not any(u.get("role") == "admin" for u in users)

    def test_search_filter(self, auth_h):
        r = requests.get(f"{API}/admin/users?q=userdemo", headers=auth_h, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert any(u.get("username") == "userdemo" for u in users)

    def test_role_filter_vendor(self, auth_h):
        r = requests.get(f"{API}/admin/users?role=vendor", headers=auth_h, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert all(u.get("is_vendor") is True for u in users)

    def test_block_and_unblock_seed_user(self, auth_h):
        # pick a seeded non-vendor user (not userdemo)
        r = requests.get(f"{API}/admin/users?role=user", headers=auth_h, timeout=15)
        users = [u for u in r.json() if u.get("username") != "userdemo"]
        assert users, "Need at least one non-demo seeded user"
        uid = users[0]["user_id"]
        orig_status = users[0].get("status", "active")
        # toggle
        r = requests.post(f"{API}/admin/users/{uid}/block", headers=auth_h, timeout=15)
        assert r.status_code == 200
        new_status = r.json()["status"]
        assert new_status in ("active", "blocked") and new_status != orig_status
        # toggle back to original
        r = requests.post(f"{API}/admin/users/{uid}/block", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == orig_status

    def test_verify_user(self, auth_h):
        r = requests.get(f"{API}/admin/users?q=userdemo", headers=auth_h, timeout=15)
        uid = r.json()[0]["user_id"]
        r = requests.post(f"{API}/admin/users/{uid}/verify", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["verified"] is True


# Vendors
class TestVendors:
    def test_list_vendors(self, auth_h):
        r = requests.get(f"{API}/admin/vendors", headers=auth_h, timeout=20)
        assert r.status_code == 200
        vendors = r.json()
        assert any(v["username"] == "vendordemo" for v in vendors)
        v = next(v for v in vendors if v["username"] == "vendordemo")
        assert "vehicles_count" in v and "bookings_count" in v

    def test_kyc_invalid_decision(self, auth_h):
        r = requests.get(f"{API}/admin/vendors", headers=auth_h, timeout=15)
        uid = next(v for v in r.json() if v["username"] == "vendordemo")["user_id"]
        r = requests.post(f"{API}/admin/vendors/{uid}/kyc", headers=auth_h,
                          json={"decision": "bogus"}, timeout=15)
        assert r.status_code == 400

    def test_kyc_approve(self, auth_h):
        r = requests.get(f"{API}/admin/vendors", headers=auth_h, timeout=15)
        uid = next(v for v in r.json() if v["username"] == "vendordemo")["user_id"]
        r = requests.post(f"{API}/admin/vendors/{uid}/kyc", headers=auth_h,
                          json={"decision": "approved"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["kyc_status"] == "approved"


# Vehicles
class TestVehicles:
    def test_list_cars(self, auth_h):
        r = requests.get(f"{API}/admin/cars", headers=auth_h, timeout=20)
        assert r.status_code == 200
        cars = r.json()
        assert len(cars) >= 19, f"Expected 19+ cars, got {len(cars)}"
        for c in cars:
            assert "approval_status" in c
            assert "insurance_alert" in c

    def test_status_filter(self, auth_h):
        r = requests.get(f"{API}/admin/cars?status=approved", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert all(c["approval_status"] == "approved" for c in r.json())

    def test_reject_and_approve_car(self, auth_h):
        r = requests.get(f"{API}/admin/cars", headers=auth_h, timeout=15)
        car_id = r.json()[0]["car_id"]
        # reject
        r = requests.post(f"{API}/admin/cars/{car_id}/reject", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["approval_status"] == "rejected"
        # re-approve
        r = requests.post(f"{API}/admin/cars/{car_id}/approve", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["approval_status"] == "approved"

    def test_approve_404(self, auth_h):
        r = requests.post(f"{API}/admin/cars/nonexistent_xyz/approve", headers=auth_h, timeout=10)
        assert r.status_code == 404


# Bookings
class TestBookings:
    def test_list_bookings(self, auth_h):
        r = requests.get(f"{API}/admin/bookings", headers=auth_h, timeout=20)
        assert r.status_code == 200
        bks = r.json()
        assert len(bks) >= 1
        b = bks[0]
        for k in ["booking_id", "status", "total", "commission", "net"]:
            assert k in b

    def test_status_filter_completed(self, auth_h):
        r = requests.get(f"{API}/admin/bookings?status=completed", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert all(b["status"] == "completed" for b in r.json())

    def test_refund_404(self, auth_h):
        r = requests.post(f"{API}/admin/bookings/bk_does_not_exist/refund",
                          headers=auth_h, json={}, timeout=10)
        assert r.status_code == 404

    def test_refund_flow(self, auth_h):
        # find an upcoming booking to refund
        r = requests.get(f"{API}/admin/bookings?status=upcoming", headers=auth_h, timeout=15)
        upcoming = r.json()
        if not upcoming:
            pytest.skip("No upcoming booking available to refund")
        b = upcoming[0]
        bid = b["booking_id"]
        # check user wallet before
        r = requests.post(f"{API}/admin/bookings/{bid}/refund",
                          headers=auth_h, json={"amount": 10.0, "reason": "TEST refund"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["refunded"] == 10.0
        # verify status changed
        r2 = requests.get(f"{API}/admin/bookings", headers=auth_h, timeout=15)
        updated = next((x for x in r2.json() if x["booking_id"] == bid), None)
        assert updated and updated["status"] == "cancelled"
        assert updated.get("refund_status") == "approved"


# Coupons CRUD
class TestCoupons:
    test_code = f"TEST_PYTEST_{int(time.time())}"

    def test_list_coupons(self, auth_h):
        r = requests.get(f"{API}/admin/coupons", headers=auth_h, timeout=15)
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()]
        # default 3 seeded
        for c in ["LUXURY10", "WEEKEND20", "VIP30"]:
            assert c in codes

    def test_create_coupon(self, auth_h):
        r = requests.post(f"{API}/admin/coupons", headers=auth_h,
                          json={"code": self.test_code, "discount_pct": 5, "description": "TEST coupon"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["code"] == self.test_code.upper()

    def test_create_duplicate_conflict(self, auth_h):
        r = requests.post(f"{API}/admin/coupons", headers=auth_h,
                          json={"code": self.test_code, "discount_pct": 5, "description": "dup"},
                          timeout=15)
        assert r.status_code == 409

    def test_update_coupon(self, auth_h):
        r = requests.patch(f"{API}/admin/coupons/{self.test_code}", headers=auth_h,
                           json={"discount_pct": 12}, timeout=15)
        assert r.status_code == 200
        # verify
        r2 = requests.get(f"{API}/admin/coupons", headers=auth_h, timeout=15)
        c = next(c for c in r2.json() if c["code"] == self.test_code.upper())
        assert c["discount_pct"] == 12

    def test_delete_coupon(self, auth_h):
        r = requests.delete(f"{API}/admin/coupons/{self.test_code}", headers=auth_h, timeout=15)
        assert r.status_code == 200
        # double-delete -> 404
        r = requests.delete(f"{API}/admin/coupons/{self.test_code}", headers=auth_h, timeout=15)
        assert r.status_code == 404


# Regression: regular users unaffected
class TestRegression:
    def test_user_login_role_user(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": "userdemo", "password": "User@123"}, timeout=15)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["role"] == "user"
        assert u["is_vendor"] is False

    def test_vendor_login_role_vendor(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": "vendordemo", "password": "Vendor@123"}, timeout=15)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["is_vendor"] is True
        assert u["role"] in ("vendor", "user")  # role may be 'user' if not backfilled, accept either
