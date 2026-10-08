"""Aggregations shared by the admin reporting screens."""
from datetime import datetime, timezone, timedelta

from database import db

# Bookings that count towards revenue.
CONFIRMED = {"status": {"$in": ["upcoming", "completed"]}}

# Roles excluded from customer counts ("_marker" rows record which demo data was seeded).
NON_CUSTOMER_ROLES = ["admin", "_marker"]


async def monthly_totals(months: int = 6, label_format: str = "%b %Y") -> list:
    """Gross and tax for confirmed bookings, one row per calendar month, oldest first."""
    rows = []
    month_end = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(months):
        month_start = (month_end - timedelta(days=1)).replace(day=1)
        agg = await db.bookings.aggregate([
            {"$match": {**CONFIRMED, "created_at": {"$gte": month_start.isoformat(), "$lt": month_end.isoformat()}}},
            {"$group": {"_id": None, "gross": {"$sum": "$total"}, "tax": {"$sum": "$taxes"}}},
        ]).to_list(1)
        rows.insert(0, {
            "label": month_start.strftime(label_format),
            "gross": round(float(agg[0]["gross"]) if agg else 0.0, 2),
            "tax": round(float(agg[0]["tax"]) if agg else 0.0, 2),
        })
        month_end = month_start
    return rows
