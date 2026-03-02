# Props Tool (MVP)

HTML/CSS/vanilla JS + Node/Express + SQLite tool for prop buying workflows.

## Features
- Project creation
- CSV import for props
- Search all props for exactly 3 budget options (Prime + next day only)
- Mock mode by default, Rainforest provider if `RAINFOREST_API_KEY` is set
- Purchasing list with CSV export and clipboard copy

## Auth later
For production, add auth via session middleware (e.g. Passport + Google OAuth), tie projects to user_id, and scope all queries by user.

## Run
```bash
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:3000.
