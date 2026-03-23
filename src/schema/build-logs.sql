-- Build logs for AES v12 pipeline runs.
-- Structured log entries per job, queryable by gate and feature.

CREATE TABLE IF NOT EXISTS build_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  gate TEXT,
  feature_id TEXT,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_build_logs_job_id ON build_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_gate ON build_logs(job_id, gate);
