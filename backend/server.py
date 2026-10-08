"""EliteReserve API entry point."""
import logging

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

import config
from bootstrap import run_startup_tasks
from database import client
from routes import admin, admin_finance, admin_marketplace, admin_support, auth, catalog, renter, vendor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

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
    }


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials="*" not in config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await run_startup_tasks()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
