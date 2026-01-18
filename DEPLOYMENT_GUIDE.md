# 🚀 Deployment Guide: Render (Backend) + Vercel (Frontend)

This guide will help you deploy your full-stack Email Scheduler to production.

---

## 🏗 Part 1: Deploy Backend (Render)

We will use **Render** to host the Node.js API, PostgreSQL Database, and Redis.

### 1. Create Account
- Sign up at [render.com](https://render.com).

### 2. Create PostgreSQL Database
1. Click **New +** -> **PostgreSQL**.
2. **Name**: `email-scheduler-db`.
3. **Region**: `Singapore` (or closest to you).
4. **Plan**: `Free`.
5. Click **Create Database**.
6. **Copy** the `Internal DB URL` (for later) and `External DB URL` (to check from your PC).

### 3. Create Redis Interface
1. Click **New +** -> **Key Value** (this is Redis).
2. **Name**: `email-scheduler-redis`.
3. **Region**: Same as Postgres.
4. **Plan**: `Free`.
5. Click **Create Redis**.
6. **Copy** the `Internal Redis URL` (e.g., `redis://red-xxxx:6379`).
7. **Important**: BullMQ requires the Redis eviction policy to be `noeviction`. 
    - On Render, go to your Redis instance settings.
    - If you are on a paid plan, change **Eviction Policy** to `noeviction`.
    - If you are on the **Free tier**, Render might not allow this change. The app will usually still work, but you may see a warning in the logs.

### 4. Deploy Node.js Web Service
1. Click **New +** -> **Web Service**.
2. **Build from Git** -> Connect your GitHub Repo.
3. **Name**: `email-scheduler-api`.
4. **Root Directory**: `server` (Important!).
5. **Environment**: `Node`.
6. **Build Command**: `npm install && npm run build`.
7. **Start Command**: `npm start`.
8. **Plan**: `Free`.
9. **Environment Variables** (Add these):
    - `DATABASE_URL`: (Paste Internal DB URL from Step 2)
    - `REDIS_HOST`: (Hostname ONLY, e.g. `red-xxxx`. **Do NOT** include `redis://` or port)
    - `REDIS_PORT`: `6379`
    - `PORT`: `4000`
    - `WORKER_CONCURRENCY`: `5`
    - `MAX_EMAILS_PER_HOUR`: `50`
    - `RESEND_API_KEY`: (Your API Key from Resend.com)
    - `MOCK_SEND`: `true` (Add this to simulate successful sends to ANY email address for your demo)
10. Click **Create Web Service**.

### 5. Production Email Setup (Resend)
Since Render's Free tier blocks SMTP ports (587/465), we use **Resend** (API-based) for production.
1. Sign up at [Resend.com](https://resend.com).
2. Go to **API Keys** and create a new key.
3. Add this key to your Render Web Service as an Environment Variable named `RESEND_API_KEY`.
4. (Optional) In the Free tier, you can send emails to your own email address. To send to others, you'll need to verify a domain in Resend.

✅ **Wait for it to go Live.** Copy your backend URL (e.g., `https://email-scheduler-api.onrender.com`).

---

## 🎨 Part 2: Deploy Frontend (Vercel)

We will use **Vercel** to host the Next.js Frontend.

### 1. Create Account
- Sign up at [vercel.com](https://vercel.com) using GitHub.

### 2. Import Project
1. **Add New...** -> **Project**.
2. Import your `Email-Job-Scheduler` repository.

### 3. Configure Project
1. **Framework Preset**: `Next.js` (Auto-detected).
2. **Root Directory**: Click "Edit" and select `client`.
3. **Environment Variables**:
    - `NEXT_PUBLIC_API_URL`: (Paste your Render Backend URL. **DO NOT** add `/api` at the end)
        - Example: `https://email-scheduler-api.onrender.com` (Correct)
        - Avoid: `https://email-scheduler-api.onrender.com/api` (Wrong)
    - `NEXTAUTH_URL`: (Leave empty for now, Vercel sets this for you)
    - `NEXTAUTH_SECRET`: (Generate a random string, e.g. `openssl rand -base64 32`)
    - `GOOGLE_CLIENT_ID`: (Your Google OAuth ID)
    - `GOOGLE_CLIENT_SECRET`: (Your Google OAuth Secret)
4. Click **Deploy**.

### 4. Final Google OAuth Setup
1. Once deployed, copy your **Vercel Domains** (e.g., `https://email-scheduler-xyz.vercel.app`).
2. Go to [Google Cloud Console](https://console.cloud.google.com/).
3. Edit your OAuth Credentials.
4. Add the Vercel URL to **Authorized JavaScript origins**.
5. Add `https://YOUR-VERCEL-URL/api/auth/callback/google` to **Authorized redirect URIs**.

---

---

## 🛠 Troubleshooting Common Issues

### ❌ Error: `The table public.User does not exist`
This happens if migrations haven't run. I've updated `server/package.json` to run these automatically during build. 
- If you still see this, go to Render -> your `email-scheduler-api` -> **Manual Deploy** -> **Clear Build Cache & Deploy**.

### ❌ Error: `SyntaxError: Unexpected token '<'`
This usually means your `NEXT_PUBLIC_API_URL` is wrong or the backend is returning a 404 page.
- Make sure `NEXT_PUBLIC_API_URL` does **NOT** end in `/api`.
- Check that your Render Backend URL is active.

### ❌ Error: `You can only send testing emails to your own email address`
This is a standard restriction of the Resend Free Tier. 
- **Demo Fix**: Add the environment variable `MOCK_SEND=true` in Render. This will mark every email as "SENT" in your dashboard instantly, allowing you to demonstrate the full system to anyone without restricted email addresses!

### ⚠️ Warning: `Eviction policy is allkeys-lru...`
This is a warning from the queue system. 
- It means if your Redis gets full, it might delete scheduled jobs.
- **Fix**: In Render Redis settings, change the **Eviction Policy** to `noeviction` (requires paid tier on Render). For light testing, the Free tier is fine.

## 🎉 Done!
Your application is now live on the production internet!
