"""Password hashing, session tokens and request authentication."""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
from fastapi import Header, HTTPException

from database import db

SESSION_TTL_DAYS = 30


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


async def issue_session_token(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": now + timedelta(days=SESSION_TTL_DAYS),
        "created_at": now,
    })
    return token


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_vendor_user(authorization: Optional[str] = Header(None)) -> dict:
    user = await get_current_user(authorization)
    if not user.get("is_vendor"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    return user


async def get_admin_user(authorization: Optional[str] = Header(None)) -> dict:
    user = await get_current_user(authorization)
    role = user.get("role") or ("admin" if user.get("is_admin") else None)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if user.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="Account blocked")
    return user


def user_payload(user: dict) -> dict:
    role = user.get("role") or (
        "admin" if user.get("is_admin") else ("vendor" if user.get("is_vendor") else "user")
    )
    return {
        "user_id": user["user_id"],
        "email": user.get("email"),
        "username": user.get("username"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "wallet_balance": user.get("wallet_balance", 0.0),
        "is_vendor": bool(user.get("is_vendor", False)),
        "role": role,
        "status": user.get("status", "active"),
        "verified": bool(user.get("verified", False)),
    }
