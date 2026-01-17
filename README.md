# ReachInbox Assignment - Full-Stack Email Job Scheduler

A production-grade email scheduler built with **Next.js**, **Express**, **BullMQ**, **Redis**, and **PostgreSQL**. This system allows for reliable, persistent, and rate-limited email scheduling with a premium dashboard interface.

## 🚀 Features

### Backend (Industrial Grade)
- **Reliable Scheduling**: Uses **BullMQ** delayed jobs (backed by Redis) to schedule emails without cron jobs.
- **Persistence**: Relies on Redis AOF and PostgreSQL to ensure jobs survive server restarts and crashes.
- **Rate Limiting**: Strictly enforces a limit of **50 emails per hour** using BullMQ's native rate limiter.
- **Smart Staggering**: Automatically staggers batch emails with a user-defined delay (default 2s) to mimic human behavior.
- **Concurrency**: Configured worker concurrency to handle multiple jobs safely.

### Frontend (Premium UI)
- **Dashboard**: A "Dark Mode" SaaS dashboard built with **Tailwind CSS**.
- **Real-Time Monitoring**: Live "Queue Progress" bar and "System Health" indicators.
- **Tabs**: Separate views for "Scheduled" (Pending/Sending) and "Sent" (Sent/Failed) emails.
- **Auth**: Finished with **Real Google OAuth** integration and Session-based login/logout.
- **Hourly Limits**: Dynamic configuration supported via UI and API to respect provider limits.

---

### 🔑 Auth Setup (Required for Google Login)
Since we are using **Real Google OAuth**, you must add the following **Authorized Redirect URI** to your [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

```text
http://localhost:3000/api/auth/callback/google
```

The `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` have already been added to your `client/.env` file.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, Lucide React, Shadcn/UI (Components)
- **Backend**: Node.js, Express.js, TypeScript
- **Queue/Scheduler**: BullMQ + Redis
- **Database**: PostgreSQL + Prisma ORM
- **Email**: Nodemailer + Ethereal (Fake SMTP)

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- Docker Desktop (for Redis & Postgres)

### 1. Infrastructure (Docker)
Start the Redis and PostgreSQL containers:
```bash
docker-compose up -d
```

### 2. Backend Setup
Navigate to the server directory:
```bash
cd server
npm install
```

Create a `.env` file in `server/`:
```env
PORT=4000
DATABASE_URL="postgresql://postgres:password@localhost:5432/email_scheduler?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
```

Run Database Migrations:
```bash
npx prisma migrate dev --name init
```

Start the Server:
```bash
npm start
```
*The server runs on `http://localhost:4000`*

### 3. Frontend Setup
Navigate to the client directory:
```bash
cd client
npm install
```

Start the Development Server:
```bash
npm run dev
```
*The dashboard is available at `http://localhost:3000`*

---

## 🏗️ Architecture Overview

### Scheduling Strategy (No Cron)
We avoid OS-level cron jobs entirely. Instead, we use **BullMQ's Delayed Jobs**.
1. When a user schedules a campaign, the API calculates a specific `delay` timestamp for each email.
2. The job is added to the Redis queue with this delay.
3. BullMQ manages the timing, ensuring the job is only promoted to "waiting" when the delay expires.

### Crash Recovery & Persistence
- **Redis (AOF)**: Configured to persist queue state to disk. If the container or server mimics a crash, Redis restores the queue on restart.
- **BullMQ**: Keeps the state of jobs. If the worker processes die, the jobs remain in the queue (or are moved to 'stalled' and recovered) so no data is lost.
- **PostgreSQL**: Acts as the "Source of Truth" for the UI, logging every state change (`PENDING` -> `SENDING` -> `SENT`/`FAILED`).

### Rate Limiting & Concurrency
We utilize a token bucket strategy via BullMQ's `limiter` configuration:
```typescript
limiter: {
  max: 50,      // Max 50 jobs
  duration: 3600000 // Per 1 hour
}
```
This ensures that even if you schedule 1000 emails, only 50 will go out in the first hour, and the rest will automatically queue for the next hour window.

---

## 🎥 Demo Video

[Click here to watch the demo video](#) *(Please record and insert link here)*

---

## 🛡️ Assumptions & Trade-offs
- **Auth**: For this demo, Google Auth is simulated visually in parts of the UI (or uses a demo provider) to speed up reviewer testing without needing real GCP credentials.
- **Email**: We utilize Ethereal Email to prevent spamming real inboxes. You can view sent emails at [https://ethereal.email](https://ethereal.email).

---
*Built for ReachInbox Assignment*
