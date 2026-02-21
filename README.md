# Prospex — Precision Prospecting Platform

Internal B2B lead generation tool for SMMA agencies targeting med spas and aesthetic clinics.

## Quick Start (30 minutes to live)

### Step 1: Create Supabase Database (10 min)
1. Go to [supabase.com](https://supabase.com) → Sign up (free)
2. Click **New Project** → Pick a name and password → Create
3. Go to **SQL Editor** (left sidebar)
4. Open the file `supabase-schema.sql` from this project
5. Copy the entire contents and paste into the SQL Editor
6. Click **Run** — you should see "Success" messages
7. Go to **Settings → API** → Copy your:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

### Step 2: Upload to GitHub (5 min)
1. Go to [github.com](https://github.com) → Sign up or log in
2. Click **+** (top right) → **New repository**
3. Name it `prospex` → Click **Create repository**
4. Click **uploading an existing file** link
5. Drag and drop ALL files from this project folder
6. Click **Commit changes**

### Step 3: Deploy to Vercel (5 min)
1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. Click **Add New → Project**
3. Find your `prospex` repository → Click **Import**
4. Under **Environment Variables**, add these (one by one):

| Variable Name | Where to Get It |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key |
| `OUTSCRAPER_API_KEY` | outscraper.com → Profile → API Keys |
| `APIFY_API_TOKEN` | apify.com → Settings → Integrations → API Token |
| `FIRECRAWL_API_KEY` | firecrawl.dev → Dashboard → API Keys |
| `OPENAI_API_KEY` | platform.openai.com → API Keys → Create |
| `DATAFORSEO_LOGIN` | dataforseo.com → Dashboard → API Access |
| `DATAFORSEO_PASSWORD` | dataforseo.com → Dashboard → API Access |
| `GHL_API_KEY` | GoHighLevel → Settings → API Keys |
| `GHL_LOCATION_ID` | GoHighLevel → Settings → Business Info → Location ID |

5. Click **Deploy**
6. Wait 2-3 minutes → Your app is live! 🎉

### Step 4: Access Your App
- Vercel will give you a URL like `prospex-xyz.vercel.app`
- Bookmark it — this is your lead generation command center

## Features

- **Lead Scraping** — Google Maps, Yelp, Fresha
- **Website Audit** — 12-point check (SSL, speed, mobile, SEO, chatbot, booking, etc.)
- **Lead Scoring** — 0-100 score based on contact info, audit issues, reviews
- **Deep Audit** — SEO rankings, competitor analysis, review audit, AI search visibility
- **GoHighLevel Push** — One-click CRM integration with full data mapping
- **CSV Export** — Download lead database anytime

## Monthly Costs

| Service | Free Tier | Paid Estimate |
|---|---|---|
| Vercel (hosting) | 100GB bandwidth | $0 |
| Supabase (database) | 500MB, 50K users | $0 |
| Outscraper | 500 records/mo | $0-30/mo |
| Apify | $5 free credit/mo | $0-49/mo |
| Firecrawl | — | $16/mo |
| OpenAI | — | $5-15/mo |
| DataForSEO | — | $5-20/mo |
| **Total** | | **~$26-130/mo** |

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS + custom dark theme
- **Hosting:** Vercel (free tier)
- **Icons:** Lucide React
