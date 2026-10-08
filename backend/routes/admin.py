"""Admin portal: overview, users, vendors, vehicles, bookings and coupons."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

import config
from database import db
from models import CouponIn, RefundBody
from services.reporting import CONFIRMED, monthly_totals, NON_CUSTOMER_ROLES
from security import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])

INSURANCE_ALERT_DAYS = 30


@router.get("/dashboard")
async def dashboard():
    now = datetime.now(timezone.utc)
    total_users = await db.users.count_documents({"role": {"$nin": NON_CUSTOMER_ROLES}})
    total_vendors = await db.users.count_documents({"is_vendor": True})

    agg = await db.bookings.aggregate([
        {"$match": CONFIRMED},
        {"$group": {"_id": None, "gross": {"$sum": "$total"}}},
    ]).to_list(1)
    gross = float(agg[0]["gross"]) if agg else 0.0

    monthly = [{"label": m["label"], "value": m["gross"]} for m in await monthly_totals(label_format="%b")]
    growth = 0.0
    if len(monthly) >= 2 and monthly[-2]["value"] > 0:
        growth = round((monthly[-1]["value"] / monthly[-2]["value"] - 1) * 100, 1)

    return {
        "total_revenue": round(gross, 2),
        "platform_commission": round(gross * config.COMMISSION_RATE, 2),
        "total_bookings": await db.bookings.count_documents({}),
        "active_rentals": await db.bookings.count_documents({"status": "upcoming"}),
        "total_customers": total_users - total_vendors,
        "total_vendors": total_vendors,
        "monthly_growth": growth,
        "new_users_30d": await db.users.count_documents({
            "role": {"$nin": NON_CUSTOMER_ROLES},
            "created_at": {"$gte": (now - timedelta(days=30)).isoformat()},
        }),
        "monthly": monthly,
    }


# Users

@router.get("/users")
async def list_users(q: Optional[str] = None, role: Optional[str] = None, status: Optional[str] = None):
    query: dict = {}
    if role == "vendor":
        query["is_vendor"] = True
    elif role == "user":
        query["$and"] = [{"is_vendor": {"$ne": True}}, {"role": {"$nin": NON_CUSTOMER_ROLES}}]
    elif role == "admin":
        query["role"] = "admin"
    else:
        query["role"] = {"$nin": NON_CUSTOMER_ROLES}
    if status and status != "all":
        query["status"] = status
    if q:
        query["$or"] = [
            {"username": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(200).to_list(200)
    for u in users:
        u["bookings_count"] = await db.bookings.count_documents({"user_id": u["user_id"]})
    return users


@router.post("/users/{user_id}/block")
async def toggle_block(user_id: str):
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot block an admin")
    new_status = "active" if target.get("status") == "blocked" else "blocked"
    await db.users.update_one({"user_id": user_id}, {"$set": {"status": new_status}})
    if new_status == "blocked":
        await db.user_sessions.delete_many({"user_id": user_id})
    return {"status": new_status}


@router.post("/users/{user_id}/verify")
async def verify_user(user_id: str):
    await db.users.update_one({"user_id": user_id}, {"$set": {"verified": True}})
    return {"verified": True}


# Vendors

@router.get("/vendors")
async def list_vendors():
    vendors = await db.users.find({"is_vendor": True}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(200).to_list(200)
    for v in vendors:
        v["vehicles_count"] = await db.cars.count_documents({"vendor_id": v["user_id"]})
        v["bookings_count"] = await db.bookings.count_documents({"vendor_id_cached": v["user_id"]})
    return vendors


@router.post("/vendors/{user_id}/kyc")
async def set_kyc(user_id: str, body: dict):
    decision = body.get("decision")
    if decision not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="Invalid decision")
    await db.users.update_one({"user_id": user_id, "is_vendor": True}, {"$set": {"vendor_profile.kyc_status": decision}})
    return {"kyc_status": decision}


@router.post("/vendors/{user_id}/suspend")
async def toggle_suspend(user_id: str):
    target = await db.users.find_one({"user_id": user_id, "is_vendor": True})
    if not target:
        raise HTTPException(status_code=404, detail="Vendor not found")
    new_status = "active" if target.get("status") == "suspended" else "suspended"
    await db.users.update_one({"user_id": user_id}, {"$set": {"status": new_status}})
    # A suspended vendor's cars are taken off the market.
    await db.cars.update_many({"vendor_id": user_id}, {"$set": {"available": new_status != "suspended"}})
    return {"status": new_status}


# Vehicles

@router.get("/cars")
async def list_cars(status: Optional[str] = None):
    query = {"approval_status": status} if status and status != "all" else {}
    cars = await db.cars.find(query, {"_id": 0}).sort("created_at", -1).limit(300).to_list(300)
    now = datetime.now(timezone.utc)
    for c in cars:
        c.setdefault("approval_status", "approved")
        c["insurance_alert"] = False
        expiry = c.get("insurance_expiry")
        if expiry:
            try:
                days_left = (datetime.fromisoformat(expiry.replace("Z", "+00:00")) - now).days
            except ValueError:
                continue
            c["insurance_days_left"] = days_left
            c["insurance_alert"] = days_left < INSURANCE_ALERT_DAYS
    return cars


async def _set_approval(car_id: str, status: str, available: bool) -> dict:
    res = await db.cars.update_one({"car_id": car_id}, {"$set": {"approval_status": status, "available": available}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Car not found")
    return {"approval_status": status}


@router.post("/cars/{car_id}/approve")
async def approve_car(car_id: str):
    return await _set_approval(car_id, "approved", True)


@router.post("/cars/{car_id}/reject")
async def reject_car(car_id: str):
    return await _set_approval(car_id, "rejected", False)


# Bookings

@router.get("/bookings")
async def list_bookings(status: Optional[str] = None, refund: Optional[str] = None):
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if refund in ("requested", "approved"):
        query["refund_status"] = refund
    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).limit(300).to_list(300)
    for b in bookings:
        u = await db.users.find_one({"user_id": b.get("user_id")}, {"_id": 0, "name": 1, "email": 1, "username": 1})
        if u:
            b["customer_name"] = u.get("name")
            b["customer_email"] = u.get("email") or u.get("username")
        total = b.get("total", 0)
        b["commission"] = round(total * config.COMMISSION_RATE, 2)
        b["net"] = round(total * (1 - config.COMMISSION_RATE), 2)
    return bookings


@router.post("/bookings/{booking_id}/refund")
async def refund_booking(booking_id: str, body: RefundBody):
    booking = await db.bookings.find_one({"booking_id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    amount = float(body.amount if body.amount is not None else booking.get("total", 0))
    await db.users.update_one({"user_id": booking["user_id"]}, {"$inc": {"wallet_balance": amount}})
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {
            "status": "cancelled",
            "refund_status": "approved",
            "refund_amount": amount,
            "refund_reason": body.reason or "Admin issued refund",
            "refunded_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"refunded": amount}


# Coupons

@router.get("/coupons")
async def list_coupons():
    return await db.coupons.find({}, {"_id": 0}).to_list(200)


@router.post("/coupons")
async def create_coupon(payload: CouponIn):
    code = payload.code.strip().upper()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(status_code=409, detail="Coupon code already exists")
    doc = {
        "code": code,
        "discount_pct": int(payload.discount_pct),
        "description": payload.description,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.coupons.insert_one({**doc})
    return doc


@router.patch("/coupons/{code}")
async def update_coupon(code: str, payload: dict):
    allowed = {k: v for k, v in payload.items() if k in ("discount_pct", "description", "active")}
    res = await db.coupons.update_one({"code": code.upper()}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return {"updated": True}


@router.delete("/coupons/{code}")
async def delete_coupon(code: str):
    res = await db.coupons.delete_one({"code": code.upper()})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return {"deleted": True}
