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
1. Click **New +** -> **Redis**.
2. **Name**: `email-scheduler-redis`.
3. **Region**: Same as Postgres.
4. **Plan**: `Free`.
5. Click **Create Redis**.
6. **Copy** the `Internal Redis URL` (e.g., `redis://red-xxxx:6379`).

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
    - `REDIS_HOST`: (Hostname from Redis Internal URL, e.g. `red-xxxx`)
    - `REDIS_PORT`: `6379`
    - `PORT`: `4000`
    - `WORKER_CONCURRENCY`: `5`
    - `MAX_EMAILS_PER_HOUR`: `50`
10. Click **Create Web Service**.

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
    - `NEXT_PUBLIC_API_URL`: (Paste your Render Backend URL, NO trailing slash)
        - Example: `https://email-scheduler-api.onrender.com`
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

## 🎉 Done!
Your application is now live on the production internet!
