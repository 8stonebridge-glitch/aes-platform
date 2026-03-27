import { Neo4jClient } from "./neo4j-client.js";
import * as decomposition from "../queries/decomposition-queries.js";
import * as bridge from "../queries/bridge-compile-queries.js";
import * as validator from "../queries/validator-selection-queries.js";
import * as failure from "../queries/failure-matching-queries.js";
import * as catalog from "../queries/catalog-promotion-queries.js";

/**
 * Read-only service for querying the AES knowledge graph.
 * All methods return raw Neo4j result objects.
 */
export class GraphReadService {
  constructor(private client: Neo4jClient) {}

  // --- Decomposition ---

  async findSimilarFeatures(featureName: string, appClass: string) {
    return this.client.runQuery(decomposition.findSimilarFeatures(featureName, appClass), {
      featureName,
      appClass,
    });
  }

  async findExistingPatterns(featureType: string) {
    return this.client.runQuery(decomposition.findExistingPatterns(featureType), {
      featureType,
    });
  }

  async findPatternsForFeatureType(featureType: string) {
    return this.client.runQuery(decomposition.findPatternsForFeatureType(featureType), {
      featureType,
    });
  }

  async getFeatureTypeMetadata(featureType: string) {
    return this.client.runQuery(decomposition.getFeatureTypeMetadata(featureType), {
      featureType,
    });
  }

  async findFeaturesForApp(appId: string) {
    return this.client.runQuery(decomposition.findFeaturesForApp(appId), { appId });
  }

  async findFeatureDependencyChain(featureId: string) {
    return this.client.runQuery(decomposition.findFeatureDependencyChain(featureId), {
      featureId,
    });
  }

  // --- Bridge Compilation ---

  async findReuseCandidates(featureType: string, tags: string[]) {
    return this.client.runQuery(bridge.findReuseCandidates(featureType, tags), {
      featureType,
      tags,
    });
  }

  async checkDependencySatisfied(featureId: string) {
    return this.client.runQuery(bridge.checkDependencySatisfied(featureId), {
      featureId,
    });
  }

  async resolvePackageDependencies(packageId: string) {
    return this.client.runQuery(bridge.resolvePackageDependencies(packageId), {
      packageId,
    });
  }

  async findPackagesForFeatureType(featureType: string) {
    return this.client.runQuery(bridge.findPackagesForFeatureType(featureType), {
      featureType,
    });
  }

  async getBridgePresetWithDependencies(featureType: string) {
    return this.client.runQuery(bridge.getBridgePresetWithDependencies(featureType), {
      featureType,
    });
  }

  async findBlockingFeatures(featureId: string) {
    return this.client.runQuery(bridge.findBlockingFeatures(featureId), {
      featureId,
    });
  }

  async getPackageOwnership(packageId: string) {
    return this.client.runQuery(bridge.getPackageOwnership(packageId), {
      packageId,
    });
  }

  // --- Validator Selection ---

  async getValidatorsForFeature(featureType: string) {
    return this.client.runQuery(validator.getValidatorsForFeature(featureType), {
      featureType,
    });
  }

  async getRulesForFeatureType(featureType: string) {
    return this.client.runQuery(validator.getRulesForFeatureType(featureType), {
      featureType,
    });
  }

  async getHeuristicsForFailureType(failureType: string) {
    return this.client.runQuery(validator.getHeuristicsForFailureType(failureType), {
      failureType,
    });
  }

  async getPreventionRulesForGate(gate: string) {
    return this.client.runQuery(validator.getPreventionRulesForGate(gate), { gate });
  }

  async getTestCoverageForModule(moduleId: string) {
    return this.client.runQuery(validator.getTestCoverageForModule(moduleId), {
      moduleId,
    });
  }

  async getValidatorBundleWithScenarios(featureType: string) {
    return this.client.runQuery(validator.getValidatorBundleWithScenarios(featureType), {
      featureType,
    });
  }

  // --- Failure Matching ---

  async findSimilarFailures(failureType: string, rootCause: string) {
    return this.client.runQuery(failure.findSimilarFailures(failureType, rootCause), {
      failureType,
      rootCause,
    });
  }

  async findFailuresForApp(appId: string) {
    return this.client.runQuery(failure.findFailuresForApp(appId), { appId });
  }

  async findRelatedFailures(patternId: string) {
    return this.client.runQuery(failure.findRelatedFailures(patternId), { patternId });
  }

  async getFailureToRuleMapping(failureType: string) {
    return this.client.runQuery(failure.getFailureToRuleMapping(failureType), {
      failureType,
    });
  }

  async getMostEffectiveFixes(failureType: string) {
    return this.client.runQuery(failure.getMostEffectiveFixes(failureType), {
      failureType,
    });
  }

  async getDetectionCoverage(failureType: string) {
    return this.client.runQuery(failure.getDetectionCoverage(failureType), {
      failureType,
    });
  }

  // --- Catalog Promotion ---

  async getCandidatesForPromotion() {
    return this.client.runQuery(catalog.getCandidatesForPromotion());
  }

  async countSuccessfulUses(entryId: string) {
    return this.client.runQuery(catalog.countSuccessfulUses(entryId), { entryId });
  }

  async getPromotionHistory(entryId: string) {
    return this.client.runQuery(catalog.getPromotionHistory(entryId), { entryId });
  }

  async getEntriesByPromotionTier(tier: string) {
    return this.client.runQuery(catalog.getEntriesByPromotionTier(tier), { tier });
  }

  async getPackagePromotionReadiness(packageId: string) {
    return this.client.runQuery(catalog.getPackagePromotionReadiness(packageId), {
      packageId,
    });
  }

  async findUnverifiedDependencies(packageId: string) {
    return this.client.runQuery(catalog.findUnverifiedDependencies(packageId), {
      packageId,
    });
  }

  // --- Generic ---

  async runRawQuery(cypher: string, params: Record<string, unknown> = {}) {
    return this.client.runQuery(cypher, params);
  }
}
