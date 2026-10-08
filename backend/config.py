"""Runtime settings, read once from the environment (and backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _float(name: str, default=None):
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Comma-separated list of allowed browser origins. "*" is only sensible locally.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

# Admin account bootstrap. The account is created on first start if it does not
# exist; an existing admin's password is never overwritten.
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin").strip().lower()
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower() or None
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_PASSWORD_MIN_LENGTH = 12

# Demo mode seeds the sample fleet, demo accounts, customers, bookings, support
# tickets and referrals. Off by default — enable it for local development only.
SEED_DEMO_DATA = _bool("SEED_DEMO_DATA", False)

# Payments. Until a payment provider is integrated, wallet top-ups only credit a
# balance without charging anyone, so they are disabled unless explicitly allowed.
DEMO_PAYMENTS = _bool("DEMO_PAYMENTS", SEED_DEMO_DATA)
WELCOME_WALLET_CREDIT = _float("WELCOME_WALLET_CREDIT", 5000.0 if DEMO_PAYMENTS else 0.0)

# Monthly marketing spend used for CAC. Leave unset to report CAC as unavailable.
MARKETING_SPEND_MONTHLY = _float("MARKETING_SPEND_MONTHLY")

# Vendor KYC is approved by an admin unless auto-approval is switched on.
AUTO_APPROVE_VENDOR_KYC = _bool("AUTO_APPROVE_VENDOR_KYC", SEED_DEMO_DATA)

COMMISSION_RATE = 0.15
BOOKING_TAX_RATE = 0.08
GST_RATE = 0.10
