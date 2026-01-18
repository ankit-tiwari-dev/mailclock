import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🗑️ Starting database cleanup...');

    // Delete in order to respect foreign key constraints
    const jobsDeleted = await prisma.emailJob.deleteMany({});
    console.log(`✅ Deleted ${jobsDeleted.count} email jobs.`);

    const usersDeleted = await prisma.user.deleteMany({});
    console.log(`✅ Deleted ${usersDeleted.count} users.`);

    console.log('✨ Database is now empty.');
}

main()
    .catch((e) => {
        console.error('❌ Error during cleanup:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
