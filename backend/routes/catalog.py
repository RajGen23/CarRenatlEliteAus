"""Public catalogue: cars, reviews and coupons."""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from database import db
from models import CouponValidate, ReviewCreate
from security import get_current_user
from services.availability import booked_ranges, market_today
from services.bookings import find_coupon
from services.listings import find_listable_car, listable_filter

router = APIRouter(tags=["catalog"])

SORTS = {
    "price_asc": ("price_per_day", 1),
    "price_desc": ("price_per_day", -1),
    "rating": ("rating", -1),
}


@router.get("/cars")
async def list_cars(
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
):
    query = await listable_filter()
    if category and category != "All":
        query["category"] = category
    if search:
        pattern = re.escape(search.strip())
        query["$and"].append({"$or": [
            {"brand": {"$regex": pattern, "$options": "i"}},
            {"model": {"$regex": pattern, "$options": "i"}},
        ]})
    if min_price is not None or max_price is not None:
        price: dict = {}
        if min_price is not None:
            price["$gte"] = min_price
        if max_price is not None:
            price["$lte"] = max_price
        query["price_per_day"] = price

    cursor = db.cars.find(query, {"_id": 0})
    if sort in SORTS:
        cursor = cursor.sort(*SORTS[sort])
    return await cursor.to_list(200)


@router.get("/cars/featured")
async def featured_cars():
    return await (
        db.cars.find(await listable_filter(), {"_id": 0})
        .sort([("featured", -1), ("rating", -1)])
        .limit(5)
        .to_list(5)
    )


@router.get("/cars/{car_id}")
async def get_car(car_id: str):
    car = await find_listable_car(car_id)
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    return car


@router.get("/cars/{car_id}/availability")
async def car_availability(car_id: str):
    """Dates renters can't book: confirmed trips and days the host has blocked."""
    car = await find_listable_car(car_id)
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    today = market_today()
    return {
        "car_id": car_id,
        "booked": await booked_ranges(car_id),
        "blocked_dates": sorted(d for d in car.get("blocked_dates") or [] if d >= today),
    }


@router.get("/cars/{car_id}/reviews")
async def car_reviews(car_id: str):
    return await db.reviews.find({"car_id": car_id}, {"_id": 0}).sort("created_at", -1).to_list(100)


async def _reviewable_trip(user_id: str, car_id: str, booking_id: Optional[str] = None) -> Optional[dict]:
    """A completed trip of this car by this renter that hasn't been reviewed yet."""
    reviewed = [r["booking_id"] async for r in db.reviews.find(
        {"user_id": user_id, "car_id": car_id, "booking_id": {"$type": "string"}}, {"_id": 0, "booking_id": 1}
    )]
    booking_filter: dict = {"$nin": reviewed}
    if booking_id:
        booking_filter["$eq"] = booking_id
    query = {"user_id": user_id, "car_id": car_id, "status": "completed", "booking_id": booking_filter}
    return await db.bookings.find_one(query, {"_id": 0}, sort=[("drop_at", 1)])


@router.get("/reviews/eligibility")
async def review_eligibility(car_id: str, user: dict = Depends(get_current_user)):
    trip = await _reviewable_trip(user["user_id"], car_id)
    return {"eligible": trip is not None, "booking_id": trip["booking_id"] if trip else None}


@router.post("/reviews")
async def create_review(payload: ReviewCreate, user: dict = Depends(get_current_user)):
    if not 1 <= payload.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    comment = (payload.comment or "").strip()
    if not comment:
        raise HTTPException(status_code=400, detail="Please write a comment.")
    trip = await _reviewable_trip(user["user_id"], payload.car_id, payload.booking_id)
    if not trip:
        raise HTTPException(
            status_code=403,
            detail="You can review a car once per completed trip, after you've driven it.",
        )
    review = {
        "review_id": f"rv_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user["name"],
        "user_picture": user.get("picture"),
        "car_id": payload.car_id,
        "booking_id": trip["booking_id"],
        "rating": payload.rating,
        "comment": comment[:2000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.reviews.insert_one({**review})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="You've already reviewed this trip.")
    return review


@router.get("/coupons")
async def list_coupons():
    rows = await db.coupons.find({"active": {"$ne": False}}, {"_id": 0}).to_list(200)
    return [{"code": c["code"], "discount_pct": c["discount_pct"], "description": c.get("description", "")} for c in rows]


@router.post("/coupons/validate")
async def validate_coupon(payload: CouponValidate):
    coupon = await find_coupon(payload.code)
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
    pct = coupon["discount_pct"]
    return {
        "code": coupon["code"],
        "discount_pct": pct,
        "discount": round(payload.subtotal * pct / 100, 2),
        "description": coupon.get("description", ""),
    }
