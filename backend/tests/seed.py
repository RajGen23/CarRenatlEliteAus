"""Seed test user and session for backend tests."""
import asyncio
import os
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    # cleanup any prior test bookings/reviews/wishlist for test user
    await db.bookings.delete_many({"user_id": "user_test_1"})
    await db.reviews.delete_many({"user_id": "user_test_1"})
    await db.wishlist.delete_many({"user_id": "user_test_1"})
    await db.users.update_one(
        {"user_id": "user_test_1"},
        {"$set": {
            "user_id": "user_test_1",
            "email": "test@elitereserve.example",
            "name": "Test Driver",
            "picture": None,
            "wallet_balance": 10000.0,
        }},
        upsert=True,
    )
    await db.user_sessions.update_one(
        {"session_token": "test_session_token_123"},
        {"$set": {
            "session_token": "test_session_token_123",
            "user_id": "user_test_1",
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    print("Seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
