import { PgClient } from "./pg-client.js";
import { IntentBriefRepo, CreateIntentBrief } from "../repositories/intent-brief-repo.js";
import { AppSpecRepo, CreateAppSpec } from "../repositories/app-spec-repo.js";
import { FeatureBridgeRepo, CreateFeatureBridge } from "../repositories/feature-bridge-repo.js";
import { VetoResultRepo, CreateVetoResult } from "../repositories/veto-result-repo.js";
import { ValidatorResultRepo, CreateValidatorResult } from "../repositories/validator-result-repo.js";
import { CatalogAdmissionRepo, CreateCatalogAdmission } from "../repositories/catalog-admission-repo.js";
import { FixTrailRepo, CreateFixTrail } from "../repositories/fix-trail-repo.js";
import { DeploymentRepo, CreateDeployment } from "../repositories/deployment-repo.js";
import { BuildRunRepo, CreateBuildRun } from "../repositories/build-run-repo.js";
import { ApprovalRepo, CreateUserApproval } from "../repositories/approval-repo.js";
import type {
  IntentBriefRecord, AppSpecRecord, FeatureBridgeRecord,
  VetoResultRecord, ValidatorResultRecord, CatalogAdmissionRecord,
  FixTrailRecord, DeploymentRecord, BuildRunRecord, UserApprovalRecord,
} from "../schema/types.js";

/**
 * Coordinates write operations across all artifact repositories.
 * All writes are immutable — new versions reference parents via parent_id.
 */
export class ArtifactWriteService {
  private intentBriefs: IntentBriefRepo;
  private appSpecs: AppSpecRepo;
  private featureBridges: FeatureBridgeRepo;
  private vetoResults: VetoResultRepo;
  private validatorResults: ValidatorResultRepo;
  private catalogAdmissions: CatalogAdmissionRepo;
  private fixTrails: FixTrailRepo;
  private deployments: DeploymentRepo;
  private buildRuns: BuildRunRepo;
  private approvals: ApprovalRepo;

  constructor(private db: PgClient) {
    this.intentBriefs = new IntentBriefRepo(db);
    this.appSpecs = new AppSpecRepo(db);
    this.featureBridges = new FeatureBridgeRepo(db);
    this.vetoResults = new VetoResultRepo(db);
    this.validatorResults = new ValidatorResultRepo(db);
    this.catalogAdmissions = new CatalogAdmissionRepo(db);
    this.fixTrails = new FixTrailRepo(db);
    this.deployments = new DeploymentRepo(db);
    this.buildRuns = new BuildRunRepo(db);
    this.approvals = new ApprovalRepo(db);
  }

  // ─── Gate 0: Intent ─────────────────────────────────────────────────
  async recordIntentBrief(brief: CreateIntentBrief): Promise<IntentBriefRecord> {
    return this.intentBriefs.create(brief);
  }

  // ─── Gate 1: App Spec ───────────────────────────────────────────────
  async recordAppSpec(spec: CreateAppSpec): Promise<AppSpecRecord> {
    return this.appSpecs.create(spec);
  }

  // ─── Gate 2: Feature Bridge ─────────────────────────────────────────
  async recordFeatureBridge(bridge: CreateFeatureBridge): Promise<FeatureBridgeRecord> {
    return this.featureBridges.create(bridge);
  }

  // ─── Gate 3: Veto ───────────────────────────────────────────────────
  async recordVetoResult(veto: CreateVetoResult): Promise<VetoResultRecord> {
    return this.vetoResults.create(veto);
  }

  // ─── Validation ─────────────────────────────────────────────────────
  async recordValidatorResult(result: CreateValidatorResult): Promise<ValidatorResultRecord> {
    return this.validatorResults.create(result);
  }

  async recordValidatorBatch(results: CreateValidatorResult[]): Promise<ValidatorResultRecord[]> {
    const records: ValidatorResultRecord[] = [];
    for (const result of results) {
      records.push(await this.validatorResults.create(result));
    }
    return records;
  }

  // ─── Gate 4: Catalog Admission ──────────────────────────────────────
  async recordCatalogAdmission(admission: CreateCatalogAdmission): Promise<CatalogAdmissionRecord> {
    return this.catalogAdmissions.create(admission);
  }

  // ─── Gate 5: Fix Trail ──────────────────────────────────────────────
  async recordFixTrail(trail: CreateFixTrail): Promise<FixTrailRecord> {
    return this.fixTrails.create(trail);
  }

  async resolveFixTrail(id: string): Promise<FixTrailRecord | null> {
    return this.fixTrails.markResolved(id);
  }

  // ─── Build Runs ─────────────────────────────────────────────────────
  async recordBuildRun(run: CreateBuildRun): Promise<BuildRunRecord> {
    return this.buildRuns.create(run);
  }

  async updateBuildRunStatus(id: string, status: string, extras?: {
    commit_sha?: string;
    pr_number?: number;
    pr_url?: string;
    builder_duration_ms?: number;
    files_created?: string[];
    files_modified?: string[];
  }): Promise<BuildRunRecord | null> {
    return this.buildRuns.updateStatus(id, status, extras);
  }

  // ─── Deployments ────────────────────────────────────────────────────
  async recordDeployment(deployment: CreateDeployment): Promise<DeploymentRecord> {
    return this.deployments.create(deployment);
  }

  async updateDeploymentStatus(id: string, status: string): Promise<DeploymentRecord | null> {
    return this.deployments.updateStatus(id, status);
  }

  // ─── Approvals ──────────────────────────────────────────────────────
  async recordApproval(approval: CreateUserApproval): Promise<UserApprovalRecord> {
    return this.approvals.create(approval);
  }
}
