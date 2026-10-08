"""Admin finance reports and revenue metrics."""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

import config
from database import db
from security import get_admin_user
from services.reporting import CONFIRMED, NON_CUSTOMER_ROLES, monthly_totals

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])

REPORT_MONTHS = 6
PLATFORM_FLEET_NAME = "EliteReserve Fleet"


async def _vendor_name(vendor_id: str) -> str:
    v = await db.users.find_one({"user_id": vendor_id}, {"_id": 0, "name": 1, "vendor_profile": 1})
    if not v:
        return vendor_id
    profile = v.get("vendor_profile") or {}
    return profile.get("business_name") or profile.get("company") or v.get("name") or vendor_id


@router.get("/finance")
async def finance():
    rate = config.COMMISSION_RATE
    agg = await db.bookings.aggregate([
        {"$match": CONFIRMED},
        {"$group": {
            "_id": None,
            "gross": {"$sum": "$total"},
            "tax": {"$sum": "$taxes"},
            "completed_gross": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, "$total", 0]}},
        }},
    ]).to_list(1)
    gross = float(agg[0]["gross"]) if agg else 0.0
    tax_collected = float(agg[0]["tax"]) if agg else 0.0
    completed_gross = float(agg[0]["completed_gross"]) if agg else 0.0
    commission = round(gross * rate, 2)

    monthly = [
        {
            "label": m["label"],
            "gross": m["gross"],
            "commission": round(m["gross"] * rate, 2),
            "payouts": round(m["gross"] * (1 - rate), 2),
            "tax": m["tax"],
        }
        for m in await monthly_totals(REPORT_MONTHS)
    ]

    rows = await db.bookings.aggregate([
        {"$match": CONFIRMED},
        {"$group": {
            "_id": "$vendor_id_cached",
            "bookings": {"$sum": 1},
            "gross": {"$sum": "$total"},
            "completed_gross": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, "$total", 0]}},
        }},
        {"$sort": {"gross": -1}},
    ]).to_list(100)
    payouts = []
    for r in rows:
        vendor_id = r["_id"]
        g, cg = float(r["gross"]), float(r["completed_gross"])
        payouts.append({
            "vendor_id": vendor_id or "platform",
            "vendor_name": await _vendor_name(vendor_id) if vendor_id else f"{PLATFORM_FLEET_NAME} · Platform",
            "bookings": r["bookings"],
            "gross": round(g, 2),
            "commission": round(g * rate, 2),
            "due_now": round(cg * (1 - rate), 2),
            "pending": round((g - cg) * (1 - rate), 2),
        })

    return {
        "summary": {
            "gross_revenue": round(gross, 2),
            "platform_commission": commission,
            "vendor_payouts": round(gross * (1 - rate), 2),
            "payouts_due_now": round(completed_gross * (1 - rate), 2),
            "tax_collected": round(tax_collected, 2),
            "gst_on_commission": round(commission * config.GST_RATE, 2),
        },
        "monthly": monthly,
        "payouts": payouts,
    }


@router.get("/revenue-metrics")
async def revenue_metrics():
    now = datetime.now(timezone.utc)

    agg = await db.bookings.aggregate([
        {"$match": CONFIRMED},
        {"$group": {"_id": None, "gmv": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    gmv = float(agg[0]["gmv"]) if agg else 0.0
    bookings_count = int(agg[0]["count"]) if agg else 0

    per_customer = await db.bookings.aggregate([
        {"$match": CONFIRMED},
        {"$group": {"_id": "$user_id", "n": {"$sum": 1}}},
    ]).to_list(5000)
    unique_customers = len(per_customer)
    repeat_customers = sum(1 for c in per_customer if c["n"] >= 2)

    # CAC needs real acquisition spend. Without MARKETING_SPEND_MONTHLY it is reported as unavailable.
    total_customers = await db.users.count_documents({"is_vendor": {"$ne": True}, "role": {"$nin": NON_CUSTOMER_ROLES}})
    marketing_spend = None
    cac = None
    if config.MARKETING_SPEND_MONTHLY is not None:
        marketing_spend = round(config.MARKETING_SPEND_MONTHLY * REPORT_MONTHS, 2)
        cac = round(marketing_spend / total_customers, 2) if total_customers else None

    fleet_size = await db.cars.count_documents({})
    days_agg = await db.bookings.aggregate([
        {"$match": {**CONFIRMED, "created_at": {"$gte": (now - timedelta(days=30)).isoformat()}}},
        {"$group": {"_id": None, "days": {"$sum": "$days"}}},
    ]).to_list(1)
    booked_days = float(days_agg[0]["days"]) if days_agg else 0.0

    return {
        "gmv": round(gmv, 2),
        "abv": round(gmv / bookings_count, 2) if bookings_count else 0.0,
        "ltv": round(gmv / unique_customers, 2) if unique_customers else 0.0,
        "cac": cac,
        "fleet_utilization": round(booked_days / (fleet_size * 30) * 100, 1) if fleet_size else 0.0,
        "repeat_rate": round(repeat_customers / unique_customers * 100, 1) if unique_customers else 0.0,
        "bookings_count": bookings_count,
        "unique_customers": unique_customers,
        "fleet_size": fleet_size,
        "marketing_spend": marketing_spend,
        "trend": [{"label": m["label"], "value": m["gross"]} for m in await monthly_totals(REPORT_MONTHS, "%b")],
    }
