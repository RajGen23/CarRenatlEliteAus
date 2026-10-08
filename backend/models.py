"""Request bodies shared across route modules."""
from typing import List, Literal, Optional

from pydantic import BaseModel

CarCategory = Literal["SUV", "Sedan", "Sports", "Luxury"]


# Auth
class UserRegister(BaseModel):
    username: str
    password: str
    name: Optional[str] = None
    email: Optional[str] = None


class UserLogin(BaseModel):
    identifier: str  # username or email
    password: str


# Renter
class BookingCreate(BaseModel):
    car_id: str
    pickup_location: str
    drop_location: str
    pickup_datetime: str  # ISO 8601
    drop_datetime: str
    coupon_code: Optional[str] = None
    payment_method: Literal["wallet"] = "wallet"


class RenterProfileUpsert(BaseModel):
    full_name: str
    phone: str
    dob: str  # YYYY-MM-DD
    address_line1: str
    city: str
    state: str
    postcode: str
    license_no: str
    license_expiry: str  # YYYY-MM-DD
    license_photo: Optional[str] = None  # base64 or URL
    id_photo: Optional[str] = None


class ReviewCreate(BaseModel):
    car_id: str
    rating: int
    comment: str


class WalletTopup(BaseModel):
    amount: float


class CouponValidate(BaseModel):
    code: str
    subtotal: float


# Vendor
class VendorOnboard(BaseModel):
    company: str
    phone: str
    abn: Optional[str] = None
    license_no: str
    license_photo_b64: Optional[str] = None
    id_photo_b64: Optional[str] = None
    bank_account_name: str
    bank_bsb: str
    bank_account_no: str


class VendorProfilePatch(BaseModel):
    company: Optional[str] = None
    phone: Optional[str] = None
    abn: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_bsb: Optional[str] = None
    bank_account_no: Optional[str] = None


class VendorCarUpsert(BaseModel):
    car_id: Optional[str] = None  # set when editing
    brand: str
    model: str
    category: CarCategory
    price_per_day: float
    weekly_price: Optional[float] = None
    security_deposit: float = 0.0
    promo_pct: Optional[float] = None
    fuel_type: str
    transmission: str
    seats: int
    image: str  # base64 or URL
    gallery: List[str] = []
    features: List[str] = []
    description: str
    horsepower: int = 0
    top_speed: int = 0
    acceleration: str = ""
    registration_no: Optional[str] = None
    year: Optional[int] = None
    insurance_doc_b64: Optional[str] = None
    rc_doc_b64: Optional[str] = None
    available: bool = True


class BlockDatesReq(BaseModel):
    dates: List[str]  # YYYY-MM-DD


class PayoutRequest(BaseModel):
    amount: float


class DeclineReq(BaseModel):
    reason: str
    note: Optional[str] = None


# Admin
class CouponIn(BaseModel):
    code: str
    discount_pct: int
    description: str


class RefundBody(BaseModel):
    amount: Optional[float] = None
    reason: Optional[str] = None


class TicketReply(BaseModel):
    text: str


class TicketStatus(BaseModel):
    status: str


class ReferralConfig(BaseModel):
    enabled: bool
    reward_referrer: float
    reward_referee: float


class PlanBody(BaseModel):
    plan: str
