"""Booking windows, calendar dates and double-booking checks."""
import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException

import config
from database import db

MARKET_TZ = ZoneInfo(config.MARKET_TIMEZONE)
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Bookings that hold the car for their dates.
CONFIRMED_STATUSES = ["upcoming", "completed"]


@dataclass(frozen=True)
class BookingWindow:
    pickup: datetime
    drop: datetime

    @property
    def days(self) -> int:
        return max(1, math.ceil((self.drop - self.pickup).total_seconds() / 86400))

    @property
    def pickup_at(self) -> str:
        return utc_stamp(self.pickup)

    @property
    def drop_at(self) -> str:
        return utc_stamp(self.drop)

    def calendar_dates(self) -> List[str]:
        return calendar_dates(self.pickup, self.drop)


def utc_stamp(value: datetime) -> str:
    """Fixed-width UTC timestamp, so stored values sort and compare as strings."""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_datetime(value: str) -> datetime:
    """Parse an ISO 8601 timestamp. Values without an offset are read as market time."""
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=MARKET_TZ)
    return parsed


def parse_booking_window(pickup: str, drop: str, now: Optional[datetime] = None) -> BookingWindow:
    try:
        start, end = parse_datetime(pickup), parse_datetime(drop)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Pickup and return times must be valid dates.")
    now = now or datetime.now(timezone.utc)
    if start <= now:
        raise HTTPException(status_code=400, detail="Pickup time must be in the future.")
    if end <= start:
        raise HTTPException(status_code=400, detail="Return time must be after the pickup time.")
    return BookingWindow(pickup=start, drop=end)


def market_today() -> str:
    return datetime.now(MARKET_TZ).date().isoformat()


def parse_calendar_date(value: str) -> date:
    if not isinstance(value, str) or not ISO_DATE_RE.match(value.strip()):
        raise ValueError(value)
    return date.fromisoformat(value.strip())


def calendar_dates(pickup: datetime, drop: datetime) -> List[str]:
    """Every market-calendar date the car is out, including the pickup and return days."""
    first = pickup.astimezone(MARKET_TZ).date()
    last = drop.astimezone(MARKET_TZ).date()
    return [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]


async def find_conflict(car: dict, window: BookingWindow, exclude_booking_id: Optional[str] = None) -> Optional[str]:
    """Return why the car can't be booked for this window, or None if it's free."""
    blocked = set(car.get("blocked_dates") or [])
    if blocked.intersection(window.calendar_dates()):
        return "The host has blocked some of these dates."

    query = {
        "car_id": car["car_id"],
        "status": {"$in": CONFIRMED_STATUSES},
        "pickup_at": {"$lt": window.drop_at},
        "drop_at": {"$gt": window.pickup_at},
    }
    if exclude_booking_id:
        query["booking_id"] = {"$ne": exclude_booking_id}
    if await db.bookings.find_one(query, {"_id": 0, "booking_id": 1}):
        return "The car is already booked for some of these dates."
    return None


async def booked_ranges(car_id: str) -> List[dict]:
    """Confirmed trips that haven't ended yet, without any renter details."""
    rows = await (
        db.bookings.find(
            {"car_id": car_id, "status": {"$in": CONFIRMED_STATUSES}, "drop_at": {"$gt": utc_stamp(datetime.now(timezone.utc))}},
            {"_id": 0, "pickup_at": 1, "drop_at": 1},
        )
        .sort("pickup_at", 1)
        .to_list(500)
    )
    return [{"start": r["pickup_at"], "end": r["drop_at"]} for r in rows]


async def backfill_booking_windows() -> None:
    """Older bookings only stored the raw ISO strings; add the normalised UTC fields."""
    cursor = db.bookings.find(
        {"$or": [{"pickup_at": {"$exists": False}}, {"drop_at": {"$exists": False}}]},
        {"_id": 1, "pickup_datetime": 1, "drop_datetime": 1},
    )
    async for b in cursor:
        try:
            pickup, drop = parse_datetime(b["pickup_datetime"]), parse_datetime(b["drop_datetime"])
        except (KeyError, ValueError, AttributeError):
            continue
        await db.bookings.update_one(
            {"_id": b["_id"]}, {"$set": {"pickup_at": utc_stamp(pickup), "drop_at": utc_stamp(drop)}}
        )
