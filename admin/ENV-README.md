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

## Switching Environments
```bash
# For development
cp .env.development .env

# For production
cp .env.production .env
```
