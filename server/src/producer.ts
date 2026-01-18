import { Queue } from 'bullmq';
import { ConnectionOptions } from 'bullmq';

const connection: ConnectionOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const emailQueue = new Queue('email-queue', { connection });

interface EmailJobData {
    recipient: string;
    subject: string;
    body: string;
    id?: string;
    hourlyLimit?: number;
}

export const addEmailJob = async (data: EmailJobData, delay: number) => {
    await emailQueue.add('send-email', data, {
        jobId: data.id, // Guarantee idempotency: no duplicates for the same DB record
        delay: delay,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true, // Keep DB clean
        removeOnFail: false, // Keep failed for inspection
    });
};
