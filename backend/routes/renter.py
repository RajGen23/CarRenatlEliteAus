"""Renter-side routes: verification profile, booking requests, wallet and wishlist."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

import config
from database import db
from models import BookingCreate, RenterProfileUpsert, WalletTopup
from security import get_current_user
from services.availability import (
    find_conflict,
    market_today,
    parse_booking_window,
    parse_calendar_date,
    parse_datetime,
)
from services.bookings import (
    RENTER_REQUIRED_FIELDS,
    find_coupon,
    renter_profile_complete,
    request_expiry,
    run_booking_housekeeping,
)
from services.listings import find_listable_car, listable_filter

router = APIRouter(tags=["renter"])

CANCELLATION_REFUND_RATE = 0.8
MIN_RENTER_AGE = 18


@router.get("/profile/renter")
async def get_renter_profile(user: dict = Depends(get_current_user)):
    return {
        "profile": user.get("renter_profile"),
        "complete": renter_profile_complete(user),
        "required_fields": RENTER_REQUIRED_FIELDS,
    }


@router.patch("/profile/renter")
async def save_renter_profile(payload: RenterProfileUpsert, user: dict = Depends(get_current_user)):
    data = {k: v.strip() if isinstance(v, str) else v for k, v in payload.model_dump().items()}
    missing = [f for f in RENTER_REQUIRED_FIELDS if not data.get(f)]
    if missing:
        raise HTTPException(status_code=400, detail="Please fill in every field before saving.")
    try:
        dob = parse_calendar_date(data["dob"])
        license_expiry = parse_calendar_date(data["license_expiry"])
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format.")
    today = parse_calendar_date(market_today())
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if not MIN_RENTER_AGE <= age <= 120:
        raise HTTPException(status_code=400, detail=f"You must be at least {MIN_RENTER_AGE} to rent a car.")
    if license_expiry < today:
        raise HTTPException(status_code=400, detail="Your driver licence has expired.")
    profile = {**data, "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"renter_profile": profile}})
    return {"ok": True, "profile": profile, "complete": True}


@router.post("/bookings")
async def create_booking(payload: BookingCreate, user: dict = Depends(get_current_user)):
    if not renter_profile_complete(user):
        raise HTTPException(status_code=400, detail="Complete your renter profile before requesting a booking")
    if not payload.accept_rental_terms:
        raise HTTPException(
            status_code=400,
            detail="Please accept the rental agreement and cancellation policy to continue.",
        )
    window = parse_booking_window(payload.pickup_datetime, payload.drop_datetime)
    if not await db.cars.find_one({"car_id": payload.car_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Car not found")
    car = await find_listable_car(payload.car_id)
    if not car:
        raise HTTPException(status_code=400, detail="Car not available")
    conflict = await find_conflict(car, window)
    if conflict:
        raise HTTPException(status_code=409, detail=f"{conflict} Please choose different dates.")

    days = window.days
    subtotal = round(car["price_per_day"] * days, 2)

    discount, coupon_code = 0.0, None
    coupon = await find_coupon(payload.coupon_code)
    if coupon:
        discount = round(subtotal * coupon["discount_pct"] / 100, 2)
        coupon_code = coupon["code"]

    taxes = round((subtotal - discount) * config.BOOKING_TAX_RATE, 2)
    total = round(subtotal - discount + taxes, 2)

    # Balance is only checked here; the renter is charged when the host accepts.
    balance = user.get("wallet_balance", 0.0)
    if balance < total:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. Need ${total:.2f}, have ${balance:.2f}",
        )

    now = datetime.now(timezone.utc)
    booking = {
        "booking_id": f"bk_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "car_id": car["car_id"],
        "vendor_id": car.get("vendor_id"),
        "car_brand": car["brand"],
        "car_model": car["model"],
        "car_image": car["image"],
        "pickup_location": payload.pickup_location,
        "drop_location": payload.drop_location,
        "pickup_datetime": window.pickup.isoformat(),
        "drop_datetime": window.drop.isoformat(),
        "pickup_at": window.pickup_at,
        "drop_at": window.drop_at,
        "days": days,
        "subtotal": subtotal,
        "discount": discount,
        "taxes": taxes,
        "total": total,
        "coupon_code": coupon_code,
        "status": "pending",
        "payment_method": "wallet",
        "paid": False,
        "request_expires_at": request_expiry(now),
        "rental_terms_accepted_at": now.isoformat(),
        "terms_version": config.TERMS_VERSION,
        "created_at": now.isoformat(),
    }
    await db.bookings.insert_one({**booking})
    return booking


@router.get("/bookings")
async def my_bookings(user: dict = Depends(get_current_user)):
    await run_booking_housekeeping()
    return await db.bookings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id, "user_id": user["user_id"]}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["status"] not in ("pending", "upcoming"):
        raise HTTPException(status_code=400, detail="Only pending or upcoming bookings can be cancelled")
    if booking["status"] == "upcoming" and parse_datetime(booking["pickup_datetime"]) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This trip has already started and can no longer be cancelled.")

    # Pending requests were never charged, so there is nothing to refund.
    refund = round(booking["total"] * CANCELLATION_REFUND_RATE, 2) if booking["status"] == "upcoming" else 0.0
    res = await db.bookings.update_one(
        {"booking_id": booking_id, "status": booking["status"]},
        {"$set": {"status": "cancelled", "refund": refund, "cancelled_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="This booking was just updated. Refresh and try again.")
    if refund:
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"wallet_balance": refund}})
    return {"ok": True, "refund": refund}


@router.get("/wallet")
async def wallet(user: dict = Depends(get_current_user)):
    return {"balance": user.get("wallet_balance", 0.0), "demo_payments": config.DEMO_PAYMENTS}


@router.post("/wallet/topup")
async def topup(payload: WalletTopup, user: dict = Depends(get_current_user)):
    # No payment provider is integrated yet. Top-ups simply credit the balance,
    # so they are only allowed when DEMO_PAYMENTS is switched on.
    if not config.DEMO_PAYMENTS:
        raise HTTPException(status_code=503, detail="Wallet top-ups are not available yet.")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"wallet_balance": payload.amount}})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"balance": updated.get("wallet_balance", 0.0)}


@router.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    items = await db.wishlist.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(200)
    car_ids = [i["car_id"] for i in items]
    if not car_ids:
        return []
    return await db.cars.find({"car_id": {"$in": car_ids}, **await listable_filter()}, {"_id": 0}).to_list(200)


@router.post("/wishlist/{car_id}")
async def add_wishlist(car_id: str, user: dict = Depends(get_current_user)):
    await db.wishlist.update_one(
        {"user_id": user["user_id"], "car_id": car_id},
        {"$set": {"user_id": user["user_id"], "car_id": car_id, "added_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/wishlist/{car_id}")
async def remove_wishlist(car_id: str, user: dict = Depends(get_current_user)):
    await db.wishlist.delete_one({"user_id": user["user_id"], "car_id": car_id})
    return {"ok": True}
