# K4 Dashboard — Project Context for Claude

## What this is
A live production dashboard for the Abeka K4 publishing team at PCCI. It aggregates data from K4 (vjoon publishing system), Asana, and Kanban into a single web app.

**Live URL:** https://k4-dashboard.vercel.app  
**GitHub:** https://github.com/jordanhyles753-ship-it/k4-dashboard  
**Vercel project:** jordans-projects-447a3b15 / k4-dashboard

---

## Architecture

- `public/index.html` — single-file frontend (all tabs, charts, logic)
- `api/k4proxy.js` — Vercel serverless function; SOAP proxy to K4 server
- `vercel.json` — routes `/api/*` to serverless functions, `/*` to index.html

Deployed on Vercel (Hobby). Auto-deploys from GitHub main branch.

---

## Tabs

1. **Products** — K4 issue counts per product
2. **In Progress** — active K4 issues
3. **K4 Activity** — event log
4. **Bottlenecks** — workflow analysis
5. **Asana + Kanban** — live Asana project completion + Kanban board activity
6. **Schedule** — schedule status (requires Asana data loaded first)
7. **Team** — team view
8. **K4 Live** — live SOAP data fetched via `/api/k4proxy`

---

## K4 Authentication (important — hard-won knowledge)

**K4 server:** `https://accelerated-abeka-v16-k4.fluxcloud.us/K4ServerABEKA`  
**SOAP endpoint:** `/services/PublicationBasic` → `getIssuesByPublicationID1`

K4 v16 uses GWT-RPC login (not standard SOAP auth). The JSESSIONID cookie is `httpOnly` — JavaScript can't read it. **Solution implemented:**

- User pastes JSESSIONID from Chrome DevTools into the K4 Live tab setup panel
- Dashboard stores it in `localStorage` as `k4jsessionid`
- Passed as `?session=JSESSIONID` query param to `/api/k4proxy`
- Proxy sends it as `Cookie: JSESSIONID=...` to K4

**To get JSESSIONID:**
1. Open K4 admin: `https://accelerated-abeka-v16-k4.fluxcloud.us/K4ServerABEKA/admin/`
2. Log in as Jordan Jones
3. Chrome DevTools → Application → Cookies → that domain → copy JSESSIONID value
4. Paste into K4 Live tab setup panel → Save & Load

Session persists in localStorage until K4 server expires it (logout or long inactivity).

**Things that were tried and don't work:**
- WS-Security SOAP headers → K4 rejects with MustUnderstand fault
- `beginLogInAllPublications1` SOAP login → requires pre-existing authenticated session
- GWT-RPC login from serverless → proprietary binary format, not feasible
- Anonymous session via Origin/Referer headers → JSESSIONID created but can't call SOAP ops

---

## Asana + Kanban Tab

- Asana token: pasted directly into the UI field (calls Asana API from browser)
- Kanban token: pasted into UI field (calls `https://kanban.abeka.com/api/v1/boards`)
- No Vercel env vars needed for these — browser calls APIs directly
- Kanban token: Jordan still needs to obtain from kanban.abeka.com account settings or admin

---

## Git workflow note

macOS-mounted workspace (`~/Documents/K4/k4-dashboard/`) has filesystem lock issues preventing `git commit` from within that path. Use a fresh clone in `/tmp/` for git operations:

```bash
cd /tmp && git clone https://github.com/jordanhyles753-ship-it/k4-dashboard.git k4-fresh
cd k4-fresh
# make changes, then:
git add -A && git commit -m "message" && git push
# then copy changed files back to ~/Documents/K4/k4-dashboard/ if needed
```

---

## Current status (as of 2026-06-17)

- ✅ Dashboard live at k4-dashboard.vercel.app
- ✅ K4 Live tab works — just needs JSESSIONID pasted on first use (or after session expires)
- ✅ Asana + Kanban tab works — Asana token must be pasted once, then persists via localStorage
- ✅ Kanban token pre-seeded in localStorage on first visit (`NAPVPAC7YLJJVS8F`) — no manual paste needed
- ✅ Both tokens auto-saved to localStorage on use and restored on page load
- ✅ Page auto-loads live data on open if Asana token is already saved
- ⏳ Schedule tab depends on Asana data being loaded first (works once Asana loads)

## Token quick reference
- Kanban API token: `NAPVPAC7YLJJVS8F` (Bearer auth, kanban.abeka.com)
- Kanban Bearer header: `Authorization: Bearer NAPVPAC7YLJJVS8F`
- Asana token: paste from Asana → My Profile → Apps → Personal Access Tokens (saved in localStorage after first use)
- K4 JSESSIONID: Chrome DevTools → Application → Cookies → accelerated-abeka-v16-k4.fluxcloud.us

---

## User
Jordan Jones — jordan.jones@pcci.edu — Abeka K4 publishing team, PCCI
