import express from 'express';
import cors from 'cors';
import { addEmailJob } from './producer';
import { emailWorker } from './worker'; // Import to start worker
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API: Schedule Batch Emails (Staggered)
app.post('/api/schedule', async (req, res) => {
    try {
        const { emails, subject, body, sendAt, userId, delay, hourlyLimit } = req.body; // emails is an array

        if (!emails || !Array.isArray(emails)) {
            return res.status(400).json({ error: 'Emails array is required' });
        }

        const baseNow = new Date().getTime();
        const targetStartTime = sendAt ? new Date(sendAt).getTime() : baseNow;
        const staggeredDelayMs = (delay || 2) * 1000;

        // Ensure User Exists (Fix for P2003 Foreign Key Error)
        const dbUser = await prisma.user.upsert({
            where: { email: 'demo@reachinbox.ai' },
            update: {},
            create: {
                id: 'demo-user-id',
                email: 'demo@reachinbox.ai',
                name: 'Demo User'
            }
        });

        const scheduledJobs = [];
        const hourlyIntervalMs = (3600 / (hourlyLimit || 50)) * 1000;
        const finalDelayMs = Math.max(staggeredDelayMs, hourlyIntervalMs);

        for (let i = 0; i < emails.length; i++) {
            const recipient = emails[i];

            // Use the larger of the two delays to strictly respect user/system limits
            const jobDelay = Math.max(0, targetStartTime - baseNow) + (i * finalDelayMs);

            // Save to DB
            const dbJob = await prisma.emailJob.create({
                data: {
                    recipient,
                    subject,
                    body,
                    scheduledAt: new Date(targetStartTime + (i * finalDelayMs)),
                    userId: dbUser.id,
                    status: 'PENDING'
                }
            });

            // Add to Queue
            await addEmailJob({ recipient, subject, body, id: dbJob.id }, jobDelay);
            scheduledJobs.push(dbJob);
        }

        res.json({ message: `Successfully scheduled ${emails.length} emails`, jobs: scheduledJobs });
    } catch (error) {
        console.error('[API ERROR] /schedule:', error);
        res.status(500).json({ error: 'Failed to schedule emails' });
    }
});

// API: Stats
app.get('/api/stats', async (req, res) => {
    try {
        const [total, sent, failed, pending] = await Promise.all([
            prisma.emailJob.count(),
            prisma.emailJob.count({ where: { status: 'SENT' } }),
            prisma.emailJob.count({ where: { status: 'FAILED' } }),
            prisma.emailJob.count({ where: { status: 'PENDING' } })
        ]);

        res.json({ scheduled: total, sent, failed, pending });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// API: Job Feed (Real-time updates)
app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await prisma.emailJob.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// API: System Status (Redis Health)
app.get('/api/health', async (req, res) => {
    try {
        const status = await emailWorker.isRunning();
        res.json({
            redis: 'active',
            worker: status ? 'running' : 'stopped',
            queue: 'email-queue'
        });
    } catch (error) {
        res.json({ redis: 'inactive', error: 'Database/Redis connection failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Worker status: ${emailWorker.isRunning() ? 'Running' : 'Stopped'}`);
});
