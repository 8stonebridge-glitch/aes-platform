// In-memory job store. Will be backed by Postgres artifact store later.

interface LogEntry {
  timestamp: string;
  gate?: string;
  featureId?: string;
  message: string;
}

interface JobRecord {
  jobId: string;
  requestId: string;
  rawRequest: string;
  currentGate: string;
  createdAt: string;
  intentBrief?: any;
  intentConfirmed?: boolean;
  appSpec?: any;
  userApproved?: boolean;
  featureBridges?: Record<string, any>;
  featureBuildOrder?: string[];
  featureBuildIndex?: number;
  buildResults?: Record<string, any>;
  validatorResults?: Record<string, any>;
  deploymentUrl?: string | null;
  errorMessage?: string | null;
}

class JobStore {
  private jobs: Map<string, JobRecord> = new Map();
  private logs: Map<string, LogEntry[]> = new Map();
  private latestJobId: string | null = null;

  create(job: JobRecord): void {
    this.jobs.set(job.jobId, { ...job, createdAt: new Date().toISOString() });
    this.logs.set(job.jobId, []);
    this.latestJobId = job.jobId;
  }

  get(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  getLatest(): JobRecord | undefined {
    if (!this.latestJobId) return undefined;
    return this.jobs.get(this.latestJobId);
  }

  update(jobId: string, updates: Partial<JobRecord>): void {
    const existing = this.jobs.get(jobId);
    if (!existing) return;
    this.jobs.set(jobId, { ...existing, ...updates });
  }

  addLog(jobId: string, entry: Omit<LogEntry, "timestamp">): void {
    const logs = this.logs.get(jobId);
    if (!logs) return;
    logs.push({ ...entry, timestamp: new Date().toISOString() });
  }

  getLogs(jobId: string): LogEntry[] {
    return this.logs.get(jobId) || [];
  }

  list(): JobRecord[] {
    return Array.from(this.jobs.values());
  }
}

let instance: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!instance) {
    instance = new JobStore();
  }
  return instance;
}
