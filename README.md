# Props Tool (MVP)

HTML/CSS/vanilla JS + Node/Express + SQLite tool for prop buying workflows.

## Features
- Project creation
- CSV import for props
- Search all props for exactly 3 budget options (Prime + next day only)
- Rainforest provider for Amazon search/offers data
- Purchasing list with CSV export and clipboard copy
- Startup readiness diagnostics endpoint (`/api/health/startup`)

## Auth later
For production, add auth via session middleware (e.g. Passport + Google OAuth), tie projects to user_id, and scope all queries by user.

## Required live setup
This project now requires live server/API configuration. There is no offline mock runtime mode.

### 1) Install and configure
```bash
npm install
cp .env.example .env
```

Set these required values in `.env`:
- `RAINFOREST_API_KEY` (**required**) – server startup fails if missing.
- `AMAZON_DOMAIN` (recommended, default `amazon.co.uk`) – target Amazon marketplace.

Optional tuning values:
- `PORT` (default `3000`)
- `DEFAULT_DELIVERY_POSTCODE` (default `SW1A1AA`)
- `RAINFOREST_TIMEOUT_MS` (default `180000`)
- `SEARCH_CANDIDATE_LIMIT` (default `12`)
- `OFFERS_PAGES_MAX` (default `1`)
- `CACHE_TTL_HOURS` (default `6`)
- `CONCURRENCY_LIMIT` (default `2`)

### 2) Start
```bash
npm run dev
```
Open http://localhost:3000.

### 3) Verify provider readiness
- Basic startup readiness:
  - `GET /api/health/startup`
- Optional live provider check (uses one real Rainforest request):
  - `GET /api/health/startup?live=1`

If checks fail, the endpoint returns actionable diagnostics with failing check names and messages.

## Expected costs and limits
- Rainforest API usage is billable and consumes credits per request.
- Each prop search can issue multiple API calls (1 search + multiple offers lookups based on candidates/pages).
- Increasing `SEARCH_CANDIDATE_LIMIT` or `OFFERS_PAGES_MAX` increases request volume, latency, and cost.
- Run with conservative limits first and monitor Rainforest credit usage in your account dashboard.
