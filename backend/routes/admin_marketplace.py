"""Admin control of featured listings and vendor subscription plans."""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import PlanBody
from routes.admin_finance import PLATFORM_FLEET_NAME
from security import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])

SUBSCRIPTION_PLANS = {"free": 0.0, "premium": 199.0, "elite": 499.0}
SUBSCRIPTION_PERIOD_DAYS = 30


def _business_name(vendor: dict) -> str:
    profile = vendor.get("vendor_profile") or {}
    return profile.get("business_name") or profile.get("company") or vendor.get("name")


@router.get("/featured")
async def featured_listings():
    cars = await db.cars.find(
        {},
        {"_id": 0, "car_id": 1, "brand": 1, "model": 1, "image": 1, "rating": 1,
         "price_per_day": 1, "featured": 1, "vendor_id": 1, "available": 1},
    ).sort([("featured", -1), ("rating", -1)]).limit(300).to_list(300)
    for c in cars:
        c["featured"] = bool(c.get("featured"))
        c["vendor_name"] = PLATFORM_FLEET_NAME
        if c.get("vendor_id"):
            v = await db.users.find_one({"user_id": c["vendor_id"]}, {"_id": 0, "name": 1, "vendor_profile": 1})
            if v:
                c["vendor_name"] = _business_name(v)
    return cars


@router.post("/cars/{car_id}/feature")
async def toggle_featured(car_id: str):
    car = await db.cars.find_one({"car_id": car_id})
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    featured = not bool(car.get("featured"))
    await db.cars.update_one({"car_id": car_id}, {"$set": {"featured": featured}})
    return {"featured": featured}


@router.get("/subscriptions")
async def list_subscriptions():
    vendors = await db.users.find({"is_vendor": True}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(200).to_list(200)
    out = []
    for v in vendors:
        sub = (v.get("vendor_profile") or {}).get("subscription") or {"plan": "free", "price": 0.0, "renews_at": None}
        out.append({
            "user_id": v["user_id"],
            "vendor_name": _business_name(v),
            "email": v.get("email"),
            "plan": sub.get("plan", "free"),
            "price": sub.get("price", 0.0),
            "renews_at": sub.get("renews_at"),
            "vehicles_count": await db.cars.count_documents({"vendor_id": v["user_id"]}),
        })
    return out


@router.post("/subscriptions/{user_id}")
async def set_subscription(user_id: str, body: PlanBody):
    plan = body.plan.lower()
    if plan not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    res = await db.users.update_one(
        {"user_id": user_id, "is_vendor": True},
        {"$set": {"vendor_profile.subscription": {
            "plan": plan,
            "price": SUBSCRIPTION_PLANS[plan],
            "renews_at": (datetime.now(timezone.utc) + timedelta(days=SUBSCRIPTION_PERIOD_DAYS)).isoformat(),
        }}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {"plan": plan, "price": SUBSCRIPTION_PLANS[plan]}
