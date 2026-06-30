import { query } from '../config/database';
import { TestRun, TestResult } from '../../../testing/framework/test-case';
import { Metrics } from '../../../testing/framework/metrics-collector';

export class DatabaseService {
  /**
   * Create a new test run
   */
  async createTestRun(testRun: Omit<TestRun, 'id'>): Promise<TestRun> {
    const result = await query(
      `INSERT INTO test_runs (name, description, started_at, status, total_tests, passed_tests, failed_tests, configuration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        testRun.name,
        testRun.description,
        testRun.startedAt,
        testRun.status,
        testRun.totalTests,
        testRun.passedTests,
        testRun.failedTests,
        JSON.stringify(testRun.configuration)
      ]
    );
    return this.mapTestRun(result.rows[0]);
  }

  /**
   * Update test run
   */
  async updateTestRun(id: number, updates: Partial<TestRun>): Promise<void> {
    await query(
      `UPDATE test_runs 
       SET completed_at = $1, status = $2, total_tests = $3, passed_tests = $4, failed_tests = $5
       WHERE id = $6`,
      [updates.completedAt, updates.status, updates.totalTests, updates.passedTests, updates.failedTests, id]
    );
  }

  /**
   * Get test run by ID
   */
  async getTestRun(id: number): Promise<TestRun | null> {
    const result = await query('SELECT * FROM test_runs WHERE id = $1', [id]);
    return result.rows[0] ? this.mapTestRun(result.rows[0]) : null;
  }

  /**
   * Get all test runs
   */
  async getAllTestRuns(limit: number = 100): Promise<TestRun[]> {
    const result = await query(
      'SELECT * FROM test_runs ORDER BY started_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(row => this.mapTestRun(row));
  }

  /**
   * Save test result
   */
  async saveTestResult(testResult: TestResult): Promise<void> {
    await query(
      `INSERT INTO test_results 
       (test_run_id, test_case_id, attack_id, llm_provider, prompt, response, 
        expected_behavior, actual_behavior, success, execution_time_ms, 
        token_count, defense_ids, defense_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        testResult.testRunId,
        testResult.testCaseId,
        testResult.attackId,
        testResult.llmProvider,
        testResult.prompt,
        testResult.response,
        testResult.expectedBehavior,
        testResult.actualBehavior,
        testResult.success,
        testResult.executionTimeMs,
        testResult.tokenCount,
        testResult.defenseIds,
        JSON.stringify(testResult.defenseState)
      ]
    );
  }

  /**
   * Get test results for a run
   */
  async getTestResults(testRunId: number): Promise<TestResult[]> {
    const result = await query(
      'SELECT * FROM test_results WHERE test_run_id = $1 ORDER BY created_at',
      [testRunId]
    );
    return result.rows.map(row => this.mapTestResult(row));
  }

  /**
   * Save metrics
   */
  async saveMetrics(metrics: Metrics): Promise<void> {
    await query(
      `INSERT INTO metrics 
       (test_run_id, attack_type, defense_id, llm_provider,
        total_tests, passed_tests, failed_tests,
        true_positives, false_positives, true_negatives, false_negatives,
        accuracy, precision, recall, f1_score, tpr, fpr,
        avg_execution_time_ms, avg_token_count,
        attack_success_rate, defense_effectiveness)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        metrics.testRunId,
        metrics.attackType,
        metrics.defenseId,
        metrics.llmProvider,
        metrics.totalTests,
        metrics.passedTests,
        metrics.failedTests,
        metrics.truePositives,
        metrics.falsePositives,
        metrics.trueNegatives,
        metrics.falseNegatives,
        metrics.accuracy,
        metrics.precision,
        metrics.recall,
        metrics.f1Score,
        metrics.tpr,
        metrics.fpr,
        metrics.avgExecutionTimeMs,
        metrics.avgTokenCount,
        metrics.attackSuccessRate,
        metrics.defenseEffectiveness
      ]
    );
  }

  /**
   * Get metrics for analysis
   */
  async getMetrics(testRunId?: number): Promise<Metrics[]> {
    const queryText = testRunId
      ? 'SELECT * FROM metrics WHERE test_run_id = $1'
      : 'SELECT * FROM metrics ORDER BY calculated_at DESC LIMIT 1000';

    const params = testRunId ? [testRunId] : [];
    const result = await query(queryText, params);

    return result.rows.map(row => this.mapMetrics(row));
  }

  /**
   * Get metrics grouped by defense
   */
  async getMetricsByDefense(): Promise<any[]> {
    const result = await query(`
      SELECT 
        defense_id,
        AVG(defense_effectiveness) as avg_effectiveness,
        AVG(accuracy) as avg_accuracy,
        AVG(f1_score) as avg_f1,
        AVG(tpr) as avg_tpr,
        AVG(fpr) as avg_fpr,
        COUNT(*) as test_runs
      FROM metrics
      WHERE defense_id IS NOT NULL
      GROUP BY defense_id
      ORDER BY avg_effectiveness DESC
    `);
    return result.rows;
  }

  /**
   * Get metrics grouped by attack type
   */
  async getMetricsByAttack(): Promise<any[]> {
    const result = await query(`
      SELECT 
        attack_type,
        AVG(attack_success_rate) as avg_success_rate,
        AVG(defense_effectiveness) as avg_defense_effectiveness,
        COUNT(*) as test_runs
      FROM metrics
      WHERE attack_type IS NOT NULL
      GROUP BY attack_type
      ORDER BY avg_success_rate DESC
    `);
    return result.rows;
  }

  /**
   * Get metrics grouped by LLM provider
   */
  async getMetricsByProvider(): Promise<any[]> {
    const result = await query(`
      SELECT 
        llm_provider,
        attack_type,
        AVG(attack_success_rate) as vulnerability_score,
        AVG(defense_effectiveness) as avg_defense_effectiveness,
        COUNT(*) as test_count
      FROM metrics
      WHERE llm_provider IS NOT NULL AND attack_type IS NOT NULL
      GROUP BY llm_provider, attack_type
      ORDER BY llm_provider, vulnerability_score DESC
    `);
    return result.rows;
  }

  /**
   * Get overall statistics
   */
  async getOverallStats(): Promise<any> {
    const result = await query(`
      SELECT 
        COUNT(DISTINCT test_run_id) as total_test_runs,
        SUM(total_tests) as total_tests_executed,
        AVG(defense_effectiveness) as avg_defense_effectiveness,
        AVG(accuracy) as avg_accuracy,
        AVG(f1_score) as avg_f1_score
      FROM metrics
      WHERE attack_type IS NULL
        AND defense_id IS NULL
        AND llm_provider IS NULL
    `);
    return result.rows[0];
  }

  /**
   * Get all analytics data in a single call (runs queries in parallel)
   */
  async getAllAnalytics(): Promise<{ summary: any; byDefense: any[]; byAttack: any[]; byProvider: any[] }> {
    const [summary, byDefense, byAttack, byProvider] = await Promise.all([
      this.getOverallStats(),
      this.getMetricsByDefense(),
      this.getMetricsByAttack(),
      this.getMetricsByProvider()
    ]);
    return { summary, byDefense, byAttack, byProvider };
  }

  /**
   * Export all data to CSV
   */
  async exportToCSV(): Promise<string> {
    const result = await query(`
      SELECT 
        tr.name as test_run,
        tr.started_at,
        tres.test_case_id,
        tres.llm_provider,
        tres.expected_behavior,
        tres.actual_behavior,
        tres.success,
        tres.execution_time_ms,
        tres.token_count,
        array_to_string(tres.defense_ids, ',') as defenses
      FROM test_results tres
      JOIN test_runs tr ON tres.test_run_id = tr.id
      ORDER BY tr.started_at DESC, tres.created_at
    `);

    if (result.rows.length === 0) {
      return 'No data available';
    }

    // Convert to CSV
    const headers = Object.keys(result.rows[0]);
    const rows = result.rows.map(row =>
      headers.map(h => {
        const val = row[h];
        // Escape commas and quotes in CSV
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Get paginated test traces (summary rows — omits large prompt/response blobs for fast list loads).
   */
  async getTestTraces(limit: number = 50, offset: number = 0, filters: { testRunId?: number, success?: boolean, llmProvider?: string, attackType?: string } = {}): Promise<any[]> {
    let queryText = `SELECT
        tres.id,
        tres.test_run_id,
        tres.test_case_id,
        tres.attack_id,
        tres.llm_provider,
        tres.expected_behavior,
        tres.actual_behavior,
        tres.success,
        tres.execution_time_ms,
        tres.token_count,
        tres.defense_ids,
        tres.defense_state,
        tres.created_at,
        tr.name as run_name,
        tr.started_at as run_started_at
      FROM test_results tres
      LEFT JOIN test_runs tr ON tres.test_run_id = tr.id`;

    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.testRunId) {
      params.push(filters.testRunId);
      conditions.push(`tres.test_run_id = $${params.length}`);
    }
    if (filters.success !== undefined) {
      params.push(filters.success);
      conditions.push(`tres.success = $${params.length}`);
    }
    if (filters.llmProvider) {
      params.push(`%${filters.llmProvider}%`);
      conditions.push(`tres.llm_provider ILIKE $${params.length}`);
    }
    if (filters.attackType) {
      params.push(`%${filters.attackType}%`);
      conditions.push(`COALESCE(tres.attack_id, tres.test_case_id, '') ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    // Single-run view: chronological order (iteration flow). Mixed list: newest first.
    const orderSql = filters.testRunId ? 'tres.created_at ASC' : 'tres.created_at DESC';
    queryText += ` ORDER BY ${orderSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows.map(row => ({
      ...this.mapTestResult(row, { omitPromptResponse: true }),
      runName: row.run_name,
      runStartedAt: row.run_started_at ? new Date(row.run_started_at) : undefined,
    }));
  }

  /**
   * Full trace row including prompt/response (for detail view).
   */
  async getTestTraceByResultId(resultId: number): Promise<any | null> {
    const result = await query(
      `SELECT tres.*, tr.name as run_name, tr.started_at as run_started_at
       FROM test_results tres
       LEFT JOIN test_runs tr ON tres.test_run_id = tr.id
       WHERE tres.id = $1`,
      [resultId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      ...this.mapTestResult(row),
      runName: row.run_name,
      runStartedAt: row.run_started_at ? new Date(row.run_started_at) : undefined,
    };
  }

  /**
   * Count test traces for pagination
   */
  async countTestTraces(filters: { testRunId?: number, success?: boolean, llmProvider?: string, attackType?: string } = {}): Promise<number> {
    let queryText = `SELECT COUNT(*) as exact_count FROM test_results tres`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.testRunId) {
      params.push(filters.testRunId);
      conditions.push(`tres.test_run_id = $${params.length}`);
    }
    if (filters.success !== undefined) {
      params.push(filters.success);
      conditions.push(`tres.success = $${params.length}`);
    }
    if (filters.llmProvider) {
      params.push(`%${filters.llmProvider}%`);
      conditions.push(`tres.llm_provider ILIKE $${params.length}`);
    }
    if (filters.attackType) {
      params.push(`%${filters.attackType}%`);
      conditions.push(`COALESCE(tres.attack_id, tres.test_case_id, '') ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await query(queryText, params);
    return parseInt(result.rows[0].exact_count, 10);
  }

  /**
   * Clean up old test data (optional)
   */
  async cleanupOldData(daysToKeep: number = 30): Promise<number> {
    const result = await query(
      `DELETE FROM test_runs 
       WHERE started_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`
    );
    return result.rowCount || 0;
  }

  // Mapping functions
  private mapTestRun(row: any): TestRun {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      status: row.status,
      totalTests: row.total_tests,
      passedTests: row.passed_tests,
      failedTests: row.failed_tests,
      configuration: row.configuration
    };
  }

  private mapTestResult(row: any, options?: { omitPromptResponse?: boolean }): TestResult {
    let defenseState = row.defense_state;
    if (typeof defenseState === 'string') {
      try {
        defenseState = JSON.parse(defenseState);
      } catch {
        defenseState = undefined;
      }
    }

    const pipelineConfidence =
      defenseState?.pipelineResult?.pipelineConfidence;
    const normalizedPipelineConfidence =
      typeof pipelineConfidence === 'number' && Number.isFinite(pipelineConfidence)
        ? Number(Math.min(100, Math.max(0, pipelineConfidence)).toFixed(1))
        : undefined;
    const evaluationFinalScore = defenseState?.evaluationSummary?.finalScore;
    const evaluatorConfidencePct =
      typeof evaluationFinalScore === 'number' && Number.isFinite(evaluationFinalScore)
        ? Number((Math.min(1, Math.max(0, evaluationFinalScore)) * 100).toFixed(1))
        : undefined;

    const omit = options?.omitPromptResponse === true;

    return {
      testCaseId: row.test_case_id,
      attackId: row.attack_id,
      testRunId: row.test_run_id,
      resultId: row.id != null ? Number(row.id) : undefined,
      llmProvider: row.llm_provider,
      prompt: omit ? '' : row.prompt,
      response: omit ? '' : row.response,
      expectedBehavior: row.expected_behavior,
      actualBehavior: row.actual_behavior,
      success: row.success,
      executionTimeMs: row.execution_time_ms,
      tokenCount: row.token_count,
      defenseIds: row.defense_ids,
      defenseState,
      severity: defenseState?.severityMetric?.severity,
      severityMetric: defenseState?.severityMetric,
      defenseEconomics: defenseState?.defenseEconomics || defenseState?.pipelineResult?.defenseEconomics,
      pipelineConfidence: normalizedPipelineConfidence,
      pipelineConfidencePct:
        defenseState?.pipelineResult?.pipelineConfidencePct ?? normalizedPipelineConfidence,
      evaluatorConfidencePct,
      timestamp: new Date(row.created_at)
    };
  }

  private mapMetrics(row: any): Metrics {
    return {
      testRunId: row.test_run_id,
      attackType: row.attack_type,
      defenseId: row.defense_id,
      llmProvider: row.llm_provider,
      totalTests: row.total_tests,
      passedTests: row.passed_tests,
      failedTests: row.failed_tests,
      truePositives: row.true_positives,
      falsePositives: row.false_positives,
      trueNegatives: row.true_negatives,
      falseNegatives: row.false_negatives,
      accuracy: parseFloat(row.accuracy),
      precision: parseFloat(row.precision),
      recall: parseFloat(row.recall),
      f1Score: parseFloat(row.f1_score),
      tpr: parseFloat(row.tpr),
      fpr: parseFloat(row.fpr),
      avgExecutionTimeMs: parseFloat(row.avg_execution_time_ms),
      minExecutionTimeMs: row.min_execution_time_ms != null ? parseFloat(row.min_execution_time_ms) : undefined,
      maxExecutionTimeMs: row.max_execution_time_ms != null ? parseFloat(row.max_execution_time_ms) : undefined,
      avgTokenCount: parseFloat(row.avg_token_count),
      attackSuccessRate: parseFloat(row.attack_success_rate),
      defenseEffectiveness: parseFloat(row.defense_effectiveness)
    };
  }
}

export const db = new DatabaseService();
