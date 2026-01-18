import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Ethereal Email Setup - Cached transporter to avoid repeated account generation
let cachedTransporter: any = null;

const getTransporter = async () => {
    if (cachedTransporter) return cachedTransporter;

    console.log('Generating Ethereal account...');
    try {
        const testAccount = await nodemailer.createTestAccount();
        cachedTransporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 465, // Use SSL for production reliability
            secure: true,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
            connectionTimeout: 10000, // 10 seconds
            greetingTimeout: 5000,
            socketTimeout: 10000,
        });

        // Verify connection immediately
        await cachedTransporter.verify();
        console.log('Transporter ready!');
        return cachedTransporter;
    } catch (error) {
        console.error('Failed to create transporter:', error);
        throw error;
    }
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
            const transporter = await getTransporter();

            const info = await transporter.sendMail({
                from: '"ReachInbox Scheduler" <scheduler@reachinbox.ai>',
                to: recipient,
                subject: subject,
                text: body,
                html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #2563eb;">Message from ReachInbox</h2>
                <p>${body}</p>
                <div style="margin-top: 20px; font-size: 12px; color: #666;">
                    Received: ${new Date().toLocaleString()}
                </div>
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
                        failureReason: error.message || 'Unknown SMTP Error'
                    }
                });
            }
            throw error;
        }
    },
    {
        connection: {
            host: (process.env.REDIS_HOST || 'localhost').replace(/^redis:\/\//, ''),
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
