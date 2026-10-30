"""Host (vendor) routes: onboarding, fleet, booking requests and earnings."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

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
from services import documents
from services.availability import (
    CONFIRMED_STATUSES,
    BookingWindow,
    find_conflict,
    market_today,
    parse_calendar_date,
    parse_datetime,
)
from services.bookings import (
    DECLINE_REASONS,
    decline_overlapping_requests,
    parse_iso,
    renter_card,
    run_booking_housekeeping,
    vendor_car_ids,
)
from services.listings import find_listable_car, host_is_approved, listing_status
from services.locks import resource_lock

router = APIRouter(prefix="/vendor", tags=["vendor"])

HOST_SHARE = 1 - config.COMMISSION_RATE


def _split(total: float) -> dict:
    commission = round(total * config.COMMISSION_RATE, 2)
    return {"commission": commission, "net": round(total - commission, 2)}


def _require_approved_host(user: dict) -> None:
    if not host_is_approved(user):
        raise HTTPException(
            status_code=403,
            detail="Your host account is still being reviewed. You can accept bookings and request payouts once it's approved.",
        )


def _validate_insurance_expiry(value: str) -> str:
    try:
        expiry = parse_calendar_date(value).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="Insurance expiry must be a date in YYYY-MM-DD format.")
    if expiry < market_today():
        raise HTTPException(status_code=400, detail="The insurance policy has already expired.")
    return expiry


async def _owned_car(vendor_id: str, car_id: str) -> dict:
    car = await db.cars.find_one({"car_id": car_id, "vendor_id": vendor_id}, {"_id": 0})
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
    if user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts can't become hosts")
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
    await run_booking_housekeeping()
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
        "kyc_status": (user.get("vendor_profile") or {}).get("kyc_status", "pending"),
        "host_approved": host_is_approved(user),
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
    cars = await db.cars.find({"vendor_id": user["user_id"]}, {"_id": 0}).to_list(500)
    approved = host_is_approved(user)
    for car in cars:
        car["listing_status"] = listing_status(car, approved)
    return cars


@router.get("/cars/{car_id}")
async def get_fleet_car(car_id: str, user: dict = Depends(get_vendor_user)):
    car = await _owned_car(user["user_id"], car_id)
    car["listing_status"] = listing_status(car, host_is_approved(user))
    car["documents"] = await documents.list_documents(car_id)
    return car


@router.get("/cars/{car_id}/documents/{kind}")
async def get_fleet_car_document(car_id: str, kind: str, user: dict = Depends(get_vendor_user)):
    await _owned_car(user["user_id"], car_id)
    return await documents.get_document(car_id, kind)


@router.post("/cars")
async def create_car(payload: VendorCarUpsert, user: dict = Depends(get_vendor_user)):
    if not payload.insurance_expiry:
        raise HTTPException(status_code=400, detail="Insurance expiry date is required.")
    if not payload.insurance_document or not payload.registration_document:
        raise HTTPException(status_code=400, detail="Upload both the insurance and registration certificates.")
    insurance_expiry = _validate_insurance_expiry(payload.insurance_expiry)
    documents.validate_upload(payload.insurance_document, "insurance")
    documents.validate_upload(payload.registration_document, "registration")

    car_id = f"vcar_{uuid.uuid4().hex[:12]}"
    doc = {
        **payload.model_dump(exclude={"insurance_document", "registration_document"}),
        "car_id": car_id,
        "vendor_id": user["user_id"],
        "insurance_expiry": insurance_expiry,
        "approval_status": "pending",
        "rating": 5.0,
        "reviews_count": 0,
        "blocked_dates": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not doc.get("gallery"):
        doc["gallery"] = [doc["image"]]
    await db.cars.insert_one({**doc})
    await documents.save_document(car_id, user["user_id"], "insurance", payload.insurance_document)
    await documents.save_document(car_id, user["user_id"], "registration", payload.registration_document)
    doc["listing_status"] = listing_status(doc, host_is_approved(user))
    return doc


@router.patch("/cars/{car_id}")
async def update_car(car_id: str, payload: VendorCarUpsert, user: dict = Depends(get_vendor_user)):
    car = await _owned_car(user["user_id"], car_id)
    updates = payload.model_dump(exclude={"insurance_document", "registration_document"}, exclude_none=True)
    needs_review = False
    if payload.insurance_expiry:
        updates["insurance_expiry"] = _validate_insurance_expiry(payload.insurance_expiry)
        needs_review = updates["insurance_expiry"] != car.get("insurance_expiry")
    uploads = {"insurance": payload.insurance_document, "registration": payload.registration_document}
    for kind, upload in uploads.items():
        if upload:
            documents.validate_upload(upload, kind)
    for kind, upload in uploads.items():
        if upload:
            await documents.save_document(car_id, user["user_id"], kind, upload)
            needs_review = True
    if needs_review:
        updates["approval_status"] = "pending"
    await db.cars.update_one({"car_id": car_id}, {"$set": updates})
    updated = await db.cars.find_one({"car_id": car_id}, {"_id": 0})
    updated["listing_status"] = listing_status(updated, host_is_approved(user))
    return updated


@router.delete("/cars/{car_id}")
async def delete_car(car_id: str, user: dict = Depends(get_vendor_user)):
    res = await db.cars.delete_one({"car_id": car_id, "vendor_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await documents.delete_documents(car_id)
    return {"ok": True}


def _parse_dates(dates: list) -> list:
    try:
        return sorted({parse_calendar_date(d).isoformat() for d in dates})
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format.")


@router.post("/cars/{car_id}/block")
async def block_dates(car_id: str, payload: BlockDatesReq, user: dict = Depends(get_vendor_user)):
    await _owned_car(user["user_id"], car_id)
    dates = _parse_dates(payload.dates)
    async with resource_lock(f"car:{car_id}"):
        booked = set()
        async for b in db.bookings.find(
            {"car_id": car_id, "status": "upcoming"}, {"_id": 0, "pickup_datetime": 1, "drop_datetime": 1}
        ):
            window = BookingWindow(parse_datetime(b["pickup_datetime"]), parse_datetime(b["drop_datetime"]))
            booked.update(window.calendar_dates())
        clashes = sorted(booked.intersection(dates))
        if clashes:
            raise HTTPException(
                status_code=409,
                detail=f"These dates already have a confirmed booking: {', '.join(clashes)}",
            )
        await db.cars.update_one({"car_id": car_id}, {"$addToSet": {"blocked_dates": {"$each": dates}}})
    return {"ok": True}


@router.post("/cars/{car_id}/unblock")
async def unblock_dates(car_id: str, payload: BlockDatesReq, user: dict = Depends(get_vendor_user)):
    await _owned_car(user["user_id"], car_id)
    await db.cars.update_one({"car_id": car_id}, {"$pull": {"blocked_dates": {"$in": payload.dates}}})
    return {"ok": True}


# Booking requests

@router.get("/requests")
async def pending_requests(user: dict = Depends(get_vendor_user)):
    """Booking requests awaiting this host's decision, with the renter's profile."""
    await run_booking_housekeeping()
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


async def _decline(booking_id: str, reason: str, at: str, auto: bool = False, note: Optional[str] = None) -> None:
    updates = {"status": "declined", "decline_reason": reason, "decline_note": note, "responded_at": at}
    if auto:
        updates["auto_declined"] = True
    await db.bookings.update_one({"booking_id": booking_id, "status": "pending"}, {"$set": updates})


@router.post("/bookings/{booking_id}/accept")
async def accept_request(booking_id: str, user: dict = Depends(get_vendor_user)):
    _require_approved_host(user)
    booking = await _owned_pending_request(user["user_id"], booking_id)
    async with resource_lock(f"car:{booking['car_id']}"):
        booking = await _owned_pending_request(user["user_id"], booking_id)
        now_iso = datetime.now(timezone.utc).isoformat()

        car = await find_listable_car(booking["car_id"])
        if not car:
            raise HTTPException(
                status_code=400,
                detail="This car isn't live on the marketplace right now. Check its approval and insurance first.",
            )
        window = BookingWindow(parse_datetime(booking["pickup_datetime"]), parse_datetime(booking["drop_datetime"]))
        if window.pickup <= datetime.now(timezone.utc):
            await _decline(booking_id, "Request expired", now_iso, auto=True)
            raise HTTPException(status_code=400, detail="The pickup time has already passed, so the request was declined.")
        if await find_conflict(car, window, exclude_booking_id=booking_id):
            await _decline(booking_id, "Dates no longer available", now_iso, auto=True)
            raise HTTPException(status_code=409, detail="These dates are no longer available, so the request was declined.")

        renter = await db.users.find_one({"user_id": booking["user_id"]}, {"_id": 0})
        if not renter or renter.get("wallet_balance", 0.0) < booking["total"]:
            await _decline(booking_id, "Renter payment failed", now_iso)
            raise HTTPException(status_code=400, detail="Renter's payment failed — request was declined")

        charged = await db.users.update_one(
            {"user_id": booking["user_id"], "wallet_balance": {"$gte": booking["total"]}},
            {"$inc": {"wallet_balance": -booking["total"]}},
        )
        if charged.modified_count == 0:
            await _decline(booking_id, "Renter payment failed", now_iso)
            raise HTTPException(status_code=400, detail="Renter's payment failed — request was declined")
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"status": "upcoming", "paid": True, "accepted_at": now_iso, "responded_at": now_iso,
                      "pickup_at": window.pickup_at, "drop_at": window.drop_at}},
        )
        await decline_overlapping_requests({**booking, "pickup_at": window.pickup_at, "drop_at": window.drop_at})
    return {"ok": True, "status": "upcoming", "charged": booking["total"]}


@router.post("/bookings/{booking_id}/decline")
async def decline_request(booking_id: str, payload: DeclineReq, user: dict = Depends(get_vendor_user)):
    await _owned_pending_request(user["user_id"], booking_id)
    if payload.reason not in DECLINE_REASONS:
        raise HTTPException(status_code=400, detail="Invalid decline reason")
    await _decline(
        booking_id, payload.reason, datetime.now(timezone.utc).isoformat(),
        note=(payload.note or "").strip() or None,
    )
    return {"ok": True, "status": "declined"}


@router.get("/bookings")
async def list_bookings(user: dict = Depends(get_vendor_user)):
    await run_booking_housekeeping()
    car_ids = await vendor_car_ids(user["user_id"])
    bookings = await db.bookings.find({"car_id": {"$in": car_ids}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    user_ids = list({b["user_id"] for b in bookings})
    customers = {
        u["user_id"]: u
        async for u in db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1,
             "renter_profile.full_name": 1, "renter_profile.phone": 1,
             "renter_profile.license_no": 1, "renter_profile.license_expiry": 1},
        )
    }
    for b in bookings:
        c = customers.get(b["user_id"]) or {}
        rp = c.get("renter_profile") or {}
        confirmed = b["status"] in CONFIRMED_STATUSES
        b["customer_name"] = rp.get("full_name") or c.get("name", "Customer")
        b["customer_picture"] = c.get("picture")
        b["customer_email"] = (c.get("email") or "") if confirmed else ""
        b["customer_phone"] = rp.get("phone", "") if confirmed else ""
        b["customer_license_no"] = rp.get("license_no", "") if confirmed else ""
        b["customer_license_expiry"] = rp.get("license_expiry", "") if confirmed else ""
        b.update(_split(b["total"]))
    return bookings


# Earnings & payouts

async def _earnings(vendor_id: str) -> dict:
    car_ids = await vendor_car_ids(vendor_id)
    completed = await (
        db.bookings.find({"car_id": {"$in": car_ids}, "status": "completed"}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(1000)
    )
    payouts = await db.vendor_payouts.find({"vendor_id": vendor_id}, {"_id": 0}).sort("requested_at", -1).to_list(200)

    gross = sum(b["total"] for b in completed)
    commission = round(gross * config.COMMISSION_RATE, 2)
    tax = round((gross - commission) * config.GST_RATE, 2)
    paid = sum(p["amount"] for p in payouts if p["status"] in ("paid", "processing"))
    available = round(gross - commission - tax - paid, 2)
    return {
        "completed": completed,
        "payouts": payouts,
        "gross": round(gross, 2),
        "commission": commission,
        "tax": tax,
        "paid_out": round(paid, 2),
        "available": max(0.0, available),
    }


@router.get("/revenue")
async def revenue(user: dict = Depends(get_vendor_user)):
    await run_booking_housekeeping()
    earnings = await _earnings(user["user_id"])
    invoices = [
        {
            "invoice_id": f"INV-{b['booking_id'][-6:].upper()}",
            "booking_id": b["booking_id"],
            "date": b["created_at"],
            "customer": "Renter",
            "gross": b["total"],
            **_split(b["total"]),
        }
        for b in earnings["completed"][:50]
    ]
    return {
        "gross": earnings["gross"],
        "commission": earnings["commission"],
        "tax": earnings["tax"],
        "paid_out": earnings["paid_out"],
        "available": earnings["available"],
        "invoices": invoices,
        "payouts": earnings["payouts"],
    }


@router.post("/payouts")
async def request_payout(payload: PayoutRequest, user: dict = Depends(get_vendor_user)):
    amount = round(payload.amount, 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    _require_approved_host(user)
    bank_account_no = (user.get("vendor_profile") or {}).get("bank_account_no", "")
    if not bank_account_no:
        raise HTTPException(status_code=400, detail="Add your bank details before requesting a payout.")

    await run_booking_housekeeping()
    async with resource_lock(f"payout:{user['user_id']}"):
        available = (await _earnings(user["user_id"]))["available"]
        if amount > available:
            raise HTTPException(
                status_code=400,
                detail=f"You can request up to ${available:.2f}, the balance from completed trips.",
            )
        payout = {
            "payout_id": f"po_{uuid.uuid4().hex[:10]}",
            "vendor_id": user["user_id"],
            "amount": amount,
            "status": "processing",
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "bank_last4": bank_account_no[-4:],
        }
        await db.vendor_payouts.insert_one({**payout})
    return payout
