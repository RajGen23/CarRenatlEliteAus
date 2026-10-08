"""Public catalogue: cars, reviews and coupons."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import CouponValidate, ReviewCreate
from security import get_current_user
from services.bookings import find_coupon

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
    query: dict = {}
    if category and category != "All":
        query["category"] = category
    if search:
        query["$or"] = [
            {"brand": {"$regex": search, "$options": "i"}},
            {"model": {"$regex": search, "$options": "i"}},
        ]
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
        db.cars.find({"available": True}, {"_id": 0})
        .sort([("featured", -1), ("rating", -1)])
        .limit(5)
        .to_list(5)
    )


@router.get("/cars/{car_id}")
async def get_car(car_id: str):
    car = await db.cars.find_one({"car_id": car_id}, {"_id": 0})
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    return car


@router.get("/cars/{car_id}/reviews")
async def car_reviews(car_id: str):
    return await db.reviews.find({"car_id": car_id}, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.post("/reviews")
async def create_review(payload: ReviewCreate, user: dict = Depends(get_current_user)):
    if not 1 <= payload.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    review = {
        "review_id": f"rv_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user["name"],
        "user_picture": user.get("picture"),
        "car_id": payload.car_id,
        "rating": payload.rating,
        "comment": payload.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one({**review})
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
