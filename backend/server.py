"""EliteReserve API entry point."""
import asyncio
import contextlib
import logging

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

import config
from bootstrap import run_startup_tasks
from database import client
from routes import admin, admin_finance, admin_marketplace, admin_support, auth, catalog, renter, vendor
from services.bookings import run_booking_housekeeping

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("server")

HOUSEKEEPING_INTERVAL_SECONDS = 300

app = FastAPI(title="EliteReserve API")

api = APIRouter(prefix="/api")
for module in (auth, catalog, renter, vendor, admin, admin_finance, admin_marketplace, admin_support):
    api.include_router(module.router)


@api.get("/")
async def health():
    return {"service": "EliteReserve API", "status": "ok"}


@api.get("/config")
async def public_config():
    """Flags the client needs to label demo behaviour correctly."""
    return {
        "demo_mode": config.SEED_DEMO_DATA,
        "demo_payments": config.DEMO_PAYMENTS,
        "welcome_credit": config.WELCOME_WALLET_CREDIT,
        "terms_version": config.TERMS_VERSION,
    }


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials="*" not in config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _housekeeping_loop() -> None:
    """Expire unanswered requests and finish trips even when nobody opens the app."""
    while True:
        try:
            await run_booking_housekeeping()
        except Exception:
            log.exception("Booking housekeeping failed")
        await asyncio.sleep(HOUSEKEEPING_INTERVAL_SECONDS)


@app.on_event("startup")
async def on_startup():
    await run_startup_tasks()
    app.state.housekeeping = asyncio.create_task(_housekeeping_loop())


@app.on_event("shutdown")
async def on_shutdown():
    task = getattr(app.state, "housekeeping", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    client.close()
