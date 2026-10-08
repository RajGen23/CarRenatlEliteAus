"""Work done once at startup: indexes, data backfills, admin account, optional demo data."""
import logging
from datetime import datetime, timezone

import config
from database import db
from security import hash_password

log = logging.getLogger(__name__)


async def run_startup_tasks() -> None:
    await _ensure_indexes()
    await _backfill_user_fields()
    await _ensure_admin_account()
    if config.SEED_DEMO_DATA:
        from seed.demo import seed_demo_data
        await seed_demo_data()


async def _ensure_indexes() -> None:
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("username", unique=True, sparse=True)
    # Email is optional, so uniqueness only applies to accounts that have one.
    try:
        await db.users.create_index(
            "email", unique=True, name="email_unique_when_set",
            partialFilterExpression={"email": {"$type": "string"}},
        )
    except Exception as exc:  # an older, differently-defined email index already exists
        log.warning("Could not create email index: %s", exc)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.cars.create_index("car_id", unique=True)
    await db.bookings.create_index("booking_id", unique=True)
    await db.bookings.create_index("user_id")
    await db.coupons.create_index("code", unique=True)


async def _backfill_user_fields() -> None:
    """Older records may lack role/status; fill them in so filters behave consistently."""
    await db.users.update_many({"is_vendor": True, "role": {"$exists": False}}, {"$set": {"role": "vendor"}})
    await db.users.update_many({"is_vendor": {"$ne": True}, "role": {"$exists": False}}, {"$set": {"role": "user"}})
    await db.users.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})


async def _ensure_admin_account() -> None:
    """Create the admin account from ADMIN_USERNAME / ADMIN_PASSWORD if it does not exist yet.

    An existing admin's password is left alone, so a password changed after first
    start is never reset. To rotate it, update the user record directly.
    """
    if await db.users.find_one({"username": config.ADMIN_USERNAME}):
        return
    if not config.ADMIN_PASSWORD:
        log.warning("No admin account exists and ADMIN_PASSWORD is not set; skipping admin creation")
        return
    if len(config.ADMIN_PASSWORD) < config.ADMIN_PASSWORD_MIN_LENGTH:
        raise RuntimeError(
            f"ADMIN_PASSWORD must be at least {config.ADMIN_PASSWORD_MIN_LENGTH} characters"
        )
    await db.users.insert_one({
        "user_id": "user_admin",
        "username": config.ADMIN_USERNAME,
        "email": config.ADMIN_EMAIL,
        "name": "Platform Admin",
        "picture": None,
        "wallet_balance": 0.0,
        "is_vendor": False,
        "role": "admin",
        "status": "active",
        "verified": True,
        "password_hash": hash_password(config.ADMIN_PASSWORD),
        "failed_login_attempts": 0,
        "locked_until": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    log.info("Created admin account '%s'", config.ADMIN_USERNAME)
