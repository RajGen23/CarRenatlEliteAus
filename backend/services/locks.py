"""Short-lived database locks for operations that must not run twice at once."""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from database import db

LOCK_TTL_SECONDS = 30


@asynccontextmanager
async def resource_lock(key: str, ttl_seconds: int = LOCK_TTL_SECONDS):
    """Hold an exclusive lock on `key` for the duration of the block.

    A second caller gets a 409 instead of waiting. Locks left behind by a crashed
    request are taken over once they expire.
    """
    now = datetime.now(timezone.utc)
    token = uuid.uuid4().hex
    await db.locks.delete_one({"_id": key, "expires_at": {"$lt": now}})
    try:
        await db.locks.insert_one({"_id": key, "token": token, "expires_at": now + timedelta(seconds=ttl_seconds)})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Another update is in progress. Please try again.")
    try:
        yield
    finally:
        await db.locks.delete_one({"_id": key, "token": token})
