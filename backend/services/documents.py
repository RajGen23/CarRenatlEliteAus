"""Vehicle insurance and registration documents.

Documents live in their own collection and are never part of a car record, so the
public catalogue can't leak them. Only the owning host and admins can read them.
"""
import base64
import binascii
import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException

from database import db
from models import DocumentUpload

log = logging.getLogger(__name__)

DOCUMENT_KINDS = ("insurance", "registration")
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

LEGACY_CAR_FIELDS = {"insurance_doc_b64": "insurance", "rc_doc_b64": "registration"}


def _check_kind(kind: str) -> None:
    if kind not in DOCUMENT_KINDS:
        raise HTTPException(status_code=404, detail="Unknown document type")


def _decode(upload: DocumentUpload, label: str) -> Tuple[str, str, int]:
    content_type = (upload.content_type or "").lower().strip()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"{label} must be a JPEG, PNG, WebP or PDF file.")
    data = upload.data_b64.split(",", 1)[1] if upload.data_b64.startswith("data:") else upload.data_b64
    try:
        size = len(base64.b64decode(data, validate=True))
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} could not be read. Please upload it again.")
    if size == 0:
        raise HTTPException(status_code=400, detail=f"{label} is empty.")
    if size > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail=f"{label} must be 5 MB or smaller.")
    return content_type, data, size


def validate_upload(upload: DocumentUpload, kind: str) -> Tuple[str, str, int]:
    label = "Insurance certificate" if kind == "insurance" else "Registration certificate"
    return _decode(upload, label)


async def save_document(car_id: str, vendor_id: Optional[str], kind: str, upload: DocumentUpload) -> None:
    _check_kind(kind)
    content_type, data, size = validate_upload(upload, kind)
    await db.vehicle_documents.update_one(
        {"car_id": car_id, "kind": kind},
        {"$set": {
            "car_id": car_id,
            "vendor_id": vendor_id,
            "kind": kind,
            "content_type": content_type,
            "file_name": (upload.file_name or "").strip()[:120] or None,
            "size": size,
            "data_b64": data,
            "review_status": "pending",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


async def list_documents(car_id: str) -> List[dict]:
    return await db.vehicle_documents.find(
        {"car_id": car_id}, {"_id": 0, "data_b64": 0}
    ).to_list(len(DOCUMENT_KINDS))


async def get_document(car_id: str, kind: str) -> dict:
    _check_kind(kind)
    doc = await db.vehicle_documents.find_one({"car_id": car_id, "kind": kind}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def has_all_documents(car_id: str) -> bool:
    kinds = {d["kind"] for d in await list_documents(car_id)}
    return kinds.issuperset(DOCUMENT_KINDS)


async def mark_reviewed(car_id: str, status: str) -> None:
    await db.vehicle_documents.update_many(
        {"car_id": car_id},
        {"$set": {"review_status": status, "reviewed_at": datetime.now(timezone.utc).isoformat()}},
    )


async def delete_documents(car_id: str) -> None:
    await db.vehicle_documents.delete_many({"car_id": car_id})


async def migrate_legacy_car_documents() -> None:
    """Move documents that older versions stored on the car record into private storage."""
    query = {"$or": [{field: {"$exists": True}} for field in LEGACY_CAR_FIELDS]}
    moved = 0
    async for car in db.cars.find(query, {"_id": 0, "car_id": 1, "vendor_id": 1, **{f: 1 for f in LEGACY_CAR_FIELDS}}):
        for field, kind in LEGACY_CAR_FIELDS.items():
            raw = car.get(field)
            if not raw or await db.vehicle_documents.find_one({"car_id": car["car_id"], "kind": kind}):
                continue
            content_type = "application/pdf" if raw.startswith("data:application/pdf") else "image/jpeg"
            data = raw.split(",", 1)[1] if raw.startswith("data:") else raw
            await db.vehicle_documents.insert_one({
                "car_id": car["car_id"],
                "vendor_id": car.get("vendor_id"),
                "kind": kind,
                "content_type": content_type,
                "file_name": None,
                "size": len(data) * 3 // 4,
                "data_b64": data,
                "review_status": "pending",
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            })
            moved += 1
        await db.cars.update_one({"car_id": car["car_id"]}, {"$unset": {f: "" for f in LEGACY_CAR_FIELDS}})
    if moved:
        log.info("Moved %d vehicle documents to private storage", moved)
