import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Ethereal Email Setup
const createTransporter = async () => {
    // Check if we have credentials, otherwise generate
    // For production, use environment variables
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });
    console.log('Validating transporter...');
    return transporter;
};

const randomDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const emailWorker = new Worker(
    'email-queue',
    async (job: Job) => {
        const { id, recipient, subject, body } = job.data;

        console.log(`[START] Job ${job.id}: Sending to ${recipient}`);

        // Update state to SENDING
        if (id) {
            await prisma.emailJob.update({
                where: { id },
                data: { status: 'SENDING' }
            });
        }

        // Constraint: 2s "human-mimic" delay between each send
        await randomDelay(2000);

        try {
            const transporter = await createTransporter();

            const info = await transporter.sendMail({
                from: '"ReachInbox Scheduler" <scheduler@reachinbox.ai>',
                to: recipient,
                subject: subject,
                text: body,
                html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #2563eb;">Message from ReachInbox</h2>
                <p>${body}</p>
               </div>`,
            });

            console.log(`[SUCCESS] Job ${job.id}: Sent! MessageId: ${info.messageId}`);

            // Update state to SENT
            if (id) {
                await prisma.emailJob.update({
                    where: { id },
                    data: { status: 'SENT', sentAt: new Date() }
                });
            }

        } catch (error: any) {
            console.error(`[FAILURE] Job ${job.id}: Failed to send!`, error);

            // Update state to FAILED
            if (id) {
                await prisma.emailJob.update({
                    where: { id },
                    data: {
                        status: 'FAILED',
                        failedAt: new Date(),
                        failureReason: error.message
                    }
                });
            }
            throw error;
        }
    },
    {
        connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
        // Constraint: Configurable rate limit per hour
        limiter: {
            max: parseInt(process.env.MAX_EMAILS_PER_HOUR || '50'),
            duration: 3600000, // 1 hour in ms
        },
    }
);
