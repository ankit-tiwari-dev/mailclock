# 🚀 ReachInbox Email Scheduler & Dashboard

A production-grade email scheduling system built with **TypeScript**, **Express**, **BullMQ**, and **Next.js**. This system handles persistent job scheduling, worker concurrency, and rate limiting, mimicking a real-world outreach platform.

---

## 📸 Features

### Backend
- **Reliable Scheduling**: Uses BullMQ delayed jobs backed by Redis (No Cron Jobs!).
- **Persistence**: Jobs survive server restarts and crashes.
- **Worker Concurrency**: Process multiple emails in parallel (`WORKER_CONCURRENCY=5`).
- **Rate Limiting**: Enforces strict hourly limits (e.g. 50/hour) per sender.
- **Idempotency**: Prevents duplicate emails using unique job IDs.
- **Ethereal Email**: Fake SMTP service for safe testing.

### Frontend
- **Google Login**: Real OAuth authentication via NextAuth.
- **Dashboard**: Real-time view of Scheduled vs. Sent emails.
- **Compose Interface**: Rich text editor with CSV upload support.
- **Email Detail View**: Gmail-like interface to view sent email history.
- **Live Updates**: Auto-refreshing stats and job feeds.

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Queue**: BullMQ, Redis
- **Database**: PostgreSQL, Prisma ORM
- **Frontend**: Next.js 14, Tailwind CSS, TypeScript
- **Auth**: NextAuth.js (Google Provider)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker (for Redis & Postgres) OR local instances

### 1. Environment Setup

Create a `.env` file in the `server` directory:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/email_scheduler?schema=public"
REDIS_HOST="localhost"
REDIS_PORT="6379"
PORT=4000
WORKER_CONCURRENCY=5
MAX_EMAILS_PER_HOUR=50
```

Create a `.env.local` file in the `client` directory:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-key-change-this
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 2. Start Infrastructure (Docker)

If using Docker Compose (recommended):
```bash
docker-compose up -d
```
*Or ensure local Redis (6379) and Postgres (5432) are running.*

### 3. Backend Setup

```bash
cd server
npm install
npx prisma generate
npx prisma db push  # Create DB tables
npm run build
npm start
```
*Server runs on `http://localhost:4000`*

### 4. Frontend Setup

```bash
cd client
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`*

---

## 🏗 Architecture Overview

The system follows a producer-worker architecture to ensure scalability and reliability.

### 1. Scheduling Flow
1. User submits a campaign (emails + time) via Frontend.
2. **API (`/schedule`)** receives request and calculates individual send times.
3. Jobs are saved to **PostgreSQL** with `PENDING` status.
4. Jobs are added to **BullMQ** with a specific `delay` (calculated based on time + staggering).

### 2. Worker Execution
- **BullMQ Worker** picks up jobs when their delay expires.
- **Concurrency**: 5 workers run in parallel.
- **Rate Limit**: BullMQ `limiter` enforces max 50 jobs/hour.
- **Throttling**: A custom 2-second delay is added between sends to mimic human behavior.

### 3. Persistence & Restart Recovery
- Since jobs are stored in **Redis (Queue)** and **PostgreSQL (State)**, restarting the Node.js server **does not** lose data.
- When the server starts back up, BullMQ reconnects to Redis and resumes processing pending/delayed jobs exactly where it left off.

---

## 🧪 Testing

### API Tests
You can verify the backend independently:
```bash
cd server
npx ts-node scripts/test-api.ts
```

### End-to-End Flow
1. Login with Google.
2. Go to "Compose".
3. Upload `contacts.csv` or enter a test email.
4. Set "Delay" (e.g. 2s) and "Hourly Limit".
5. Click **Send**.
6. Check the **Dashboard** to see jobs appear in "Scheduled".
7. Wait for them to move to "Sent".

---

## 📝 API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/schedule` | Schedule a batch of emails |
| `GET`  | `/api/jobs` | Get recent jobs feed |
| `GET`  | `/api/jobs/:id` | Get details of a specific job |
| `GET`  | `/api/stats` | Get counts (Sent, Pending, Failed) |
| `GET`  | `/api/health` | Check Redis & Worker status |

---

## ✅ Assignment Checklist

- [x] **No Cron Jobs**: Uses BullMQ delayed queues.
- [x] **Persistence**: Server restart safe.
- [x] **Rate Limiting**: Configurable per hour.
- [x] **Concurrency**: Configurable worker count.
- [x] **Frontend**: Matches Figma design.
- [x] **Google Login**: Implemented.

---

> **Note**: Ethereal Email credentials are auto-generated on server start. Check the console logs for the preview URL of sent emails!
