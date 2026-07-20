# Garment IO — KPI Dashboard

A full-stack dashboard that pulls live data from ClickUp and calculates per-developer and per-sprint KPIs.

## Project structure

```
kpi-dashboard/
├── proxy/          # Node.js CORS proxy for ClickUp API
│   ├── index.js
│   └── package.json
├── frontend/       # React + Vite dashboard
│   ├── src/
│   │   ├── App.jsx              # Main app, routing, filters
│   │   ├── ConfigScreen.jsx     # Setup/login screen
│   │   ├── SprintDashboard.jsx  # Sprint analytics view
│   │   ├── MemberDashboard.jsx  # Per-developer KPI cards
│   │   ├── components.jsx       # Shared UI components
│   │   ├── kpi.js               # KPI calculation logic
│   │   ├── api.js               # ClickUp API calls
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── Dockerfile          # Proxy container
├── docker-compose.yml
└── k8s.yaml            # k3s/k8s deployment
```

---

## Quick start (local)

### 1. Start the proxy

```bash
cd proxy
CLICKUP_TOKEN=pk_your_token_here node index.js
# Runs on http://localhost:3131
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
```

### 3. Connect in the browser

Fill in the config screen:
- **API Token** — ClickUp → avatar → Settings → Apps → API Token
- **Team ID** — number in your ClickUp workspace URL
- **Bugs list ID** — right-click your Bugs list → Copy link → last number
- **Backlog list IDs / URLs** — one or more list IDs or full ClickUp list URLs, separated by commas or spaces
- **Sprint folder ID** — right-click Tech/Prod Sprints folder → Copy link → last number

---

## Docker Compose

```bash
CLICKUP_TOKEN=pk_your_token docker-compose up
# Dashboard at http://localhost:5173
# Proxy at http://localhost:3131
```

---

## Render deployment

This repo can be deployed to Render as a single Node web service.

What Render runs:
- Build: `npm run build`
- Start: `npm start`

The Node server in `proxy/index.js` will:
- serve the built frontend from `frontend/dist`
- proxy `/api/v2/*` requests to ClickUp

Required environment variable on Render:
- `CLICKUP_TOKEN` — your ClickUp API token

Recommended setup:
1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select this repo.
3. Render will read `render.yaml`.
4. Set `CLICKUP_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the Render service environment.
5. Deploy.

Persistence for ratings / manual scores:
- Production should use Supabase for shared ratings storage.
- The proxy reads and writes manual ratings through Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- If those env vars are missing, the app falls back to a local `manual-data.json` file, which is fine locally but not reliable on Render free.

Create this table once in Supabase SQL Editor:

```sql
create table if not exists public.kpi_manual_data (
  key text primary key,
  periods jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

Recommended RLS setup for this table:

```sql
alter table public.kpi_manual_data enable row level security;
```

Because the app uses the server-side `SUPABASE_SERVICE_ROLE_KEY`, no public client policy is required for this table.

Health check:
- `/health`

Notes:
- The frontend still uses same-origin `/api/v2/...`, so no frontend API base URL is needed on Render.
- Team/list IDs can still come from the UI config screen or from frontend env values if you later choose to inject them at build time.

---

## k3s / Kubernetes deployment

```bash
# 1. Edit k8s.yaml — replace pk_your_token_here with real token
# 2. Build and load the proxy image
docker build -t clickup-kpi-proxy:latest .
k3s ctr images import clickup-kpi-proxy.tar

# 3. Apply
kubectl apply -f k8s.yaml

# 4. Serve the frontend build via your ingress
cd frontend && npm run build
# serve the dist/ folder via nginx or your existing ingress
```

---

## What it tracks

### Sprint dashboard
- Task completion % (done / total)
- Estimated vs tracked hours — team and per-developer
- Delivery rate (tracked / estimated)
- Average, min, and max cycle time (start → done)
- Bug fix rate
- Overdue tasks
- Tasks missing estimates
- Story point velocity
- Status breakdown (done / in progress / blocked / not started)
- Priority breakdown (urgent / high / normal / low)

### Team KPI dashboard (per developer)
- Feature delivery rate with 1–5 score (weight 20%)
- Task completion rate with 1–5 score (weight 15%)
- Bug fix rate with 1–5 score (weight 10%)
- Weighted KPI score
- Estimated vs tracked hours
- Average cycle time
- Radar chart of KPI scores
- Task status breakdown per person

### Filters
- Sprint selector
- Assignee filter
- Role filter (backend / frontend)
- Click any developer card to expand full detail view
- Role assignment panel (saved to localStorage)

---

## Score scale (1–5)

| Score | Delivery / Completion / Bug fix |
|-------|--------------------------------|
| 5 — Excellent | ≥ 95% |
| 4 — Good | ≥ 90% |
| 3 — Fair | ≥ 85% |
| 2 — Needs improvement | ≥ 80% |
| 1 — Poor | < 80% |
