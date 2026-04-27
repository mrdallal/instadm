# InstaDM — Instagram Comment-to-DM Automation

Automatically reply to Instagram comments AND send a private DM whenever someone uses a keyword — exactly like ManyChat, but self-hosted.

---

## How It Works

1. Someone comments **"link"** (or any keyword you set) on your Instagram post.
2. The Instagram Graph API sends a webhook event to your server.
3. This app matches the comment against your active campaigns.
4. It instantly **replies to the comment** and **sends the commenter a DM**.

---

## Quick Start (local)

```bash
# 1 — Clone & install
pip install -r requirements.txt

# 2 — Configure environment
cp .env.example .env
# Fill in your credentials (see setup guide below)

# 3 — Run
uvicorn main:app --reload --port 8000

# 4 — Open dashboard
# http://localhost:8000/dashboard
```

---

## Full Instagram API Setup Guide

### Step 1 — Convert your Instagram account

Your Instagram account must be a **Business** or **Creator** account.

1. Open Instagram → Settings → Account → Switch to Professional Account.
2. Choose **Business** (recommended for API access).
3. Connect it to a Facebook Page (create one if needed — it just needs to exist).

---

### Step 2 — Create a Facebook Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in with your Facebook account.
2. Click **My Apps → Create App**.
3. Select **"Other"** as use case, then **"Business"** as app type.
4. Give it a name (e.g. "InstaDM Bot") and click **Create App**.

---

### Step 3 — Add Instagram Graph API

1. In your app dashboard, click **Add Product**.
2. Find **Instagram Graph API** and click **Set Up**.
3. Under **Instagram Graph API → Settings**, click **Add Instagram Account** and connect your Business Instagram account.

---

### Step 4 — Request Permissions

In your app's **App Review → Permissions and Features**, request:

| Permission | Purpose |
|---|---|
| `instagram_manage_comments` | Read comments and post replies |
| `instagram_manage_messages` | Send direct messages |
| `pages_show_list` | List connected Facebook pages |
| `pages_read_engagement` | Read page/post data |

> **Note on DMs**: Instagram DMs via the Graph API only work if the recipient has **previously sent a message to your business account**, OR if your app has `instagram_manage_messages` approved through App Review. To apply, go to **App Review → Permissions → instagram_manage_messages** and submit a use case explaining your automation.

For **development/testing** (before App Review), you can add test users in **Roles → Test Users** — DMs will work for those accounts.

---

### Step 5 — Generate a Long-Lived Access Token

**Option A — Graph API Explorer (easiest for testing)**

1. Go to [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer).
2. Select your app from the dropdown.
3. Click **Generate Access Token** and grant the required permissions.
4. Copy the short-lived token, then exchange it for a long-lived one:

```bash
curl "https://graph.facebook.com/v19.0/oauth/access_token\
?grant_type=fb_exchange_token\
&client_id=YOUR_APP_ID\
&client_secret=YOUR_APP_SECRET\
&fb_exchange_token=SHORT_LIVED_TOKEN"
```

The response contains a `access_token` valid for **60 days**.

**Refreshing before expiry** — run the same exchange call with the current long-lived token as `fb_exchange_token`. Do this every ~50 days.

**Option B — Python script**

```python
import httpx, os
r = httpx.get("https://graph.facebook.com/v19.0/oauth/access_token", params={
    "grant_type": "fb_exchange_token",
    "client_id": os.getenv("FB_APP_ID"),
    "client_secret": os.getenv("FACEBOOK_APP_SECRET"),
    "fb_exchange_token": os.getenv("OLD_TOKEN"),
})
print(r.json()["access_token"])
```

---

### Step 6 — Find Your IDs

**Page ID**
```bash
curl "https://graph.facebook.com/v19.0/me/accounts?access_token=YOUR_TOKEN"
# Look for the "id" field of your page
```

**Instagram Business Account ID**
```bash
curl "https://graph.facebook.com/v19.0/PAGE_ID?fields=instagram_business_account&access_token=YOUR_TOKEN"
# The "instagram_business_account.id" value is what you need
```

**Post ID** (for a specific video/photo)
1. Go to [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer).
2. Make a GET request to: `/{instagram-account-id}/media?fields=id,caption,permalink`
3. Find your post in the list and copy its `id`.

Or get it from the post URL: `instagram.com/p/ABC123/` → use the shortcode with the API:
```bash
curl "https://graph.facebook.com/v19.0/instagram_oembed?url=https://www.instagram.com/p/ABC123/&access_token=TOKEN"
```

---

### Step 7 — Configure the Webhook

1. In your Developer App, go to **Webhooks** (left sidebar).
2. Click **Add Subscriptions** → select **Instagram**.
3. Set **Callback URL** to: `https://your-domain.com/webhook/instagram`
4. Set **Verify Token** to the same value as your `WEBHOOK_VERIFY_TOKEN` env var.
5. Subscribe to the **`comments`** field.
6. Click **Verify and Save**.

> For local development, use [ngrok](https://ngrok.com): `ngrok http 8000` and use the HTTPS URL.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | Long-lived User Access Token (60 days) |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Your IG Business Account numeric ID |
| `FACEBOOK_APP_SECRET` | Found in App Dashboard → Settings → Basic |
| `WEBHOOK_VERIFY_TOKEN` | Any random secret string you choose |
| `DATABASE_URL` | `sqlite:///./app.db` for local; Postgres URL for cloud |

---

## Deployment

### Railway

```bash
# Push to GitHub, then connect repo in Railway
# Set env vars in Railway Dashboard → Variables
```

The included `railway.toml` handles build + deploy automatically.

### Render

1. Connect your GitHub repo in [render.com](https://render.com).
2. Use the included `render.yaml` — Render will auto-detect it.
3. Add env vars in the Render dashboard.

### Docker

```bash
docker build -t instadm .
docker run -p 8000:8000 --env-file .env instadm
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/dashboard` | Web dashboard UI |
| `GET/POST` | `/webhook/instagram` | Facebook webhook endpoint |
| `GET/POST` | `/api/config` | Read/save Instagram credentials |
| `GET/POST` | `/api/campaigns` | List/create campaigns |
| `GET/PUT/DELETE` | `/api/campaigns/{id}` | Get/update/delete campaign |
| `PATCH` | `/api/campaigns/{id}/toggle` | Toggle active/inactive |
| `GET` | `/api/post-preview/{post_id}` | Fetch post thumbnail + caption |
| `GET` | `/api/stats` | Dashboard stats |

---

## Project Structure

```
├── main.py              # FastAPI app entry point
├── instagram.py         # Instagram Graph API client
├── models.py            # SQLAlchemy ORM models
├── database.py          # DB session + init
├── routes/
│   ├── webhook.py       # Webhook endpoints (verify + receive)
│   ├── dashboard.py     # Dashboard HTML route
│   └── api.py           # REST API (campaigns, config, stats)
├── static/
│   ├── style.css        # Dashboard styles
│   └── app.js           # Dashboard JavaScript
├── templates/
│   └── dashboard.html   # Main dashboard template
├── .env.example
├── Dockerfile
├── railway.toml
├── render.yaml
└── requirements.txt
```

---

## Security Notes

- Webhook signature validation uses `X-Hub-Signature-256` (HMAC-SHA256 with your App Secret).
- All credentials are stored server-side in the database and `.env` — never exposed to the frontend.
- The access token displayed in the Settings page is masked (`type="password"`).
- For production, use PostgreSQL instead of SQLite by changing `DATABASE_URL`.

---

## Limitations & Known Issues

- **DM permission**: See Step 4 above. Without App Review approval, DMs only work for test users.
- **Token expiry**: Tokens expire after 60 days. Set a calendar reminder to refresh.
- **Rate limits**: The Graph API allows ~200 API calls per hour per token. The client retries with exponential backoff on 429 errors.
- **Comment deduplication**: Processed comment IDs are stored in the DB to prevent double-firing if Facebook retries the webhook.
