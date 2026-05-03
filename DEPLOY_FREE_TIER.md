# DataReaper Free-Tier Deployment (Upstash + Cloudflare Pages + Render)

This guide matches the current repo configuration and variable names.

## 1) Upstash Redis (Free Tier)

1. Create a Redis database in Upstash.
2. Copy the TLS connection string (`rediss://...`).
3. Use the same value for both backend env vars:
   - `REDIS_URL`
   - `ARQ_REDIS_URL`

## 2) Cloudflare Pages (Frontend)

1. Connect this repo to Cloudflare Pages.
2. Set:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`
3. Add frontend env var:
   - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`
4. Deploy Pages and note your final frontend URL (for example `https://datareaper.pages.dev`).

## 3) Render Web Service (Backend API + ARQ Worker in one service)

This repo now starts both processes inside one Docker container for free-tier compatibility.

1. Create a new Render **Web Service** from this repo.
2. Set runtime to Docker and point to:
   - Dockerfile path: `backend/Dockerfile`
3. Add backend environment variables:
   - `APP_ENV=production`
   - `APP_DEBUG=false`
   - `APP_LOG_LEVEL=INFO`
   - `APP_HOST=0.0.0.0`
   - `FRONTEND_URL=https://<your-cloudflare-pages-domain>`
   - `APP_CORS_ORIGINS=["https://<your-cloudflare-pages-domain>"]`
   - `SHIELD_DASHBOARD_ORIGIN=https://<your-cloudflare-pages-domain>`
   - `SHIELD_API_BASE=https://<your-render-service>.onrender.com/api`
   - `REDIS_URL=rediss://...`
   - `ARQ_REDIS_URL=rediss://...`
   - `DATABASE_URL=<your-async-postgres-url>`
   - `SYNC_DATABASE_URL=<your-sync-postgres-url>`
   - `GROQ_API_KEY=<your-key>`
   - Plus any Gmail/Google keys you use.
4. Deploy.
5. After first deploy, open a Render shell and run:
   - `alembic upgrade head`

Notes:
- Render provides `PORT`; container startup now maps `APP_PORT` to `PORT` automatically.
- No custom start command is required when deploying with Dockerfile.

## 4) Final Wiring

1. After Render deploys, copy the backend URL.
2. Update Cloudflare Pages env:
   - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`
3. Redeploy Cloudflare Pages.
4. Verify:
   - Backend health/root endpoint responds.
   - Frontend loads and can call backend APIs.
