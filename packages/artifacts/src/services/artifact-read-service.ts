import { PgClient } from "./pg-client.js";
import { IntentBriefRepo } from "../repositories/intent-brief-repo.js";
import { AppSpecRepo } from "../repositories/app-spec-repo.js";
import { FeatureBridgeRepo } from "../repositories/feature-bridge-repo.js";
import { VetoResultRepo } from "../repositories/veto-result-repo.js";
import { ValidatorResultRepo } from "../repositories/validator-result-repo.js";
import { CatalogAdmissionRepo } from "../repositories/catalog-admission-repo.js";
import { FixTrailRepo } from "../repositories/fix-trail-repo.js";
import { DeploymentRepo } from "../repositories/deployment-repo.js";
import { BuildRunRepo } from "../repositories/build-run-repo.js";
import { ApprovalRepo } from "../repositories/approval-repo.js";
import type {
  IntentBriefRecord, AppSpecRecord, FeatureBridgeRecord,
  VetoResultRecord, ValidatorResultRecord, CatalogAdmissionRecord,
  FixTrailRecord, DeploymentRecord, BuildRunRecord, UserApprovalRecord,
} from "../schema/types.js";

/**
 * Coordinates read operations across all artifact repositories.
 * Provides cross-table queries for lineage and audit trails.
 */
export class ArtifactReadService {
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

  // ─── Single-record lookups ──────────────────────────────────────────

  async getIntentBrief(id: string): Promise<IntentBriefRecord | null> {
    return this.intentBriefs.findById(id);
  }

  async getAppSpec(id: string): Promise<AppSpecRecord | null> {
    return this.appSpecs.findById(id);
  }

  async getFeatureBridge(id: string): Promise<FeatureBridgeRecord | null> {
    return this.featureBridges.findById(id);
  }

  async getVetoResult(id: string): Promise<VetoResultRecord | null> {
    return this.vetoResults.findById(id);
  }

  async getValidatorResult(id: string): Promise<ValidatorResultRecord | null> {
    return this.validatorResults.findById(id);
  }

  async getBuildRun(id: string): Promise<BuildRunRecord | null> {
    return this.buildRuns.findById(id);
  }

  async getDeployment(id: string): Promise<DeploymentRecord | null> {
    return this.deployments.findById(id);
  }

  async getApproval(id: string): Promise<UserApprovalRecord | null> {
    return this.approvals.findById(id);
  }

  // ─── App-scoped queries ─────────────────────────────────────────────

  async getAppSpecs(appId: string): Promise<AppSpecRecord[]> {
    return this.appSpecs.findByAppId(appId);
  }

  async getLatestAppSpec(appId: string): Promise<AppSpecRecord | null> {
    return this.appSpecs.findLatestByAppId(appId);
  }

  async getFeatureBridges(appId: string): Promise<FeatureBridgeRecord[]> {
    return this.featureBridges.findByAppId(appId);
  }

  async getBuildRuns(appId: string): Promise<BuildRunRecord[]> {
    return this.buildRuns.findByAppId(appId);
  }

  async getDeployments(appId: string): Promise<DeploymentRecord[]> {
    return this.deployments.findByAppId(appId);
  }

  async getApprovals(appId: string): Promise<UserApprovalRecord[]> {
    return this.approvals.findByAppId(appId);
  }

  async getFixTrails(appId: string): Promise<FixTrailRecord[]> {
    return this.fixTrails.findByAppId(appId);
  }

  // ─── Bridge-scoped queries ──────────────────────────────────────────

  async getVetoResultsForBridge(bridgeId: string): Promise<VetoResultRecord[]> {
    return this.vetoResults.findByBridgeId(bridgeId);
  }

  async getValidatorResultsForBridge(bridgeId: string): Promise<ValidatorResultRecord[]> {
    return this.validatorResults.findByBridgeId(bridgeId);
  }

  async getBuildRunsForBridge(bridgeId: string): Promise<BuildRunRecord[]> {
    return this.buildRuns.findByBridgeId(bridgeId);
  }

  // ─── Cross-table lineage queries ────────────────────────────────────

  /**
   * Full lineage from request to current state: intent -> app spec -> bridges -> build runs -> validators
   */
  async getRequestLineage(requestId: string): Promise<{
    intentBrief: IntentBriefRecord | null;
    appSpecs: AppSpecRecord[];
    bridges: FeatureBridgeRecord[];
    buildRuns: BuildRunRecord[];
    validatorResults: ValidatorResultRecord[];
    approvals: UserApprovalRecord[];
  }> {
    const intentBrief = await this.intentBriefs.findByRequestId(requestId);
    const appSpecs = await this.appSpecs.findByRequestId(requestId);

    const appIds = appSpecs.map(s => s.app_id);
    const bridges: FeatureBridgeRecord[] = [];
    const buildRuns: BuildRunRecord[] = [];
    const validatorResults: ValidatorResultRecord[] = [];
    const approvals: UserApprovalRecord[] = [];

    for (const appId of appIds) {
      bridges.push(...await this.featureBridges.findByAppId(appId));
      buildRuns.push(...await this.buildRuns.findByAppId(appId));
      approvals.push(...await this.approvals.findByAppId(appId));
    }

    for (const bridge of bridges) {
      validatorResults.push(...await this.validatorResults.findByBridgeId(bridge.id));
    }

    return { intentBrief, appSpecs, bridges, buildRuns, validatorResults, approvals };
  }

  /**
   * Build run detail with all associated validator results
   */
  async getBuildRunDetail(buildRunId: string): Promise<{
    buildRun: BuildRunRecord | null;
    validatorResults: ValidatorResultRecord[];
    fixTrails: FixTrailRecord[];
  }> {
    const buildRun = await this.buildRuns.findById(buildRunId);
    if (!buildRun) return { buildRun: null, validatorResults: [], fixTrails: [] };

    const validatorResults = await this.validatorResults.findByBuildRunId(buildRunId);
    const fixTrails = await this.fixTrails.findByBuildId(buildRunId);

    return { buildRun, validatorResults, fixTrails };
  }

  /**
   * Find similar past failures for fix-trail pattern matching
   */
  async findSimilarFailures(failureType: string, rootCauseCategory: string): Promise<FixTrailRecord[]> {
    return this.fixTrails.findSimilar(failureType, rootCauseCategory);
  }

  /**
   * Get catalog admission decisions for a given app
   */
  async getCatalogAdmissionsForApp(appId: string): Promise<CatalogAdmissionRecord[]> {
    return this.catalogAdmissions.findBySourceApp(appId);
  }

  /**
   * Get latest deployment for an app in a given environment
   */
  async getLatestDeployment(appId: string, environment: string): Promise<DeploymentRecord | null> {
    return this.deployments.findLatestByAppAndEnv(appId, environment);
  }
}
