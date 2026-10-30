# Katuka's Kitchen — Production Full Stack

A production-oriented restaurant website with customer ordering, reservations, Paystack payments, WhatsApp handoff, SQLite persistence, and a protected admin dashboard.

## Local setup
1. Install Node.js 22.9+.
2. `npm ci`
3. Copy `.env.example` to `.env` and replace its example values. The `start` and `dev` scripts load `.env` automatically when present.
4. `npm start`
5. Customer site: `http://localhost:3000`
6. Admin: `http://localhost:3000/admin`

## Environment
- `ADMIN_KEY`: random secret of at least 32 characters for dashboard API access. Production startup fails if it is missing or too short.
- `PAYSTACK_PUBLIC_KEY`: Paystack public key.
- `PAYSTACK_SECRET_KEY`: Paystack secret key. Keep server-side only.
- `WHATSAPP_NUMBER`: international WhatsApp number without `+`, e.g. `2348012345678`.

## Paystack
Use test keys for staging and live keys for production. The server initializes transactions and verifies the transaction directly with Paystack before marking an order paid. Never expose the secret key to the browser.

## WhatsApp
The customer can hand off an order to WhatsApp after creating the order. Configure `WHATSAPP_NUMBER` with the restaurant's real business number.

## Deployment
### Docker
`docker build -t katukas-kitchen .`
`docker run --env-file .env -p 3000:3000 -v katuka-data:/app/data katukas-kitchen`

### Render
The included `render.yaml` uses the Dockerfile. Add the four environment variables in Render's dashboard. For SQLite persistence, attach a persistent disk mounted at `/app/data` on the selected paid service.

### Railway
The included `railway.toml` uses the Dockerfile. Add environment variables and a persistent volume mounted at `/app/data` if keeping SQLite in production.

## Production checklist
- Replace all sample menu data, phone, address and images.
- Use strong random `ADMIN_KEY`.
- Use Paystack live keys only after testing in test mode.
- Configure HTTPS at the hosting provider.
- Configure a persistent disk for SQLite or migrate to PostgreSQL for multi-instance/high-scale deployments.
- Add your real WhatsApp business number.
