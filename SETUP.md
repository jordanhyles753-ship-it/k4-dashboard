# K4 Dashboard — Vercel Deployment

## One-time setup (~10 minutes)

### 1. Push to GitHub

Open Terminal, then:

```bash
cd ~/Documents/K4/k4-dashboard
git init
git add .
git commit -m "Initial K4 dashboard"
git branch -M main
git remote add origin https://github.com/jordanjones619/k4-dashboard.git
git push -u origin main
```

> First create the repo at https://github.com/new  
> Name it `k4-dashboard`, set it to **Private**, don't add any files.

---

### 2. Deploy to Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click **Add New → Project**
3. Import `jordanjones619/k4-dashboard`
4. Under **Environment Variables**, add these two:

| Name | Value |
|------|-------|
| `ASANA_TOKEN` | your Asana PAT |
| `KANBAN_TOKEN` | your Kanban token |

5. Click **Deploy**

You'll get a live URL like `https://k4-dashboard.vercel.app`

---

### 3. Share with your analyst

Send her the Vercel URL. Every time she opens it, the page fetches fresh data from Asana and Kanban automatically. Data is cached for 5 minutes, so rapid refreshes are instant.

---

## Keeping K4 data current

The K4 data (events, workflow steps, active users) comes from the CSV export and is baked into the page. To update it:

1. Export a new CSV from K4
2. Run the build script (ask Jordan to do this — it takes ~1 minute)
3. Commit and push — Vercel auto-redeploys in ~30 seconds

```bash
# After rebuilding index.html:
cd ~/Documents/K4/k4-dashboard
git add public/index.html
git commit -m "Update K4 data $(date +%Y-%m-%d)"
git push
```

---

## Rotating API tokens

If either token expires, update the environment variable in Vercel:
- Dashboard → Project → Settings → Environment Variables
- Edit the value, save — Vercel redeploys automatically.
