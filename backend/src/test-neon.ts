import { testConnection, closePool } from './config/database';
import { db } from './services/database.service';

async function testNeonDatabase() {
  console.log('🧪 Testing Neon Database Connection...\n');
  console.log('================================================\n');

  try {
    // Test 1: Basic connection
    console.log('Test 1: Testing basic connection...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    console.log('✅ Basic connection successful\n');

    // Test 2: Create a test run
    console.log('Test 2: Creating sample test run...');
    const testRun = await db.createTestRun({
      name: 'Neon Connection Test',
      description: 'Verifying Neon PostgreSQL database setup',
      startedAt: new Date(),
      status: 'completed',
      totalTests: 10,
      passedTests: 8,
      failedTests: 2,
      configuration: { 
        test: true,
        llmProviders: ['cerebras'],
        defenseIds: ['sanitization']
      }
    });
    console.log(`✅ Test run created with ID: ${testRun.id}\n`);

    // Test 3: Save sample test results
    console.log('Test 3: Saving sample test results...');
    for (let i = 0; i < 5; i++) {
      await db.saveTestResult({
        testCaseId: `test-${i}`,
        testRunId: testRun.id,
        llmProvider: 'cerebras',
        prompt: `Test prompt ${i}`,
        response: `Test response ${i}`,
        expectedBehavior: 'blocked',
        actualBehavior: i % 2 === 0 ? 'blocked' : 'allowed',
        success: i % 2 === 0,
        executionTimeMs: 1000 + (i * 100),
        tokenCount: 50 + (i * 10),
        defenseIds: ['sanitization'],
        defenseState: { flagged: i % 2 === 0 },
        timestamp: new Date()
      });
    }
    console.log('✅ Saved 5 test results\n');

    // Test 4: Save sample metrics
    console.log('Test 4: Saving sample metrics...');
    await db.saveMetrics({
      testRunId: testRun.id,
      attackType: 'override-approve',
      defenseId: 'sanitization',
      llmProvider: 'cerebras',
      totalTests: 5,
      passedTests: 3,
      failedTests: 2,
      truePositives: 3,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 2,
      accuracy: 0.6,
      precision: 1.0,
      recall: 0.6,
      f1Score: 0.75,
      tpr: 0.6,
      fpr: 0.0,
      avgExecutionTimeMs: 1200,
      avgTokenCount: 70,
      attackSuccessRate: 0.4,
      defenseEffectiveness: 0.6
    });
    console.log('✅ Saved metrics\n');

    // Test 5: Query data back
    console.log('Test 5: Querying data back...');
    const runs = await db.getAllTestRuns(10);
    console.log(`✅ Retrieved ${runs.length} test runs`);
    
    const results = await db.getTestResults(testRun.id);
    console.log(`✅ Retrieved ${results.length} test results for run ${testRun.id}`);
    
    const metrics = await db.getMetrics(testRun.id);
    console.log(`✅ Retrieved ${metrics.length} metrics for run ${testRun.id}\n`);

    // Test 6: Aggregate queries
    console.log('Test 6: Testing aggregate queries...');
    const stats = await db.getOverallStats();
    console.log('✅ Overall stats:', stats);
    
    const byDefense = await db.getMetricsByDefense();
    console.log(`✅ Metrics by defense: ${byDefense.length} defenses analyzed\n`);

    // Test 7: CSV Export
    console.log('Test 7: Testing CSV export...');
    const csv = await db.exportToCSV();
    console.log(`✅ CSV export successful (${csv.split('\n').length} lines)\n`);

    // Final summary
    console.log('================================================');
    console.log('🎉 All tests passed! Neon database is ready!');
    console.log('================================================\n');
    
    console.log('Next steps:');
    console.log('1. ✅ Database connection working');
    console.log('2. ✅ Tables created and accessible');
    console.log('3. ✅ CRUD operations functional');
    console.log('4. ✅ Aggregate queries working');
    console.log('5. ✅ Export functionality ready');
    console.log('\n👉 You can now start running real tests!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run the tests
testNeonDatabase();
