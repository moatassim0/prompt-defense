// Testing Framework - Test Runner
// Executes test suites and manages test execution

import { TestCase, TestResult, TestRun, TestConfiguration, evaluateTestResult, determineActualBehavior } from './test-case';
import { MetricsCollector } from './metrics-collector';

export class TestRunner {
  private metricsCollector: MetricsCollector;
  private currentTestRun: TestRun | null = null;

  constructor() {
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * Creates a new test run
   */
  async createTestRun(name: string, description: string, config: TestConfiguration): Promise<TestRun> {
    const testRun: TestRun = {
      id: Date.now(), // In production, this would come from database
      name,
      description,
      startedAt: new Date(),
      status: 'running',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      configuration: config
    };

    this.currentTestRun = testRun;
    
    // In production: Save to database
    // await db.testRuns.create(testRun);
    
    return testRun;
  }

  /**
   * Runs a complete test suite
   */
  async runTestSuite(
    testCases: TestCase[],
    config: TestConfiguration,
    apiQueryFunction: (prompt: string, documentIds: string[], defenseIds: string[]) => Promise<any>
  ): Promise<{ testRunId: number; results: TestResult[] }> {
    
    const testRun = await this.createTestRun(
      `Test Run ${new Date().toISOString()}`,
      'Automated test suite execution',
      config
    );

    const allResults: TestResult[] = [];

    console.log(`\n🧪 Starting Test Run: ${testRun.name}`);
    console.log(`Configuration:`, config);
    console.log(`Total test cases: ${testCases.length}\n`);

    // Run each test case
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      
      console.log(`[${i + 1}/${testCases.length}] Running: ${testCase.name}`);

      // Run test for each LLM provider
      for (const llmProvider of config.llmProviders) {
        
        // Run multiple iterations if configured
        for (let iteration = 0; iteration < config.iterations; iteration++) {
          
          const result = await this.runSingleTest(
            testCase,
            llmProvider,
            testRun.id,
            apiQueryFunction
          );

          allResults.push(result);

          // Update test run statistics
          testRun.totalTests++;
          if (result.success) {
            testRun.passedTests++;
          } else {
            testRun.failedTests++;
          }

          // Small delay to avoid rate limiting
          await this.sleep(500);
        }
      }
    }

    // Mark test run as completed
    testRun.completedAt = new Date();
    testRun.status = 'completed';

    console.log(`\n✅ Test Run Completed!`);
    console.log(`Total: ${testRun.totalTests}`);
    console.log(`Passed: ${testRun.passedTests} (${((testRun.passedTests / testRun.totalTests) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${testRun.failedTests} (${((testRun.failedTests / testRun.totalTests) * 100).toFixed(1)}%)\n`);

    // Calculate and store metrics
    await this.metricsCollector.calculateMetrics(testRun.id, allResults);

    // In production: Update database
    // await db.testRuns.update(testRun.id, testRun);

    return {
      testRunId: testRun.id,
      results: allResults
    };
  }

  /**
   * Runs a single test case
   */
  private async runSingleTest(
    testCase: TestCase,
    llmProvider: string,
    testRunId: number,
    apiQueryFunction: (prompt: string, documentIds: string[], defenseIds: string[]) => Promise<any>
  ): Promise<TestResult> {
    
    const startTime = Date.now();

    try {
      // Execute the query with specified defenses
      const response = await apiQueryFunction(
        testCase.prompt,
        [], // documentIds - would be populated with attack documents
        testCase.defenseIds
      );

      const executionTime = Date.now() - startTime;

      // Determine actual behavior
      const actualBehavior = determineActualBehavior(
        response.response,
        response.defenseState
      );

      // Evaluate if test passed
      const success = evaluateTestResult(
        testCase.expectedBehavior,
        actualBehavior,
        response.response,
        response.defenseState
      );

      const result: TestResult = {
        testCaseId: testCase.id,
        testRunId,
        llmProvider,
        prompt: testCase.prompt,
        response: response.response,
        expectedBehavior: testCase.expectedBehavior,
        actualBehavior,
        success,
        executionTimeMs: executionTime,
        tokenCount: response.tokenCount,
        defenseIds: testCase.defenseIds,
        defenseState: response.defenseState,
        timestamp: new Date()
      };

      // In production: Save to database
      // await db.testResults.create(result);

      return result;

    } catch (error) {
      console.error(`Error running test ${testCase.id}:`, error);

      // Return failed result
      return {
        testCaseId: testCase.id,
        testRunId,
        llmProvider,
        prompt: testCase.prompt,
        response: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expectedBehavior: testCase.expectedBehavior,
        actualBehavior: 'flagged',
        success: false,
        executionTimeMs: Date.now() - startTime,
        defenseIds: testCase.defenseIds,
        timestamp: new Date()
      };
    }
  }

  /**
   * Runs tests for a specific attack type
   */
  async runAttackTests(
    attackType: string,
    testCases: TestCase[],
    config: TestConfiguration,
    apiQueryFunction: any
  ): Promise<TestResult[]> {
    
    const attackTestCases = testCases.filter(tc => tc.attackType === attackType);
    
    const { results } = await this.runTestSuite(
      attackTestCases,
      config,
      apiQueryFunction
    );

    return results;
  }

  /**
   * Runs tests for a specific defense mechanism
   */
  async runDefenseTests(
    defenseId: string,
    testCases: TestCase[],
    config: TestConfiguration,
    apiQueryFunction: any
  ): Promise<TestResult[]> {
    
    const defenseTestCases = testCases.filter(tc => tc.defenseIds.includes(defenseId));
    
    const { results } = await this.runTestSuite(
      defenseTestCases,
      config,
      apiQueryFunction
    );

    return results;
  }

  /**
   * Runs baseline tests (no defenses)
   */
  async runBaselineTests(
    testCases: TestCase[],
    config: TestConfiguration,
    apiQueryFunction: any
  ): Promise<TestResult[]> {
    
    // Modify test cases to have no defenses
    const baselineTestCases = testCases.map(tc => ({
      ...tc,
      defenseIds: [],
      expectedBehavior: 'allowed' as const // Without defenses, attacks should succeed
    }));

    const { results } = await this.runTestSuite(
      baselineTestCases,
      { ...config, defenseIds: [] },
      apiQueryFunction
    );

    return results;
  }

  /**
   * Runs comparative tests (with and without defenses)
   */
  async runComparativeTests(
    testCases: TestCase[],
    config: TestConfiguration,
    apiQueryFunction: any
  ): Promise<{ baseline: TestResult[]; defended: TestResult[] }> {
    
    console.log('\n📊 Running Comparative Analysis...\n');

    // Run baseline (no defenses)
    console.log('Step 1: Running baseline tests (no defenses)...');
    const baseline = await this.runBaselineTests(testCases, config, apiQueryFunction);

    // Run with defenses
    console.log('\nStep 2: Running defended tests...');
    const { results: defended } = await this.runTestSuite(testCases, config, apiQueryFunction);

    // Compare results
    const baselineSuccessRate = (baseline.filter(r => !r.success).length / baseline.length) * 100;
    const defendedSuccessRate = (defended.filter(r => r.success).length / defended.length) * 100;

    console.log('\n📈 Comparative Results:');
    console.log(`Baseline (no defense): ${baselineSuccessRate.toFixed(1)}% attacks succeeded`);
    console.log(`With defenses: ${defendedSuccessRate.toFixed(1)}% attacks blocked`);
    console.log(`Improvement: ${(defendedSuccessRate - (100 - baselineSuccessRate)).toFixed(1)}%\n`);

    return { baseline, defended };
  }

  /**
   * Gets the current test run
   */
  getCurrentTestRun(): TestRun | null {
    return this.currentTestRun;
  }

  /**
   * Helper function to sleep/delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const testRunner = new TestRunner();
