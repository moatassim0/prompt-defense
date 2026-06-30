import { query } from '../config/database';

export type AsyncJobStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface AsyncJob {
  id: string;
  jobType: string;
  status: AsyncJobStatus;
  cancelRequested: boolean;
  inputPayload: Record<string, unknown>;
  progress: Record<string, unknown>;
  resultSummary: Record<string, unknown> | null;
  errorMessage: string | null;
  linkedTestRunId: number | null;
  label: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): AsyncJob {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    cancelRequested: row.cancel_requested,
    inputPayload: row.input_payload ?? {},
    progress: row.progress ?? {},
    resultSummary: row.result_summary ?? null,
    errorMessage: row.error_message ?? null,
    linkedTestRunId: row.linked_test_run_id ?? null,
    label: row.label ?? null,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class JobService {
  async createJob(params: {
    jobType: string;
    inputPayload: Record<string, unknown>;
    label?: string;
    metadata?: Record<string, unknown>;
    /** Default pending; stress tests pass running immediately. */
    status?: AsyncJobStatus;
  }): Promise<AsyncJob> {
    const status: AsyncJobStatus = params.status ?? 'pending';
    const result = await query(
      `INSERT INTO async_jobs (job_type, status, input_payload, label, metadata)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)
       RETURNING *`,
      [
        params.jobType,
        status,
        JSON.stringify(params.inputPayload),
        params.label ?? null,
        JSON.stringify(params.metadata ?? {}),
      ],
    );
    return mapRow(result.rows[0]);
  }

  async getJob(id: string): Promise<AsyncJob | null> {
    const result = await query('SELECT * FROM async_jobs WHERE id = $1', [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listJobs(limit = 50): Promise<AsyncJob[]> {
    const result = await query(
      'SELECT * FROM async_jobs ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(mapRow);
  }

  async updateJobStatus(id: string, status: AsyncJobStatus): Promise<void> {
    await query(
      `UPDATE async_jobs SET status = $2, updated_at = NOW() WHERE id = $1`,
      [id, status],
    );
  }

  async setLinkedTestRun(id: string, testRunId: number): Promise<void> {
    await query(
      `UPDATE async_jobs SET linked_test_run_id = $2, updated_at = NOW() WHERE id = $1`,
      [id, testRunId],
    );
  }

  /** Shallow-merge progress JSON (Postgres jsonb ||). */
  async mergeProgress(id: string, patch: Record<string, unknown>): Promise<void> {
    await query(
      `UPDATE async_jobs SET progress = progress || $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [id, JSON.stringify(patch)],
    );
  }

  /** User/agent requests cooperative cancellation. */
  async requestCancel(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE async_jobs
       SET cancel_requested = TRUE, updated_at = NOW()
       WHERE id = $1 AND status = 'running'
       RETURNING id`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** True if the worker should stop cooperatively. */
  async isCancelRequested(id: string): Promise<boolean> {
    const row = await this.getJob(id);
    if (!row) return false;
    return row.cancelRequested || row.status === 'cancelled' || row.status === 'failed';
  }

  async finalizeJob(
    id: string,
    status: 'completed' | 'cancelled' | 'failed',
    resultSummary?: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<void> {
    await query(
      `UPDATE async_jobs
       SET status = $2,
           result_summary = COALESCE($3::jsonb, result_summary),
           error_message = COALESCE($4, error_message),
           updated_at = NOW()
       WHERE id = $1`,
      [id, status, resultSummary ? JSON.stringify(resultSummary) : null, errorMessage ?? null],
    );
  }

  /**
   * Editable fields: label and metadata (metadata merged at top level).
   * Allowed for any status so users can annotate finished jobs.
   */
  async patchJob(
    id: string,
    patch: { label?: string | null; metadata?: Record<string, unknown> },
  ): Promise<AsyncJob | null> {
    const job = await this.getJob(id);
    if (!job) return null;

    if (patch.label !== undefined) {
      await query(`UPDATE async_jobs SET label = $2, updated_at = NOW() WHERE id = $1`, [
        id,
        patch.label,
      ]);
    }
    if (patch.metadata !== undefined && Object.keys(patch.metadata).length > 0) {
      await query(
        `UPDATE async_jobs SET metadata = metadata || $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [id, JSON.stringify(patch.metadata)],
      );
    }
    return this.getJob(id);
  }
}

export const jobService = new JobService();
