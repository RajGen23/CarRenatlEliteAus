"""Admin API tests: finance, revenue metrics, featured listings, support and referrals.

Covers:
- /admin/finance, /admin/revenue-metrics, /admin/featured + toggle,
  /admin/subscriptions + set plan
- /admin/support list+filters+reply+status, /admin/referrals + config

Restores state mutated during tests (re-features any car unfeatured,
resets vendordemo to elite plan).
"""
import pytest
import requests
from settings import API, ADMIN_PASSWORD, ADMIN_USERNAME


def _login(identifier: str, password: str) -> str:
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=20,
    )
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


PHASE23_ENDPOINTS = [
    "/admin/finance",
    "/admin/revenue-metrics",
    "/admin/featured",
    "/admin/subscriptions",
    "/admin/support",
    "/admin/referrals",
]


# Auth guards across all 6 new endpoints
class TestReportsAuthGuards:
    @pytest.mark.parametrize("path", PHASE23_ENDPOINTS)
    def test_admin_ok(self, auth_h, path):
        r = requests.get(f"{API}{path}", headers=auth_h, timeout=20)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("path", PHASE23_ENDPOINTS)
    def test_non_admin_forbidden(self, user_token, path):
        r = requests.get(
            f"{API}{path}",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=20,
        )
        assert r.status_code == 403, f"{path} -> {r.status_code}"

    @pytest.mark.parametrize("path", PHASE23_ENDPOINTS)
    def test_no_auth_unauthorized(self, path):
        r = requests.get(f"{API}{path}", timeout=20)
        assert r.status_code == 401, f"{path} -> {r.status_code}"


# Finance
class TestFinance:
    def test_finance_summary_and_monthly(self, auth_h):
        r = requests.get(f"{API}/admin/finance", headers=auth_h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        s = d["summary"]
        for k in ["gross_revenue", "platform_commission", "vendor_payouts",
                  "payouts_due_now", "tax_collected", "gst_on_commission"]:
            assert k in s, f"missing {k}"
        # commission is 15% of gross (within rounding)
        if s["gross_revenue"] > 0:
            assert abs(s["platform_commission"] - round(s["gross_revenue"] * 0.15, 2)) < 1.0
            assert abs(s["vendor_payouts"] - round(s["gross_revenue"] * 0.85, 2)) < 1.0
        # 6 monthly rows
        assert isinstance(d["monthly"], list) and len(d["monthly"]) == 6
        for m in d["monthly"]:
            for k in ["label", "gross", "commission", "payouts", "tax"]:
                assert k in m
        # payouts
        assert isinstance(d["payouts"], list)
        if d["payouts"]:
            p = d["payouts"][0]
            for k in ["vendor_id", "vendor_name", "bookings", "gross",
                      "commission", "due_now", "pending"]:
                assert k in p


# Revenue metrics
class TestRevenueMetrics:
    def test_revenue_metrics_shape(self, auth_h):
        r = requests.get(f"{API}/admin/revenue-metrics", headers=auth_h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["gmv", "abv", "ltv", "cac", "fleet_utilization",
                  "repeat_rate", "bookings_count", "trend"]:
            assert k in d, f"missing {k}"
        # abv == gmv / bookings_count
        if d["bookings_count"] > 0:
            expected = round(d["gmv"] / d["bookings_count"], 2)
            assert abs(d["abv"] - expected) < 0.5
        assert isinstance(d["trend"], list) and len(d["trend"]) == 6
        for t in d["trend"]:
            assert "label" in t and "value" in t


# Featured
class TestFeatured:
    def test_featured_list_and_toggle_roundtrip(self, auth_h):
        r = requests.get(f"{API}/admin/featured", headers=auth_h, timeout=20)
        assert r.status_code == 200
        cars = r.json()
        assert len(cars) >= 1
        for c in cars[:5]:
            for k in ["car_id", "brand", "model", "featured", "vendor_name"]:
                assert k in c
        # pick any car and toggle twice -> back to original
        car = cars[0]
        car_id = car["car_id"]
        original = bool(car["featured"])
        r = requests.post(f"{API}/admin/cars/{car_id}/feature", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["featured"] == (not original)
        # toggle back
        r = requests.post(f"{API}/admin/cars/{car_id}/feature", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["featured"] == original

    def test_feature_invalid_car_404(self, auth_h):
        r = requests.post(f"{API}/admin/cars/bogus_car_xyz/feature", headers=auth_h, timeout=10)
        assert r.status_code == 404

    def test_consumer_featured_sorted_first(self, auth_h):
        # consumer endpoint - usually public; ensure featured cars come first
        r = requests.get(f"{API}/cars/featured", timeout=15)
        if r.status_code != 200:
            pytest.skip(f"/cars/featured returned {r.status_code}")
        items = r.json()
        if not items:
            pytest.skip("No featured items returned")
        # First items should have featured=true if any are flagged
        flagged_seen = False
        for c in items:
            if c.get("featured"):
                flagged_seen = True
            elif flagged_seen:
                # found a non-featured AFTER a featured -> ok
                break
        # If all are non-featured fall through; otherwise the first item must be featured
        any_featured = any(c.get("featured") for c in items)
        if any_featured:
            assert items[0].get("featured") is True, "featured car should be first"


# Subscriptions
class TestSubscriptions:
    def test_list_subscriptions(self, auth_h):
        r = requests.get(f"{API}/admin/subscriptions", headers=auth_h, timeout=20)
        assert r.status_code == 200
        subs = r.json()
        assert isinstance(subs, list)
        # vendordemo must appear
        vd = next((s for s in subs if "vendordemo" in (s.get("email") or "")), None)
        assert vd is not None, "vendordemo missing from subscriptions"

    def test_set_premium_then_elite_and_invalid(self, auth_h):
        r = requests.get(f"{API}/admin/subscriptions", headers=auth_h, timeout=15)
        vd = next(s for s in r.json() if "vendordemo" in (s.get("email") or ""))
        uid = vd["user_id"]
        # set premium
        r = requests.post(
            f"{API}/admin/subscriptions/{uid}", headers=auth_h,
            json={"plan": "premium"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["plan"] == "premium"
        assert r.json()["price"] == 199.0
        # set elite (restore)
        r = requests.post(
            f"{API}/admin/subscriptions/{uid}", headers=auth_h,
            json={"plan": "elite"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["plan"] == "elite"
        assert r.json()["price"] == 499.0
        # verify GET reflects elite at 499
        r = requests.get(f"{API}/admin/subscriptions", headers=auth_h, timeout=15)
        vd = next(s for s in r.json() if s["user_id"] == uid)
        assert vd["plan"] == "elite"
        assert vd["price"] == 499.0
        # invalid plan
        r = requests.post(
            f"{API}/admin/subscriptions/{uid}", headers=auth_h,
            json={"plan": "bogus"}, timeout=15,
        )
        assert r.status_code == 400


# Support
class TestSupport:
    def test_list_has_seeded_tickets(self, auth_h):
        r = requests.get(f"{API}/admin/support", headers=auth_h, timeout=20)
        assert r.status_code == 200
        tix = r.json()
        assert len(tix) >= 14, f"Expected ~14 seeded tickets, got {len(tix)}"
        complaints = [t for t in tix if t["type"] == "complaint"]
        disputes = [t for t in tix if t["type"] == "dispute"]
        assert len(complaints) >= 9, f"complaints count={len(complaints)}"
        assert len(disputes) >= 5, f"disputes count={len(disputes)}"
        # messages array present
        assert all("messages" in t and isinstance(t["messages"], list) for t in tix)

    def test_type_filter(self, auth_h):
        r = requests.get(f"{API}/admin/support?type=dispute", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert all(t["type"] == "dispute" for t in r.json())

    def test_status_filter(self, auth_h):
        r = requests.get(f"{API}/admin/support?status=open", headers=auth_h, timeout=15)
        assert r.status_code == 200
        assert all(t["status"] == "open" for t in r.json())

    def test_reply_appends_and_sets_in_review(self, auth_h):
        r = requests.get(f"{API}/admin/support?status=open", headers=auth_h, timeout=15)
        opens = r.json()
        if not opens:
            pytest.skip("No open tickets to reply to")
        t = opens[0]
        tid = t["ticket_id"]
        before_n = len(t["messages"])
        r = requests.post(
            f"{API}/admin/support/{tid}/reply", headers=auth_h,
            json={"text": "TEST automated reply (regression)"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["from"] == "admin"
        assert "TEST" in body["text"]
        # verify list now has +1 message and status in_review
        r = requests.get(f"{API}/admin/support", headers=auth_h, timeout=15)
        updated = next(x for x in r.json() if x["ticket_id"] == tid)
        assert len(updated["messages"]) == before_n + 1
        assert updated["status"] == "in_review"

    def test_status_resolved_sets_resolved_at(self, auth_h):
        # find an in_review ticket to resolve
        r = requests.get(f"{API}/admin/support?status=in_review", headers=auth_h, timeout=15)
        tix = r.json()
        if not tix:
            pytest.skip("No in_review tickets")
        tid = tix[0]["ticket_id"]
        prev_status = tix[0]["status"]
        # resolve
        r = requests.post(
            f"{API}/admin/support/{tid}/status", headers=auth_h,
            json={"status": "resolved"}, timeout=15,
        )
        assert r.status_code == 200
        # verify
        r = requests.get(f"{API}/admin/support", headers=auth_h, timeout=15)
        updated = next(x for x in r.json() if x["ticket_id"] == tid)
        assert updated["status"] == "resolved"
        assert updated.get("resolved_at") is not None
        # restore to previous status (best-effort cleanup)
        requests.post(
            f"{API}/admin/support/{tid}/status", headers=auth_h,
            json={"status": prev_status}, timeout=15,
        )

    def test_invalid_status(self, auth_h):
        r = requests.get(f"{API}/admin/support", headers=auth_h, timeout=15)
        tid = r.json()[0]["ticket_id"]
        r = requests.post(
            f"{API}/admin/support/{tid}/status", headers=auth_h,
            json={"status": "bogus"}, timeout=15,
        )
        assert r.status_code == 400

    def test_unknown_ticket_404(self, auth_h):
        r = requests.post(
            f"{API}/admin/support/tk_does_not_exist/reply", headers=auth_h,
            json={"text": "x"}, timeout=10,
        )
        assert r.status_code == 404


# Referrals
class TestReferrals:
    def test_referrals_list(self, auth_h):
        r = requests.get(f"{API}/admin/referrals", headers=auth_h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("config", "stats", "rows"):
            assert k in d
        for k in ("enabled", "reward_referrer", "reward_referee"):
            assert k in d["config"]
        for k in ("total", "completed", "pending", "rewards_paid"):
            assert k in d["stats"]
        assert len(d["rows"]) >= 14, f"expected ~14 referrals, got {len(d['rows'])}"

    def test_config_update_and_restore(self, auth_h):
        # capture original
        r = requests.get(f"{API}/admin/referrals", headers=auth_h, timeout=15)
        original = r.json()["config"]
        # update
        new = {"enabled": False, "reward_referrer": 99.0, "reward_referee": 33.0}
        r = requests.post(f"{API}/admin/referrals/config", headers=auth_h, json=new, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is False
        assert body["reward_referrer"] == 99.0
        assert body["reward_referee"] == 33.0
        # verify GET reflects new config
        r = requests.get(f"{API}/admin/referrals", headers=auth_h, timeout=15)
        assert r.json()["config"]["reward_referrer"] == 99.0
        # restore
        r = requests.post(f"{API}/admin/referrals/config", headers=auth_h, json=original, timeout=15)
        assert r.status_code == 200

    def test_negative_reward_400(self, auth_h):
        r = requests.post(
            f"{API}/admin/referrals/config", headers=auth_h,
            json={"enabled": True, "reward_referrer": -1, "reward_referee": 10}, timeout=15,
        )
        assert r.status_code == 400
