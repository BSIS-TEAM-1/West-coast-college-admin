# Environment Configuration

## Development
- Use `.env.development` for local development
- API URL: `http://localhost:3001`

## Production  
- Use `.env.production` for production deployment
- API URL: `https://west-coast-college.onrender.com`

## Current Setup
- `.env` file is currently set to development
- Copy appropriate file to `.env` when switching environments
- Keep API keys only in local `.env` files and never hardcode them in source code
- The React app reads `.env.development` / `.env.production` automatically through Vite
- The Express server reads `admin/.env`, so copy the matching file into `.env` for local server runs
- Deployment platforms such as Render do not read `admin/.env.production` from this repo automatically; set the same variables in the service environment instead
- If production shows `Email verification service is not configured for login verification.`, the running service is missing a complete email provider configuration at runtime

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

## Gmail API Email Verification
- Used by the admin profile email verification flow.
- Add these variables in `admin/.env.development`, `admin/.env.production`, or your deployment environment:
- `GMAIL_CLIENT_ID=...` (required)
- `GMAIL_CLIENT_SECRET=...` (required)
- `GMAIL_REFRESH_TOKEN=...` (required)
- `GMAIL_SENDER_EMAIL=yourgmail@gmail.com` (required; should match the Google account that granted the refresh token)
- `GMAIL_SENDER_NAME=West Coast College` (optional)
- `VERIFICATION_EMAIL_PROVIDER_PRIORITY=gmail-api` (optional; Gmail only)
- `EMAIL_VERIFICATION_CODE_TTL_MS=600000` (optional; 10 minutes)
- OAuth Playground redirect URI for token generation: `https://developers.google.com/oauthplayground`

## Google Sign-In
- The login page uses Google Identity Services from `admin/src/pages/Login.tsx`, so `VITE_GOOGLE_SIGNIN_CLIENT_ID` must be a `Web application` OAuth client ID.
- Keep `VITE_GOOGLE_SIGNIN_CLIENT_ID` and `GOOGLE_SIGNIN_CLIENT_IDS` aligned to the same web client unless you intentionally allow multiple client IDs on the server.
- In Google Cloud Console, open `APIs & Services` -> `Credentials` -> your OAuth 2.0 Client ID -> `Authorized JavaScript origins` and add every frontend origin that will render the Google button.
- Use exact origins only: scheme + hostname + port, with no path and no trailing slash.
- Typical origins for this project:
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://localhost:5173` if you run the frontend over HTTPS locally
- `https://west-coast-college-admin.onrender.com` for the production frontend
- If Vite starts on another dev port such as `5174`, add that exact origin too or force the app back to `5173`.
- `Error 400: origin_mismatch` is raised by Google before the credential reaches your API, so fixing the Google Console origin list is required.

## Switching Environments
```bash
# For development
cp .env.development .env

# For production
cp .env.production .env
```
