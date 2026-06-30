import { testConnection } from './config/database';
import { db } from './services/database.service';

async function testDatabase() {
    console.log('Testing Neon database connection...\n');

    // Test connection
    const isConnected = await testConnection();

    if (isConnected) {
        console.log('\n✓ Database is ready to use!');

        // Test creating a sample test run
        try {
            const testRun = await db.createTestRun({
                name: 'Test Connection',
                description: 'Verifying Neon database setup',
                startedAt: new Date(),
                status: 'completed',
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                configuration: { test: true }
            });

            console.log('\n✓ Successfully created test run:', testRun.id);
            console.log('\n🎉 Neon database is fully operational!\n');
        } catch (error) {
            console.error('\n✗ Error creating test run:', error);
        }
    }

    process.exit(0);
}

testDatabase();