import { Router, Request, Response } from 'express';
import { jobService } from '../services/job.service';

const router = Router();

/** GET /api/jobs — recent jobs */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);
    const jobs = await jobService.listJobs(limit);
    res.json(jobs);
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list jobs' });
  }
});

/** GET /api/jobs/:jobId */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await jobService.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get job' });
  }
});

/** PATCH /api/jobs/:jobId — label / metadata only */
router.patch('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { label, metadata } = req.body as {
      label?: string | null;
      metadata?: Record<string, unknown>;
    };
    if (label === undefined && metadata === undefined) {
      return res.status(400).json({ error: 'Provide label and/or metadata' });
    }
    const updated = await jobService.patchJob(req.params.jobId, { label, metadata });
    if (!updated) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(updated);
  } catch (error) {
    console.error('Patch job error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update job' });
  }
});

/** POST /api/jobs/:jobId/cancel — cooperative stop for running jobs */
router.post('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
  try {
    const ok = await jobService.requestCancel(req.params.jobId);
    const job = await jobService.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({
      accepted: ok,
      message: ok
        ? 'Cancel requested — worker will stop shortly'
        : job.status !== 'running'
          ? `Job is already ${job.status}`
          : 'Could not set cancel flag',
      job,
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to cancel job' });
  }
});

export default router;
