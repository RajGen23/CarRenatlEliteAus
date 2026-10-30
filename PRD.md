# EliteReserve — Product Requirements

## Overview

EliteReserve is a luxury car rental marketplace for Melbourne. It has three experiences:

- **Renters** browse the fleet, request bookings, pay from a wallet, apply coupons, leave reviews and keep a wishlist.
- **Hosts** (vendors) onboard their business, list vehicles, approve or decline booking requests and track earnings and payouts.
- **Admins** run the platform from a web portal at `/admin`.

Stack: Expo (React Native, expo-router) on the client, FastAPI and MongoDB on the server. Users sign in with a username or email and password; the API issues session tokens.

Signing up requires a valid, unique email address and accepting the Terms of Service. The acceptance time and terms version (`TERMS_VERSION`) are stored on the user.

## Renters

- Fleet search with category, price and rating filters; featured cars on the home screen. Only live cars are listed (see Hosts).
- A verification profile (name, phone, date of birth, address, licence number and expiry) is required before the first booking request.
- **Request to book**: a request is created as `pending` and nothing is charged. The wallet is charged once, when the host accepts.
- Pickup must be in the future and the return after pickup. Dates that overlap a confirmed trip or a host-blocked day are rejected, and checkout shows them as unavailable (`GET /cars/{id}/availability`).
- The renter must tick the rental agreement and cancellation policy before requesting; the acceptance time is stored on the booking.
- Reviews are limited to renters who completed a trip in that car, one review per trip.
- Bookings are grouped as Requests, Upcoming, Past and Closed (cancelled or declined). Declined requests show the host's reason and note.
- Cancelling a pending request costs nothing; cancelling an upcoming booking refunds 80% to the wallet.
- Coupons are managed by admins and applied at checkout.

## Hosts

- Onboarding collects business, licence and bank details. KYC starts as `pending` until an admin approves it (or is auto-approved when `AUTO_APPROVE_VENDOR_KYC` is on). Until then the host can add cars, but nothing is shown to renters and the host can't accept requests or request payouts.
- Fleet management: create, edit and delete vehicles; block and unblock dates on a calendar. Dates with a confirmed trip can't be blocked.
- Every vehicle needs an insurance certificate, a registration certificate and the insurance expiry date. New vehicles, and vehicles whose documents or expiry change, go back to `pending` until an admin approves them.
- Documents are stored privately (`vehicle_documents`) and are only readable by the owning host and admins. They are never part of the public car record.
- A car is **live** when it is available, approved, its insurance hasn't expired and its host is approved and active. The fleet screen shows each car's `listing_status`.
- Requests tab shows each pending request with the renter's name, trip history, rating and verification status. Phone, email and licence details are shared once the host accepts; home address and date of birth are never shared with hosts.
- Accept charges the renter and re-checks availability; overlapping pending requests for the same car are then declined with "Dates no longer available". Decline requires one of five preset reasons plus an optional note. Requests not answered within 24 hours are declined automatically.
- Confirmed trips are marked completed once the return time passes, by a background task that runs every five minutes.
- Dashboard, earnings, invoices and payout requests. Payouts are limited to the balance earned from completed trips. The platform commission is 15%.

## Admin portal

| Area | Capabilities |
| --- | --- |
| Overview | Revenue, commission, bookings, active rentals, customers, vendors, monthly growth, six-month revenue chart |
| Users | Search and filter, block or unblock (blocking ends active sessions), verify |
| Vendors | Approve or reject KYC, suspend (suspension takes the vendor's cars off the market) |
| Vehicles | Approval status, insurance expiry alerts, view insurance and registration documents, approve (requires both documents and valid insurance) or reject |
| Bookings | Status and refund filters, issue refunds to the wallet |
| Coupons | Create, edit, deactivate, delete |
| Finance | Gross, commission, vendor payouts, tax and GST, monthly breakdown, per-vendor payouts due |
| Revenue | GMV, average booking value, LTV, CAC, fleet utilisation, repeat rate, GMV trend |
| Featured | Feature cars on the renter home screen; vendor subscription plans (Free, Premium $199, Elite $499) |
| Support | Complaints and disputes with message threads, status workflow (open, in review, resolved) |
| Referrals | Programme settings (rewards for referrer and referee) and referral history |

## Payments and metrics

- **Wallet.** No payment provider is integrated yet. Top-ups are disabled unless `DEMO_PAYMENTS=true`, in which case they add test credit without charging a card, and the app labels them as demo top-ups.
- **CAC** needs real acquisition spend. Set `MARKETING_SPEND_MONTHLY`; until then the Revenue screen shows CAC as unavailable.

## Backlog

- Card payments (Stripe) for wallet top-ups and booking charges.
- Email verification and transactional emails (confirmations, receipts, cancellations).
- Host-uploaded car photos (listing photos are still image URLs).
- Identity checks for renter licences (the "licence verified" badge only means a photo is on file).
- Live vehicle tracking.
- Push notifications.

## Architecture

```
backend/
  server.py            App setup, router registration, CORS, startup hook
  config.py            Settings read from the environment
  database.py          MongoDB client
  security.py          Password hashing, sessions, user/vendor/admin dependencies
  models.py            Request bodies
  bootstrap.py         Indexes, record backfills, admin account, optional demo data
  routes/
    auth.py            Register, login, current user, logout
    catalog.py         Cars, reviews, coupons
    renter.py          Renter profile, bookings, wallet, wishlist
    vendor.py          Host onboarding, fleet, requests, earnings, payouts
    admin.py           Overview, users, vendors, vehicles, bookings, coupons
    admin_finance.py   Finance report, revenue metrics
    admin_marketplace.py  Featured listings, vendor subscriptions
    admin_support.py   Support desk, referral programme
  services/
    availability.py    Booking windows, calendar dates, double-booking checks
    bookings.py        Booking rules shared by renter and host routes
    documents.py       Private vehicle document storage
    listings.py        Which cars are live on the marketplace
    locks.py           Short-lived locks for accepts, date blocking and payouts
    reporting.py       Monthly aggregations for admin reports
  seed/
    catalog.py         Sample fleet and reviews
    demo.py            Demo accounts and sample activity (SEED_DEMO_DATA only)
  tests/               API test suite
frontend/
  app/(tabs)/          Renter app
  app/(vendor)/        Host app
  app/admin/           Admin portal
  src/                 API client, auth context, app config, theme, shared components
```

Booking statuses: `pending`, `upcoming`, `completed`, `cancelled`, `declined`.

## Development notes

- Avoid fractional `borderWidth` values in React Native styles; they crash React Native Web 0.21.
- If Metro serves stale output, restart with `npx expo start -c`.
