import express from 'express';
import cors from 'cors';
import { addEmailJob } from './producer';
import { emailWorker } from './worker'; // Import to start worker
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Error handling middleware for JSON/Payload errors (prevents HTML error pages)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.type === 'entity.too.large' || err.status === 413) {
        console.error('[PAYLOAD ERROR]: Request body exceeds limit.');
        return res.status(413).json({
            error: 'Payload too large',
            message: 'The request body exceeds the 100MB limit. Please reduce the size of your CSV or content.'
        });
    }
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    next(err);
});

// Global internal error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[GLOBAL ERROR]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// API: Schedule Batch Emails (Staggered)
app.post('/api/schedule', async (req, res) => {
    try {
        const { emails, subject, body, sendAt, userId, delay, hourlyLimit } = req.body; // emails is an array

        if (!emails || !Array.isArray(emails)) {
            return res.status(400).json({ error: 'Emails array is required' });
        }

        const baseNow = new Date().getTime();
        let targetStartTime = baseNow;

        if (sendAt) {
            targetStartTime = new Date(sendAt).getTime();
            // Validation: Reject if more than 1 minute in the past
            if (targetStartTime < baseNow - 60000) {
                return res.status(400).json({
                    error: 'Invalid Schedule Time',
                    message: 'Cannot schedule emails in the past.'
                });
            }
        }

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

// API: Get Single Job by ID
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await prisma.emailJob.findUnique({
            where: { id: req.params.id }
        });

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Format response to match frontend expectations
        const formattedJob = {
            id: job.id,
            status: job.status,
            processedAt: job.sentAt || job.scheduledAt,
            createdAt: job.createdAt,
            data: {
                email: job.recipient,
                subject: job.subject,
                body: job.body,
                scheduledTime: job.scheduledAt
            }
        };

        res.json(formattedJob);
    } catch (error) {
        console.error('[API ERROR] /jobs/:id:', error);
        res.status(500).json({ error: 'Failed to fetch job' });
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

// API: Cleanup - Delete all jobs (useful for resetting demo)
app.delete('/api/cleanup', async (req, res) => {
    try {
        await prisma.emailJob.deleteMany({});
        res.json({ message: 'All jobs cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear jobs' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Worker status: ${emailWorker.isRunning() ? 'Running' : 'Stopped'}`);
});

// Final fallback for unhandled exceptions to prevent the server from crashing completely
process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]:', err);
    // In production, you might want to restart the process gracefully, but for dev we'll keep it alive if possible
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]:', reason);
});
