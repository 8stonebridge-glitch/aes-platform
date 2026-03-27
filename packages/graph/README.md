# @aes/graph

Neo4j knowledge graph layer for AES v12. Stores relationships and meaning, not code blobs.

## Schema

- **25 node types**: App, Feature, FeatureType, Package, Repo, Module, Rule, TestSuite, PR, Pattern, Team, Job, Artifact, ValidatorBundle, BridgePreset, ScenarioPack, CatalogEntry, ConvexSchema, ReferenceSchema, FailurePattern, FixPattern, PreventionRule, ValidatorHeuristic
- **27 edge types**: IMPLEMENTED_BY, LIVES_IN, CONTAINS, GOVERNED_BY, COVERED_BY, CHANGED, REUSED_IN, DEPENDS_ON, USES, OWNS, PRODUCED_BY, VALIDATES, TRANSLATES_TO, FAILS_WITH, FIXED_BY, PREVENTED_BY, DETECTED_BY, APPLIES_TO, TRIGGERED_BY, OBSERVED_IN, SIMILAR_TO, SOURCED_FROM, REQUIRES, BLOCKS, EXTENDS, CATALOG_MATCH, BUILT_FROM
- **70+ seed nodes** covering repos, teams, feature types, validator bundles, bridge presets, scenario packs, packages, patterns, and catalog entries

## Query Domains

- **decomposition-queries**: Feature decomposition and pattern matching during planning
- **bridge-compile-queries**: Reuse candidate discovery and dependency resolution
- **validator-selection-queries**: Validator and rule selection per feature type
- **failure-matching-queries**: Past failure lookup and fix recommendation
- **catalog-promotion-queries**: Promotion tier management and readiness checks

## Usage

```typescript
import { Neo4jClient, GraphReadService, GraphWriteService } from "@aes/graph";

const client = Neo4jClient.fromEnv();
const reader = new GraphReadService(client);
const writer = new GraphWriteService(client);

// Find validators for a feature type
const validators = await reader.getValidatorsForFeature("workflow");

// Create a new feature
await writer.createFeature({
  feature_id: "feat-001",
  name: "Task Board",
  priority: "P0",
  status: "planning",
  app_id: "app-001",
});

await client.close();
```

## Setup

```bash
npm install
npm run build
```

Set environment variables:
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
```
