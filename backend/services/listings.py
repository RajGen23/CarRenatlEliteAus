"""Which cars renters are allowed to see and book."""
from typing import List, Optional

from database import db
from services.availability import market_today

INACTIVE_ACCOUNT_STATUSES = ["blocked", "suspended"]


def host_is_approved(user: dict) -> bool:
    profile = user.get("vendor_profile") or {}
    return (
        bool(user.get("is_vendor"))
        and profile.get("kyc_status") == "approved"
        and user.get("status") not in INACTIVE_ACCOUNT_STATUSES
    )


async def approved_host_ids() -> List[str]:
    cursor = db.users.find(
        {
            "is_vendor": True,
            "vendor_profile.kyc_status": "approved",
            "status": {"$nin": INACTIVE_ACCOUNT_STATUSES},
        },
        {"_id": 0, "user_id": 1},
    )
    return [u["user_id"] async for u in cursor]


async def listable_filter() -> dict:
    """Mongo filter for cars that are live on the marketplace.

    A car is live when it's switched on, has passed vehicle review, its insurance
    hasn't expired, and it either belongs to the platform or to an approved host.
    """
    return {"$and": [
        {"available": True},
        {"approval_status": {"$nin": ["pending", "rejected"]}},
        {"$or": [{"vendor_id": None}, {"vendor_id": {"$in": await approved_host_ids()}}]},
        {"$or": [{"insurance_expiry": None}, {"insurance_expiry": {"$gte": market_today()}}]},
    ]}


async def find_listable_car(car_id: str) -> Optional[dict]:
    return await db.cars.find_one({"car_id": car_id, **await listable_filter()}, {"_id": 0})


def listing_status(car: dict, host_approved: bool) -> str:
    """Why a host's car is or isn't visible to renters, for the host's own fleet screen."""
    if not host_approved:
        return "host_pending"
    approval = car.get("approval_status") or "approved"
    if approval != "approved":
        return approval
    expiry = car.get("insurance_expiry")
    if expiry and expiry[:10] < market_today():
        return "insurance_expired"
    if not car.get("available"):
        return "paused"
    return "live"
