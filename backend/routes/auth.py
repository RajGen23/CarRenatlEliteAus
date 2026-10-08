import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

import config
from database import db
from models import UserLogin, UserRegister
from security import get_current_user, hash_password, issue_session_token, user_payload, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_\.]+$")
PASSWORD_MIN_LENGTH = 6


@router.post("/register")
async def register(payload: UserRegister):
    uname = (payload.username or "").strip().lower()
    if not 3 <= len(uname) <= 30:
        raise HTTPException(status_code=400, detail="Username must be 3-30 characters.")
    if not USERNAME_RE.match(uname):
        raise HTTPException(status_code=400, detail="Username may only contain letters, numbers, underscore or dot.")
    if len(payload.password or "") < PASSWORD_MIN_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")

    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=409, detail="Username is already taken.")
    email = (payload.email or "").strip().lower() or None
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email is already registered.")

    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "username": uname,
        "email": email,
        "name": (payload.name or "").strip() or uname.capitalize(),
        "picture": None,
        "wallet_balance": float(config.WELCOME_WALLET_CREDIT),
        "is_vendor": False,
        "role": "user",
        "status": "active",
        "password_hash": hash_password(payload.password),
        "failed_login_attempts": 0,
        "locked_until": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = await issue_session_token(user["user_id"])
    return {"session_token": token, "user": user_payload(user)}


@router.post("/login")
async def login(payload: UserLogin):
    ident = (payload.identifier or "").strip().lower()
    if not ident or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    user = await db.users.find_one({"username": ident}) or await db.users.find_one({"email": ident})
    # Same message for unknown user and wrong password, to avoid account enumeration.
    invalid = HTTPException(status_code=401, detail="Invalid username or password.")
    if not user:
        raise invalid

    locked_until = user.get("locked_until")
    if isinstance(locked_until, datetime):
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Account temporarily locked. Try again later.")

    if not verify_password(payload.password, user.get("password_hash", "")):
        attempts = int(user.get("failed_login_attempts", 0)) + 1
        update: dict = {"failed_login_attempts": attempts}
        if attempts >= LOCKOUT_THRESHOLD:
            update["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
        raise invalid

    if user.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="This account has been blocked.")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"failed_login_attempts": 0, "locked_until": None}},
    )
    token = await issue_session_token(user["user_id"])
    return {"session_token": token, "user": user_payload(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user_payload(user)


@router.post("/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization.split(" ", 1)[1]})
    return {"ok": True}
