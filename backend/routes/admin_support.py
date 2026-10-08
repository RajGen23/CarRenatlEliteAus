"""Admin support desk (complaints and disputes) and referral programme."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import ReferralConfig, TicketReply, TicketStatus
from security import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])

TICKET_STATUSES = ("open", "in_review", "resolved")
DEFAULT_REFERRAL_CONFIG = {"enabled": True, "reward_referrer": 50.0, "reward_referee": 25.0}


@router.get("/support", dependencies=[Depends(get_admin_user)])
async def list_tickets(type: Optional[str] = None, status: Optional[str] = None):
    query: dict = {}
    if type and type != "all":
        query["type"] = type
    if status and status != "all":
        query["status"] = status
    return await db.support_tickets.find(query, {"_id": 0}).sort("updated_at", -1).limit(300).to_list(300)


@router.post("/support/{ticket_id}/status", dependencies=[Depends(get_admin_user)])
async def set_ticket_status(ticket_id: str, body: TicketStatus):
    if body.status not in TICKET_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    now = datetime.now(timezone.utc).isoformat()
    update = {"status": body.status, "updated_at": now}
    if body.status == "resolved":
        update["resolved_at"] = now
    res = await db.support_tickets.update_one({"ticket_id": ticket_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"status": body.status}


@router.post("/support/{ticket_id}/reply")
async def reply_to_ticket(ticket_id: str, body: TicketReply, admin: dict = Depends(get_admin_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text required")
    now = datetime.now(timezone.utc).isoformat()
    msg = {"from": "admin", "author": admin.get("name") or "Admin", "text": text, "at": now}
    res = await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$push": {"messages": msg}, "$set": {"updated_at": now, "status": "in_review"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return msg


@router.get("/referrals", dependencies=[Depends(get_admin_user)])
async def referrals():
    cfg = await db.settings.find_one({"key": "referral_config"}, {"_id": 0}) or DEFAULT_REFERRAL_CONFIG
    rows = await db.referrals.find({}, {"_id": 0}).sort("created_at", -1).limit(300).to_list(300)
    completed = [r for r in rows if r.get("status") == "completed"]
    return {
        "config": {k: cfg.get(k, DEFAULT_REFERRAL_CONFIG[k]) for k in DEFAULT_REFERRAL_CONFIG},
        "stats": {
            "total": len(rows),
            "completed": len(completed),
            "pending": len(rows) - len(completed),
            "rewards_paid": round(sum(r.get("reward_total", 0) for r in completed), 2),
        },
        "rows": rows,
    }


@router.post("/referrals/config", dependencies=[Depends(get_admin_user)])
async def update_referral_config(body: ReferralConfig):
    if body.reward_referrer < 0 or body.reward_referee < 0:
        raise HTTPException(status_code=400, detail="Rewards must be non-negative")
    doc = {
        "enabled": body.enabled,
        "reward_referrer": float(body.reward_referrer),
        "reward_referee": float(body.reward_referee),
    }
    await db.settings.update_one({"key": "referral_config"}, {"$set": {"key": "referral_config", **doc}}, upsert=True)
    return doc
