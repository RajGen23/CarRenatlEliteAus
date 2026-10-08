"""Booking rules shared by the renter and host routes."""
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import db

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


def rental_days(pickup: str, drop: str) -> int:
    delta = parse_iso(drop) - parse_iso(pickup)
    return max(1, math.ceil(delta.total_seconds() / 86400))


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
    """Renter details a host sees when reviewing a booking request."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0}) or {}
    rp = u.get("renter_profile") or {}
    trips = await db.bookings.count_documents({"user_id": user_id, "status": "completed"})
    cancellations = await db.bookings.count_documents({"user_id": user_id, "status": "cancelled"})
    rating = None if trips == 0 else max(3.5, round(5.0 - 0.3 * cancellations, 1))
    state_postcode = f"{rp.get('state', '')} {rp.get('postcode', '')}".strip()
    return {
        "user_id": user_id,
        "name": rp.get("full_name") or u.get("name", "Renter"),
        "picture": u.get("picture"),
        "email": u.get("email", ""),
        "phone": rp.get("phone", ""),
        "dob": rp.get("dob", ""),
        "address": ", ".join(p for p in [rp.get("address_line1"), rp.get("city"), state_postcode] if p),
        "license_no": rp.get("license_no", ""),
        "license_expiry": rp.get("license_expiry", ""),
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


async def vendor_car_ids(vendor_id: str) -> list:
    return [c["car_id"] async for c in db.cars.find({"vendor_id": vendor_id}, {"car_id": 1, "_id": 0})]
