# EliteReserve

Luxury car rental marketplace with renter, host and admin experiences.

- **Frontend:** Expo / React Native / expo-router (iOS, Android and web)
- **Backend:** FastAPI
- **Database:** MongoDB

See [PRD.md](PRD.md) for the product scope and code layout.

## Local development

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
cp .env.example .env      # then fill in the values
uvicorn server:app --reload
```

Settings live in `backend/.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `MONGO_URL`, `DB_NAME` | Database connection |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API from a browser |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin account created on first start if it doesn't exist. The password must be at least 12 characters and is never reset on later starts |
| `SEED_DEMO_DATA` | `true` loads demo accounts, the sample fleet and sample activity. Keep it `false` in production |
| `DEMO_PAYMENTS` | `true` lets wallet top-ups add test credit without a real payment. Defaults to `SEED_DEMO_DATA` |
| `WELCOME_WALLET_CREDIT` | Credit given to new accounts. Defaults to 5000 with demo payments, otherwise 0 |
| `MARKETING_SPEND_MONTHLY` | Monthly marketing spend used for CAC on the admin Revenue screen |
| `AUTO_APPROVE_VENDOR_KYC` | Approve host KYC without admin review. Defaults to `SEED_DEMO_DATA` |

With `SEED_DEMO_DATA=true` you can sign in as `userdemo` / `User@123` (renter) or `vendordemo` / `Vendor@123` (host). The login screen only shows these accounts in demo mode.

### Frontend

```bash
cd frontend
npm install
echo "EXPO_PUBLIC_BACKEND_URL=http://localhost:8000" > .env
npx expo start
```

## Tests

The API tests run against a live server with demo data enabled:

```bash
cd backend
SEED_DEMO_DATA=true ADMIN_PASSWORD='<12+ characters>' uvicorn server:app &
ADMIN_PASSWORD='<same password>' python -m pytest tests -q
```

`API_BASE_URL` points the tests at a server other than `http://localhost:8000`.
