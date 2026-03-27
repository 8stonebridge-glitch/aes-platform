// Schema
export { NODE_TYPES, type NodeLabel } from "./schema/node-types.js";
export type {
  App,
  Feature,
  FeatureType,
  Package,
  Repo,
  CatalogEntry,
  FailurePattern,
  FixPattern,
} from "./schema/node-types.js";
export {
  AppSchema,
  FeatureSchema,
  FeatureTypeSchema,
  PackageSchema,
  RepoSchema,
  CatalogEntrySchema,
  FailurePatternSchema,
  FixPatternSchema,
} from "./schema/node-types.js";
export { EDGE_TYPES, type EdgeLabel, type EdgeDefinition } from "./schema/edge-types.js";

// Queries
export * as decompositionQueries from "./queries/decomposition-queries.js";
export * as bridgeCompileQueries from "./queries/bridge-compile-queries.js";
export * as validatorSelectionQueries from "./queries/validator-selection-queries.js";
export * as failureMatchingQueries from "./queries/failure-matching-queries.js";
export * as catalogPromotionQueries from "./queries/catalog-promotion-queries.js";

// Services
export { Neo4jClient, type Neo4jConfig } from "./services/neo4j-client.js";
export { GraphReadService } from "./services/graph-read-service.js";
export { GraphWriteService } from "./services/graph-write-service.js";
