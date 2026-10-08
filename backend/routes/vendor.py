"""Host (vendor) routes: onboarding, fleet, booking requests and earnings."""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException

import config
from database import db
from models import (
    BlockDatesReq,
    DeclineReq,
    PayoutRequest,
    VendorCarUpsert,
    VendorOnboard,
    VendorProfilePatch,
)
from security import get_current_user, get_vendor_user
from services.bookings import (
    DECLINE_REASONS,
    expire_stale_requests,
    parse_iso,
    renter_card,
    vendor_car_ids,
)

router = APIRouter(prefix="/vendor", tags=["vendor"])

HOST_SHARE = 1 - config.COMMISSION_RATE


def _split(total: float) -> dict:
    commission = round(total * config.COMMISSION_RATE, 2)
    return {"commission": commission, "net": round(total - commission, 2)}


async def _owned_car(vendor_id: str, car_id: str) -> dict:
    car = await db.cars.find_one({"car_id": car_id, "vendor_id": vendor_id})
    if not car:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return car


async def _owned_pending_request(vendor_id: str, booking_id: str) -> dict:
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Request not found")
    car = await db.cars.find_one({"car_id": booking["car_id"]}, {"_id": 0, "vendor_id": 1})
    if not car or car.get("vendor_id") != vendor_id:
        raise HTTPException(status_code=403, detail="Not your vehicle")
    if booking["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {booking['status']}")
    return booking


# Onboarding & profile

@router.post("/onboard")
async def onboard(payload: VendorOnboard, user: dict = Depends(get_current_user)):
    vendor_profile = {
        **payload.model_dump(),
        "kyc_status": "approved" if config.AUTO_APPROVE_VENDOR_KYC else "pending",
        "onboarded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_vendor": True, "role": "vendor", "vendor_profile": vendor_profile}},
    )
    return {"ok": True, "kyc_status": vendor_profile["kyc_status"]}


@router.get("/me")
async def vendor_me(user: dict = Depends(get_current_user)):
    return {"is_vendor": bool(user.get("is_vendor")), "vendor_profile": user.get("vendor_profile")}


@router.patch("/profile")
async def update_profile(payload: VendorProfilePatch, user: dict = Depends(get_vendor_user)):
    updates = {f"vendor_profile.{k}": v for k, v in payload.model_dump(exclude_none=True).items()}
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return {"ok": True}


# Dashboard

@router.get("/dashboard")
async def dashboard(user: dict = Depends(get_vendor_user)):
    await expire_stale_requests()
    uid = user["user_id"]
    car_ids = await vendor_car_ids(uid)
    bookings = await db.bookings.find({"car_id": {"$in": car_ids}}, {"_id": 0}).to_list(2000)

    now = datetime.now(timezone.utc)
    pending = [b for b in bookings if b["status"] == "pending"]
    upcoming = [b for b in bookings if b["status"] == "upcoming"]
    active = [b for b in upcoming if parse_iso(b["pickup_datetime"]) <= now <= parse_iso(b["drop_datetime"])]
    completed = [b for b in bookings if b["status"] == "completed"]

    gross = sum(b["total"] for b in completed)
    commission = round(gross * config.COMMISSION_RATE, 2)

    months = []
    for i in range(5, -1, -1):
        ref = now.replace(day=1) - timedelta(days=i * 30)
        value = sum(
            b["total"] * HOST_SHARE
            for b in completed
            if (ts := parse_iso(b["created_at"])).year == ref.year and ts.month == ref.month
        )
        months.append({"label": ref.strftime("%b"), "value": round(value, 2)})

    utilization = 0
    if car_ids:
        booked_days = sum(b["days"] for b in upcoming + completed)
        utilization = min(100, round(booked_days / (len(car_ids) * 30) * 100))

    return {
        "total_vehicles": len(car_ids),
        "pending_requests": len(pending),
        "upcoming_bookings": len(upcoming),
        "active_rentals": len(active),
        "completed_rentals": len(completed),
        "gross_revenue": round(gross, 2),
        "commission": commission,
        "net_earnings": round(gross - commission, 2),
        "utilization": utilization,
        "monthly": months,
    }


# Fleet

@router.get("/cars")
async def list_fleet(user: dict = Depends(get_vendor_user)):
    return await db.cars.find({"vendor_id": user["user_id"]}, {"_id": 0}).to_list(500)


@router.post("/cars")
async def create_car(payload: VendorCarUpsert, user: dict = Depends(get_vendor_user)):
    car_id = payload.car_id or f"vcar_{uuid.uuid4().hex[:12]}"
    doc = {
        **payload.model_dump(exclude={"car_id"}),
        "car_id": car_id,
        "vendor_id": user["user_id"],
        "rating": 5.0,
        "reviews_count": 0,
        "available": payload.available,
        "blocked_dates": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not doc.get("gallery"):
        doc["gallery"] = [doc["image"]]
    await db.cars.update_one({"car_id": car_id}, {"$set": doc}, upsert=True)
    return doc


@router.patch("/cars/{car_id}")
async def update_car(car_id: str, payload: VendorCarUpsert, user: dict = Depends(get_current_user)):
    await _owned_car(user["user_id"], car_id)
    updates = payload.model_dump(exclude={"car_id"}, exclude_none=True)
    await db.cars.update_one({"car_id": car_id}, {"$set": updates})
    return await db.cars.find_one({"car_id": car_id}, {"_id": 0})


@router.delete("/cars/{car_id}")
async def delete_car(car_id: str, user: dict = Depends(get_current_user)):
    res = await db.cars.delete_one({"car_id": car_id, "vendor_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"ok": True}


@router.post("/cars/{car_id}/block")
async def block_dates(car_id: str, payload: BlockDatesReq, user: dict = Depends(get_current_user)):
    await _owned_car(user["user_id"], car_id)
    await db.cars.update_one({"car_id": car_id}, {"$addToSet": {"blocked_dates": {"$each": payload.dates}}})
    return {"ok": True}


@router.post("/cars/{car_id}/unblock")
async def unblock_dates(car_id: str, payload: BlockDatesReq, user: dict = Depends(get_current_user)):
    await _owned_car(user["user_id"], car_id)
    await db.cars.update_one({"car_id": car_id}, {"$pull": {"blocked_dates": {"$in": payload.dates}}})
    return {"ok": True}


# Booking requests

@router.get("/requests")
async def pending_requests(user: dict = Depends(get_vendor_user)):
    """Booking requests awaiting this host's decision, with the renter's profile."""
    await expire_stale_requests()
    car_ids = await vendor_car_ids(user["user_id"])
    requests = await (
        db.bookings.find({"car_id": {"$in": car_ids}, "status": "pending"}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    for b in requests:
        b["renter"] = await renter_card(b["user_id"])
        b.update(_split(b["total"]))
    return {"requests": requests, "decline_reasons": DECLINE_REASONS}


@router.post("/bookings/{booking_id}/accept")
async def accept_request(booking_id: str, user: dict = Depends(get_vendor_user)):
    booking = await _owned_pending_request(user["user_id"], booking_id)
    renter = await db.users.find_one({"user_id": booking["user_id"]}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()

    if not renter or renter.get("wallet_balance", 0.0) < booking["total"]:
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"status": "declined", "decline_reason": "Renter payment failed",
                      "decline_note": None, "responded_at": now_iso}},
        )
        raise HTTPException(status_code=400, detail="Renter's payment failed — request was declined")

    await db.users.update_one({"user_id": booking["user_id"]}, {"$inc": {"wallet_balance": -booking["total"]}})
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "upcoming", "paid": True, "accepted_at": now_iso, "responded_at": now_iso}},
    )
    return {"ok": True, "status": "upcoming", "charged": booking["total"]}


@router.post("/bookings/{booking_id}/decline")
async def decline_request(booking_id: str, payload: DeclineReq, user: dict = Depends(get_vendor_user)):
    await _owned_pending_request(user["user_id"], booking_id)
    if payload.reason not in DECLINE_REASONS:
        raise HTTPException(status_code=400, detail="Invalid decline reason")
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "declined", "decline_reason": payload.reason,
                  "decline_note": (payload.note or "").strip() or None,
                  "responded_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "status": "declined"}


@router.get("/bookings")
async def list_bookings(user: dict = Depends(get_vendor_user)):
    await expire_stale_requests()
    car_ids = await vendor_car_ids(user["user_id"])
    bookings = await db.bookings.find({"car_id": {"$in": car_ids}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    user_ids = list({b["user_id"] for b in bookings})
    customers = {
        u["user_id"]: u
        async for u in db.users.find(
            {"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}
        )
    }
    for b in bookings:
        c = customers.get(b["user_id"]) or {}
        b["customer_name"] = c.get("name", "Customer")
        b["customer_email"] = c.get("email", "")
        b["customer_picture"] = c.get("picture")
        b.update(_split(b["total"]))
    return bookings


# Earnings & payouts

@router.get("/revenue")
async def revenue(user: dict = Depends(get_vendor_user)):
    uid = user["user_id"]
    car_ids = await vendor_car_ids(uid)
    completed = await (
        db.bookings.find({"car_id": {"$in": car_ids}, "status": "completed"}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(1000)
    )
    payouts = await db.vendor_payouts.find({"vendor_id": uid}, {"_id": 0}).sort("requested_at", -1).to_list(200)

    gross = sum(b["total"] for b in completed)
    commission = round(gross * config.COMMISSION_RATE, 2)
    tax = round((gross - commission) * config.GST_RATE, 2)
    paid = sum(p["amount"] for p in payouts if p["status"] in ("paid", "processing"))
    available = round(gross - commission - tax - paid, 2)

    invoices = [
        {
            "invoice_id": f"INV-{b['booking_id'][-6:].upper()}",
            "booking_id": b["booking_id"],
            "date": b["created_at"],
            "customer": "Renter",
            "gross": b["total"],
            **_split(b["total"]),
        }
        for b in completed[:50]
    ]
    return {
        "gross": round(gross, 2),
        "commission": commission,
        "tax": tax,
        "paid_out": round(paid, 2),
        "available": max(0.0, available),
        "invoices": invoices,
        "payouts": payouts,
    }


@router.post("/payouts")
async def request_payout(payload: PayoutRequest, user: dict = Depends(get_vendor_user)):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    payout = {
        "payout_id": f"po_{uuid.uuid4().hex[:10]}",
        "vendor_id": user["user_id"],
        "amount": round(payload.amount, 2),
        "status": "processing",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "bank_last4": (user.get("vendor_profile") or {}).get("bank_account_no", "")[-4:],
    }
    await db.vendor_payouts.insert_one({**payout})
    return payout
