"""Demo data for local development and product demos.

Only runs when SEED_DEMO_DATA=true. Every step is idempotent, so restarting the
server never duplicates records. Demo accounts use well-known passwords and
must never be enabled on a production database.
"""
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta

import config
from database import db
from security import hash_password, verify_password
from seed.catalog import DEMO_FLEET, DEMO_REVIEWS
from services.bookings import request_expiry

log = logging.getLogger(__name__)

DEMO_RENTER = {"username": "userdemo", "password": "User@123", "user_id": "user_demo_consumer"}
DEMO_HOST = {"username": "vendordemo", "password": "Vendor@123", "user_id": "user_demo_vendor"}
DEMO_CUSTOMER_PASSWORD = "Demo@123"
DEMO_EMAIL_DOMAIN = "elitereserve.example"

DEFAULT_COUPONS = [
    ("LUXURY10", 10, "10% off your luxury rental"),
    ("WEEKEND20", 20, "20% off weekend rentals"),
    ("VIP30", 30, "VIP exclusive 30% off"),
]

FIRST_NAMES = ["Olivia", "Liam", "Charlotte", "Noah", "Ava", "William", "Amelia",
               "James", "Isla", "Lucas", "Sophie", "Henry", "Mia", "Oscar",
               "Grace", "Leo", "Chloe", "Jack", "Zara", "Ethan", "Aria", "Hugo",
               "Ruby", "Max", "Layla", "Finn", "Eva", "Theo", "Lily", "Sam"]
LAST_NAMES = ["Wilson", "Brown", "Taylor", "Smith", "Johnson", "Walker", "Clarke",
              "Bennett", "Anderson", "Mitchell", "Thompson", "Robinson", "Hughes",
              "Foster", "Hayes", "Collins", "Reynolds", "Bishop", "Lawrence",
              "Pierce", "Mason", "Cole", "Burke", "Knight", "Reed", "Vaughn",
              "Crawford", "Newman", "Reeves", "Slater"]
PICKUP_LOCATIONS = [
    "Crown Casino · Southbank, VIC",
    "Melbourne Airport · Tullamarine",
    "Chapel Street · South Yarra",
    "Brighton Beach · Brighton",
    "Albert Park · Albert Park",
    "St Kilda Pier · St Kilda",
    "Federation Square · Melbourne CBD",
]
DROP_LOCATIONS = [
    "Melbourne Airport · Tullamarine",
    "Sorrento Pier · Sorrento",
    "Daylesford Wellness Retreat",
    "Mt Buller Alpine Village",
    "Yarra Valley Wineries",
    "Phillip Island Cottage",
    "Mornington Peninsula",
]

COMPLAINTS = [
    ("Car delivered late", "The vehicle arrived 45 minutes after the agreed pickup time at Crown Casino.", "medium"),
    ("Interior not cleaned", "There were coffee stains on the rear seats when I picked up the car.", "low"),
    ("Fuel tank not full", "Contract says full-to-full but the tank was at 3/4 on pickup.", "low"),
    ("Rude host behaviour", "The host was dismissive and refused to walk me through the car's features.", "high"),
    ("Navigation system fault", "The built-in nav kept rebooting during my Yarra Valley trip.", "medium"),
    ("Tyre pressure warning", "TPMS warning stayed on the whole rental. Felt unsafe on the freeway.", "high"),
    ("App showed wrong pickup point", "Map pin was 2 blocks away from the actual garage entrance.", "low"),
    ("Deposit refund delay", "My security deposit has not been returned after 7 business days.", "high"),
    ("Scratches not documented", "Pre-existing scratches were not in the condition report. Worried I'll be charged.", "medium"),
]
DISPUTES = [
    ("Damage charge dispute", "I'm being charged $890 for a wheel scratch that was already there.", 890.0),
    ("Late return fee dispute", "Charged a full extra day for returning 20 minutes late due to traffic.", 450.0),
    ("Cleaning fee dispute", "A $150 cleaning fee was applied but I returned the car spotless.", 150.0),
    ("Toll charges dispute", "Billed for CityLink tolls on a day I didn't have the car.", 64.5),
    ("Fuel charge dispute", "Charged premium refuelling rate despite returning with a full tank.", 110.0),
]


async def seed_demo_data() -> None:
    log.warning("SEED_DEMO_DATA is on: loading demo accounts and sample data")
    await _seed_fleet()
    await _seed_coupons()
    vendor_id = await _seed_demo_accounts()
    await _seed_host_cars(vendor_id)
    await _seed_pending_request(vendor_id)
    await _seed_reviews()
    await _backfill_insurance_dates()
    await _once("demo_customers_v1", _seed_customers_and_bookings)
    await _once("demo_support_v1", _seed_marketplace_and_support)


async def _once(marker: str, fn) -> None:
    """Run a seeding step a single time per database."""
    if await db.settings.find_one({"key": marker}):
        return
    await fn()
    await db.settings.insert_one({"key": marker, "at": datetime.now(timezone.utc).isoformat()})


async def _seed_fleet() -> None:
    for car in DEMO_FLEET:
        await db.cars.update_one({"car_id": car["car_id"]}, {"$set": car}, upsert=True)


async def _seed_coupons() -> None:
    if await db.coupons.count_documents({}):
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_many([
        {"code": code, "discount_pct": pct, "description": desc, "active": True, "created_at": now}
        for code, pct, desc in DEFAULT_COUPONS
    ])


async def _ensure_account(spec: dict, doc: dict) -> str:
    """Create a demo account, or keep an existing one's password in sync with the demo password."""
    existing = await db.users.find_one({"username": spec["username"]})
    if not existing:
        await db.users.insert_one({
            **doc,
            "user_id": spec["user_id"],
            "username": spec["username"],
            "password_hash": hash_password(spec["password"]),
            "status": "active",
            "failed_login_attempts": 0,
            "locked_until": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return spec["user_id"]

    updates = {k: v for k, v in doc.items() if k in ("is_vendor", "role")}
    if doc.get("vendor_profile"):
        updates["vendor_profile"] = {**doc["vendor_profile"], **(existing.get("vendor_profile") or {})}
    if not verify_password(spec["password"], existing.get("password_hash", "")):
        updates.update({"password_hash": hash_password(spec["password"]),
                        "failed_login_attempts": 0, "locked_until": None})
    if updates:
        await db.users.update_one({"_id": existing["_id"]}, {"$set": updates})
    return existing["user_id"]


async def _seed_demo_accounts() -> str:
    now = datetime.now(timezone.utc).isoformat()
    await _ensure_account(DEMO_RENTER, {
        "email": f"userdemo@{DEMO_EMAIL_DOMAIN}",
        "name": "Demo Renter",
        "picture": None,
        "wallet_balance": 5000.0,
        "is_vendor": False,
        "role": "user",
        "renter_profile": {
            "full_name": "Demo Renter",
            "phone": "+61 400 111 222",
            "dob": "1992-04-18",
            "address_line1": "18 Southbank Blvd",
            "city": "Melbourne",
            "state": "VIC",
            "postcode": "3006",
            "license_no": "VIC-DL-556231",
            "license_expiry": "2029-04-18",
            "license_photo": "demo",
            "id_photo": "demo",
            "updated_at": now,
        },
    })
    return await _ensure_account(DEMO_HOST, {
        "email": f"vendordemo@{DEMO_EMAIL_DOMAIN}",
        "name": "Demo Host",
        "picture": None,
        "wallet_balance": 5000.0,
        "is_vendor": True,
        "role": "vendor",
        "vendor_profile": {
            "company": "LuxFleet Melbourne Pty Ltd",
            "phone": "+61 412 988 100",
            "abn": "44 555 222 111",
            "license_no": "VIC-DLR-7890",
            "license_doc": None,
            "id_doc": None,
            "bank_account_name": "LuxFleet Melbourne Pty Ltd",
            "bank_bsb": "063-100",
            "bank_account_no": "12345678",
            "kyc_status": "approved",
            "subscription": {
                "plan": "elite",
                "price": 499.0,
                "renews_at": (datetime.now(timezone.utc) + timedelta(days=23)).isoformat(),
            },
            "onboarded_at": now,
        },
    })


async def _seed_host_cars(vendor_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    cars = [
        {
            "car_id": "vcar_demo_porsche_911",
            "brand": "Porsche",
            "model": "911 Carrera S",
            "category": "Sports",
            "price_per_day": 980.0,
            "fuel_type": "Petrol",
            "transmission": "PDK 8-spd",
            "seats": 4,
            "rating": 4.9,
            "reviews_count": 18,
            "available": True,
            "image": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
            "gallery": [
                "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1600",
                "https://images.unsplash.com/photo-1611821064430-0d40291922d2?w=1600",
                "https://images.unsplash.com/photo-1614200179396-2bdb77ebf81b?w=1600",
            ],
            "features": ["Sport Chrono", "Adaptive cruise", "Premium audio", "Heated seats"],
            "description": "Iconic flat-six 911 — Melbourne's perfect canyon-to-CBD weapon.",
            "horsepower": 444,
            "top_speed": 308,
            "acceleration": "3.5s 0-100",
        },
        {
            "car_id": "vcar_demo_range_rover",
            "brand": "Land Rover",
            "model": "Range Rover Autobiography",
            "category": "SUV",
            "price_per_day": 760.0,
            "fuel_type": "Petrol",
            "transmission": "Auto 8-spd",
            "seats": 5,
            "rating": 4.8,
            "reviews_count": 22,
            "available": True,
            "image": "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200",
            "gallery": [
                "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1600",
                "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1600",
            ],
            "features": ["Meridian audio", "Massage seats", "Air suspension", "Pano roof"],
            "description": "Flagship SUV luxury — chauffeur-grade comfort, off-road capable.",
            "horsepower": 523,
            "top_speed": 250,
            "acceleration": "4.6s 0-100",
        },
    ]
    for car in cars:
        await db.cars.update_one(
            {"car_id": car["car_id"]},
            {"$setOnInsert": {**car, "vendor_id": vendor_id, "blocked_dates": [], "created_at": now}},
            upsert=True,
        )


async def _seed_pending_request(vendor_id: str) -> None:
    """Keep one pending request in the demo host's queue."""
    booking_id = "bk_demo_request_01"
    if await db.bookings.count_documents({"booking_id": booking_id, "status": "pending"}):
        return
    now = datetime.now(timezone.utc)
    await db.bookings.delete_one({"booking_id": booking_id})
    await db.bookings.insert_one({
        "booking_id": booking_id,
        "user_id": DEMO_RENTER["user_id"],
        "car_id": "vcar_demo_porsche_911",
        "vendor_id": vendor_id,
        "car_brand": "Porsche",
        "car_model": "911 Carrera S",
        "car_image": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
        "pickup_location": "Crown Casino · Southbank, VIC",
        "drop_location": "Melbourne Airport · Tullamarine",
        "pickup_datetime": (now + timedelta(days=4)).isoformat(),
        "drop_datetime": (now + timedelta(days=6)).isoformat(),
        "days": 2,
        "subtotal": 1960.0,
        "discount": 0.0,
        "taxes": 156.8,
        "total": 2116.8,
        "coupon_code": None,
        "status": "pending",
        "payment_method": "wallet",
        "paid": False,
        "request_expires_at": request_expiry(now),
        "created_at": now.isoformat(),
    })


async def _seed_reviews() -> None:
    if await db.reviews.count_documents({"_demo": True}):
        return
    now = datetime.now(timezone.utc)
    await db.reviews.insert_many([
        {
            "review_id": f"rv_demo_{i:03d}",
            "user_id": f"user_demo_reviewer_{i:03d}",
            "user_name": name,
            "user_picture": None,
            "car_id": car_id,
            "rating": rating,
            "comment": comment,
            "_demo": True,
            "created_at": (now - timedelta(days=i % 60)).isoformat(),
        }
        for i, (car_id, rating, name, comment) in enumerate(DEMO_REVIEWS)
    ])


async def _backfill_insurance_dates() -> None:
    """Give demo cars insurance dates; every fifth one expires soon so the admin alert is visible."""
    now = datetime.now(timezone.utc)
    soon, later = (now + timedelta(days=15)).isoformat(), (now + timedelta(days=180)).isoformat()
    cars = await db.cars.find({"insurance_expiry": {"$exists": False}}, {"car_id": 1}).to_list(500)
    for i, c in enumerate(cars):
        await db.cars.update_one({"_id": c["_id"]}, {"$set": {"insurance_expiry": soon if i % 5 == 0 else later}})


async def _seed_customers_and_bookings() -> None:
    """30 customers and 80 bookings spread over the last six months."""
    rng = random.Random(20260612)
    now = datetime.now(timezone.utc)
    password_hash = hash_password(DEMO_CUSTOMER_PASSWORD)

    customer_ids = []
    for _ in range(30):
        first, last = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
        uname = f"{first.lower()}.{last.lower()}{rng.randint(10, 999)}"
        if await db.users.find_one({"username": uname}):
            continue
        user_id = f"user_demo_{uuid.uuid4().hex[:10]}"
        await db.users.insert_one({
            "user_id": user_id,
            "username": uname,
            "email": f"{uname}@example.com",
            "name": f"{first} {last}",
            "picture": None,
            "wallet_balance": float(rng.choice([500, 1000, 1500, 2500, 4000])),
            "is_vendor": False,
            "role": "user",
            "status": "blocked" if rng.random() < 0.06 else "active",
            "verified": rng.random() < 0.7,
            "password_hash": password_hash,
            "failed_login_attempts": 0,
            "locked_until": None,
            "created_at": (now - timedelta(days=rng.randint(2, 200))).isoformat(),
        })
        customer_ids.append(user_id)

    cars = await db.cars.find({}, {"_id": 0}).to_list(500)
    if not customer_ids or not cars:
        return

    statuses = ["completed"] * 6 + ["upcoming"] * 2 + ["cancelled"]
    docs = []
    for _ in range(80):
        car = rng.choice(cars)
        days = rng.randint(1, 7)
        pickup = now - timedelta(days=rng.randint(1, 175))
        subtotal = round(car["price_per_day"] * days, 2)
        discount = round(subtotal * 0.1, 2) if rng.random() < 0.2 else 0.0
        taxes = round((subtotal - discount) * config.BOOKING_TAX_RATE, 2)
        status = rng.choice(statuses)
        docs.append({
            "booking_id": f"bk_{uuid.uuid4().hex[:12]}",
            "user_id": rng.choice(customer_ids),
            "car_id": car["car_id"],
            "car_brand": car["brand"],
            "car_model": car["model"],
            "car_image": car["image"],
            "pickup_location": rng.choice(PICKUP_LOCATIONS),
            "drop_location": rng.choice(DROP_LOCATIONS),
            "pickup_datetime": pickup.isoformat(),
            "drop_datetime": (pickup + timedelta(days=days)).isoformat(),
            "days": days,
            "subtotal": subtotal,
            "discount": discount,
            "taxes": taxes,
            "total": round(subtotal - discount + taxes, 2),
            "coupon_code": "LUXURY10" if discount else None,
            "status": status,
            "payment_method": "wallet",
            "refund_status": "requested" if status == "cancelled" and rng.random() < 0.4 else None,
            "vendor_id_cached": car.get("vendor_id"),
            "created_at": pickup.isoformat(),
        })
    await db.bookings.insert_many(docs)
    log.info("Demo data: %d customers, %d bookings", len(customer_ids), len(docs))


def _ticket(rng, now, customers, bookings, kind, subject, text, priority, amount, replies):
    customer = rng.choice(customers)
    booking = rng.choice(bookings) if bookings else None
    created = now - timedelta(days=rng.randint(1, 45), hours=rng.randint(0, 22))
    status = rng.choice(["open", "open", "in_review", "resolved"])
    messages = [{"from": "customer", "author": customer["name"], "text": text, "at": created.isoformat()}]
    if status in ("in_review", "resolved"):
        at = created + timedelta(hours=rng.randint(2, 30))
        messages.append({"from": "admin", "author": "Platform Admin", "text": replies[0], "at": at.isoformat()})
    if status == "resolved":
        at = created + timedelta(days=rng.randint(2, 5))
        messages.append({"from": "admin", "author": "Platform Admin", "text": replies[1], "at": at.isoformat()})
    return {
        "ticket_id": f"tk_{uuid.uuid4().hex[:10]}",
        "type": kind,
        "subject": subject,
        "priority": priority,
        "status": status,
        "customer_id": customer["user_id"],
        "customer_name": customer["name"],
        "customer_email": customer.get("email"),
        "booking_id": booking["booking_id"] if booking else None,
        "booking_label": f"{booking['car_brand']} {booking['car_model']}" if booking else None,
        "amount": amount,
        "messages": messages,
        "created_at": created.isoformat(),
        "updated_at": messages[-1]["at"],
        "resolved_at": messages[-1]["at"] if status == "resolved" else None,
    }


async def _seed_marketplace_and_support() -> None:
    """Featured cars, referral programme, support tickets and referrals."""
    rng = random.Random(20260214)
    now = datetime.now(timezone.utc)

    await db.settings.update_one(
        {"key": "referral_config"},
        {"$setOnInsert": {"enabled": True, "reward_referrer": 50.0, "reward_referee": 25.0}},
        upsert=True,
    )

    if not await db.cars.count_documents({"featured": True}):
        for c in await db.cars.find({}, {"car_id": 1}).sort("rating", -1).limit(4).to_list(4):
            await db.cars.update_one({"_id": c["_id"]}, {"$set": {"featured": True}})

    customers = await db.users.find(
        {"is_vendor": {"$ne": True}, "role": "user"}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).limit(40).to_list(40)
    bookings = await db.bookings.find(
        {}, {"_id": 0, "booking_id": 1, "car_brand": 1, "car_model": 1}
    ).limit(100).to_list(100)

    if customers and not await db.support_tickets.count_documents({}):
        complaint_replies = (
            "Thanks for flagging this — we're reviewing it with the host and will come back to you shortly.",
            "This has been resolved. A goodwill credit has been applied to your wallet. Apologies for the inconvenience.",
        )
        dispute_replies = (
            "We've requested evidence from the host and paused the charge while we investigate.",
            "Dispute settled in your favour — the charge has been reversed to your wallet.",
        )
        tickets = [
            _ticket(rng, now, customers, bookings, "complaint", s, t, p, None, complaint_replies)
            for s, t, p in COMPLAINTS
        ] + [
            _ticket(rng, now, customers, bookings, "dispute", s, t, "high" if a >= 400 else "medium", a, dispute_replies)
            for s, t, a in DISPUTES
        ]
        await db.support_tickets.insert_many(tickets)

    if len(customers) >= 6 and not await db.referrals.count_documents({}):
        rows = []
        for _ in range(14):
            referrer, referee = rng.sample(customers, 2)
            done = rng.random() < 0.6
            created = now - timedelta(days=rng.randint(1, 120))
            rows.append({
                "referral_id": f"rf_{uuid.uuid4().hex[:10]}",
                "referrer_id": referrer["user_id"],
                "referrer_name": referrer["name"],
                "referee_id": referee["user_id"],
                "referee_name": referee["name"],
                "status": "completed" if done else "pending",
                "reward_referrer": 50.0 if done else 0.0,
                "reward_referee": 25.0 if done else 0.0,
                "reward_total": 75.0 if done else 0.0,
                "completed_at": (created + timedelta(days=rng.randint(1, 14))).isoformat() if done else None,
                "created_at": created.isoformat(),
            })
        await db.referrals.insert_many(rows)
