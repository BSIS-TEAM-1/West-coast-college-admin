# Environment Configuration

## Development
- Use `.env.development` for local development
- API URL: `http://localhost:3001`

## Production  
- Use `.env.production` for production deployment
- API URL: `https://west-coast-college-admin.onrender.com`

## Current Setup
- `.env` file is currently set to development
- Copy appropriate file to `.env` when switching environments
- Keep API keys only in local `.env` files and never hardcode them in source code

## Semaphore SMS
- Add these variables in `admin/.env` (or your deployment environment):
- `SEMAPHORE_API_KEY=...` (required)
- `SEMAPHORE_SENDER_NAME=...` (optional)
- `SEMAPHORE_API_URL=https://api.semaphore.co/api/v4/messages` (optional)
- `SEMAPHORE_TIMEOUT_MS=10000` (optional)

## SMS API PH (Phone Verification Sender with Auto-Fallback)
- Phone verification route now sends through this gateway endpoint:
- `SMS_API_PH_API_KEY=...` (required)
- `SMS_API_PH_URL=https://sms-api-ph-gceo.onrender.com/send/sms` (optional)
- `SMS_API_PH_TIMEOUT_MS=15000` (optional)
- Gateway fallback behavior (managed by your API): SMS -> Email -> Push.

## Semaphore Email (SMS Fallback)
- Optional direct provider integration (not used by the current phone verification route).
- `SEMAPHORE_EMAIL_API_KEY=...` (optional, falls back to `SEMAPHORE_API_KEY`)
- `SEMAPHORE_EMAIL_API_URL=...` (recommended: set your exact Semaphore Email endpoint)
- `SEMAPHORE_EMAIL_FROM=...` (optional)
- `SEMAPHORE_EMAIL_FROM_NAME=...` (optional)
- `SEMAPHORE_EMAIL_TIMEOUT_MS=10000` (optional)

## SendGrid Email (Fallback After Semaphore Email)
- Optional direct provider integration (not used by the current phone verification route).
- `SENDGRID_API_KEY=...` (required for SendGrid)
- `SENDGRID_FROM_EMAIL=...` (required; must be verified/authenticated sender/domain)
- `SENDGRID_FROM_NAME=West Coast College` (optional)
- `SENDGRID_REPLY_TO=...` (optional)
- `SENDGRID_API_URL=https://api.sendgrid.com/v3/mail/send` (optional)
- `SENDGRID_TIMEOUT_MS=10000` (optional)

## Switching Environments
```bash
# For development
cp .env.development .env

# For production
cp .env.production .env
```
