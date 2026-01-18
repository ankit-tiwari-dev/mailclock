
// Using Node.js built-in fetch

const BASE_URL = 'http://localhost:4000/api';

async function testApis() {
    console.log('🚀 Starting API Tests...');

    try {
        // 1. Check Health
        console.log('\nTesting GET /health...');
        const healthRes = await fetch(`${BASE_URL}/health`);
        const health = await healthRes.json();
        console.log('✅ Health:', health);

        // 2. Schedule Emails
        console.log('\nTesting POST /schedule...');
        const scheduleRes = await fetch(`${BASE_URL}/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emails: ['test1@example.com', 'test2@example.com'],
                subject: 'Test Subject',
                body: 'Test Body',
                delay: 1,
                hourlyLimit: 100,
                userId: 'api-tester'
            })
        });
        const scheduleData = await scheduleRes.json();
        console.log(`✅ Scheduled Response status: ${scheduleRes.status}`);
        if (scheduleRes.status === 200) {
            console.log(`✅ Message: ${scheduleData.message}`);
            console.log(`✅ Jobs created: ${scheduleData.jobs?.length}`);
        } else {
            console.log(`❌ Error:`, scheduleData);
        }

        // 3. Get Stats
        console.log('\nTesting GET /stats...');
        const statsRes = await fetch(`${BASE_URL}/stats`);
        const stats = await statsRes.json();
        console.log('✅ Stats:', stats);

        // 4. Get Jobs Feed
        console.log('\nTesting GET /jobs...');
        const jobsRes = await fetch(`${BASE_URL}/jobs`);
        const jobs = await jobsRes.json();
        console.log(`✅ Jobs found: ${jobs.length}`);

        if (jobs.length > 0) {
            const jobId = jobs[0].id;
            console.log(`\nTesting GET /jobs/${jobId}...`);
            const jobRes = await fetch(`${BASE_URL}/jobs/${jobId}`);

            if (jobRes.status === 200) {
                const job = await jobRes.json();
                console.log('✅ Job Details:', job);
            } else {
                console.log(`❌ Failed to fetch job details. Status: ${jobRes.status}`);
                console.log('⚠️  This likely means the server needs to be restarted to pick up the new endpoint.');
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
    console.log('\n✨ Tests Completed');
}

testApis();
