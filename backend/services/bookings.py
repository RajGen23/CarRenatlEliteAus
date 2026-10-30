"""Booking rules shared by the renter and host routes."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import db
from services.availability import utc_stamp

REQUEST_TTL_HOURS = 24

DECLINE_REASONS = [
    "Dates no longer available",
    "Vehicle under maintenance",
    "Renter doesn't meet my requirements",
    "Not enough trip history",
    "Other",
]

RENTER_REQUIRED_FIELDS = [
    "full_name", "phone", "dob", "address_line1", "city", "state", "postcode",
    "license_no", "license_expiry",
]


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def request_expiry(now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    return (now + timedelta(hours=REQUEST_TTL_HOURS)).isoformat()


def renter_profile_complete(user: dict) -> bool:
    rp = user.get("renter_profile") or {}
    return all(str(rp.get(f) or "").strip() for f in RENTER_REQUIRED_FIELDS)


async def find_coupon(code: Optional[str]) -> Optional[dict]:
    if not code:
        return None
    return await db.coupons.find_one(
        {"code": code.upper().strip(), "active": {"$ne": False}}, {"_id": 0}
    )


async def renter_card(user_id: str) -> dict:
    """Renter details a host sees when deciding on a booking request.

    Only what's needed to decide: name, history and verification. Contact and licence
    details are shared with the host once the trip is confirmed (see the host bookings
    list); home address and date of birth are never shared with hosts.
    """
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0}) or {}
    rp = u.get("renter_profile") or {}
    trips = await db.bookings.count_documents({"user_id": user_id, "status": "completed"})
    cancellations = await db.bookings.count_documents({"user_id": user_id, "status": "cancelled"})
    rating = None if trips == 0 else max(3.5, round(5.0 - 0.3 * cancellations, 1))
    return {
        "user_id": user_id,
        "name": rp.get("full_name") or u.get("name", "Renter"),
        "picture": u.get("picture"),
        "city": rp.get("city", ""),
        "license_verified": bool(rp.get("license_no") and rp.get("license_photo")),
        "id_verified": bool(rp.get("id_photo")),
        "member_since": u.get("created_at", ""),
        "trips": trips,
        "cancellations": cancellations,
        "rating": rating,
    }


async def expire_stale_requests() -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_many(
        {"status": "pending", "request_expires_at": {"$lt": now_iso}},
        {"$set": {
            "status": "declined",
            "decline_reason": f"No response from host within {REQUEST_TTL_HOURS} hours",
            "decline_note": None,
            "auto_declined": True,
            "responded_at": now_iso,
        }},
    )


async def decline_overlapping_requests(booking: dict) -> int:
    """Decline other pending requests for the same car that clash with a confirmed booking."""
    res = await db.bookings.update_many(
        {
            "car_id": booking["car_id"],
            "status": "pending",
            "booking_id": {"$ne": booking["booking_id"]},
            "pickup_at": {"$lt": booking["drop_at"]},
            "drop_at": {"$gt": booking["pickup_at"]},
        },
        {"$set": {
            "status": "declined",
            "decline_reason": "Dates no longer available",
            "decline_note": None,
            "auto_declined": True,
            "responded_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return res.modified_count


async def complete_finished_trips() -> None:
    """Mark confirmed trips as completed once their return time has passed."""
    now = datetime.now(timezone.utc)
    await db.bookings.update_many(
        {"status": "upcoming", "drop_at": {"$lte": utc_stamp(now)}},
        {"$set": {"status": "completed", "completed_at": now.isoformat()}},
    )


async def run_booking_housekeeping() -> None:
    await expire_stale_requests()
    await complete_finished_trips()


async def vendor_car_ids(vendor_id: str) -> list:
    return [c["car_id"] async for c in db.cars.find({"vendor_id": vendor_id}, {"car_id": 1, "_id": 0})]
