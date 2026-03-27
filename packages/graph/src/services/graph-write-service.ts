import { z } from "zod";
import { Neo4jClient } from "./neo4j-client.js";
import { NODE_TYPES, type NodeLabel } from "../schema/node-types.js";
import { EDGE_TYPES, type EdgeLabel } from "../schema/edge-types.js";

/**
 * Write service for mutating the AES knowledge graph.
 * Validates inputs against the schema before writing.
 */
export class GraphWriteService {
  constructor(private client: Neo4jClient) {}

  // --- Node Operations ---

  async createNode(
    label: NodeLabel,
    properties: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const schema = NODE_TYPES[label];
    if (!schema) {
      throw new Error(`Unknown node type: ${label}`);
    }

    // Validate required properties
    for (const req of schema.required) {
      if (properties[req as string] === undefined || properties[req as string] === null) {
        throw new Error(`Missing required property '${req}' for node type '${label}'`);
      }
    }

    // Validate no unknown properties
    const allowed = new Set<string>([...schema.required, ...schema.optional]);
    for (const key of Object.keys(properties)) {
      if (!allowed.has(key)) {
        throw new Error(`Unknown property '${key}' for node type '${label}'`);
      }
    }

    const cypher = `CREATE (n:${label} $props) RETURN n`;
    return this.client.runQuery(cypher, { props: properties });
  }

  async updateNode(
    label: NodeLabel,
    idField: string,
    idValue: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const schema = NODE_TYPES[label];
    if (!schema) {
      throw new Error(`Unknown node type: ${label}`);
    }

    const allowed = new Set<string>([...schema.required, ...schema.optional]);
    for (const key of Object.keys(updates)) {
      if (!allowed.has(key)) {
        throw new Error(`Unknown property '${key}' for node type '${label}'`);
      }
    }

    const setClauses = Object.keys(updates)
      .map((key) => `n.${key} = $updates.${key}`)
      .join(", ");

    const cypher = `
      MATCH (n:${label} {${idField}: $idValue})
      SET ${setClauses}
      RETURN n
    `;
    return this.client.runQuery(cypher, { idValue, updates });
  }

  async deleteNode(label: NodeLabel, idField: string, idValue: string): Promise<void> {
    const cypher = `
      MATCH (n:${label} {${idField}: $idValue})
      DETACH DELETE n
    `;
    await this.client.runQuery(cypher, { idValue });
  }

  // --- Edge Operations ---

  async createEdge(
    edgeType: EdgeLabel,
    fromId: { label: NodeLabel; field: string; value: string },
    toId: { label: NodeLabel; field: string; value: string },
    properties: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>[]> {
    const edgeDef = EDGE_TYPES[edgeType];
    if (!edgeDef) {
      throw new Error(`Unknown edge type: ${edgeType}`);
    }

    if (edgeDef.from !== fromId.label) {
      throw new Error(
        `Edge ${edgeType} expects from-node of type '${edgeDef.from}', got '${fromId.label}'`,
      );
    }
    if (edgeDef.to !== toId.label) {
      throw new Error(
        `Edge ${edgeType} expects to-node of type '${edgeDef.to}', got '${toId.label}'`,
      );
    }

    const propStr = Object.keys(properties).length > 0 ? " $props" : "";
    const cypher = `
      MATCH (a:${fromId.label} {${fromId.field}: $fromValue})
      MATCH (b:${toId.label} {${toId.field}: $toValue})
      CREATE (a)-[r:${edgeType}${propStr}]->(b)
      RETURN r
    `;
    return this.client.runQuery(cypher, {
      fromValue: fromId.value,
      toValue: toId.value,
      ...(Object.keys(properties).length > 0 ? { props: properties } : {}),
    });
  }

  async deleteEdge(
    edgeType: EdgeLabel,
    fromId: { label: NodeLabel; field: string; value: string },
    toId: { label: NodeLabel; field: string; value: string },
  ): Promise<void> {
    const cypher = `
      MATCH (a:${fromId.label} {${fromId.field}: $fromValue})
            -[r:${edgeType}]->
            (b:${toId.label} {${toId.field}: $toValue})
      DELETE r
    `;
    await this.client.runQuery(cypher, {
      fromValue: fromId.value,
      toValue: toId.value,
    });
  }

  // --- Bulk Operations ---

  async createApp(props: {
    app_id: string;
    title: string;
    app_class: string;
    risk_class: string;
    created_at: string;
    summary?: string;
    status?: string;
  }) {
    return this.createNode("App", props);
  }

  async createFeature(props: {
    feature_id: string;
    name: string;
    priority: string | number;
    status: string;
    app_id?: string;
    summary?: string;
    description?: string;
  }) {
    return this.createNode("Feature", props);
  }

  async linkFeatureToPackage(featureId: string, packageId: string, confidence?: number) {
    return this.createEdge(
      "IMPLEMENTED_BY",
      { label: "Feature", field: "feature_id", value: featureId },
      { label: "Package", field: "package_id", value: packageId },
      confidence !== undefined ? { confidence } : {},
    );
  }

  async addFeatureDependency(fromFeatureId: string, toFeatureId: string, type: string, reason?: string) {
    return this.createEdge(
      "DEPENDS_ON",
      { label: "Feature", field: "feature_id", value: fromFeatureId },
      { label: "Feature", field: "feature_id", value: toFeatureId },
      { type, ...(reason ? { reason } : {}) },
    );
  }

  async recordFailurePattern(props: {
    pattern_id: string;
    name: string;
    failure_type: string;
    root_cause_category: string;
    description?: string;
    severity_range?: string;
    frequency?: number;
  }) {
    return this.createNode("FailurePattern", { ...props, first_observed: new Date().toISOString() });
  }

  async linkFailureToFix(failurePatternId: string, fixPatternId: string, successRate?: number) {
    return this.createEdge(
      "FIXED_BY",
      { label: "FailurePattern", field: "pattern_id", value: failurePatternId },
      { label: "FixPattern", field: "pattern_id", value: fixPatternId },
      successRate !== undefined ? { success_rate: successRate } : {},
    );
  }

  async promoteEntry(entryId: string, newTier: string) {
    return this.updateNode("CatalogEntry", "entry_id", entryId, {
      promotion_tier: newTier,
      last_validation_date: new Date().toISOString(),
    });
  }

  async updateFeatureStatus(featureId: string, status: string) {
    return this.updateNode("Feature", "feature_id", featureId, { status });
  }

  // --- Schema Setup ---

  async applyConstraints(cypherStatements: string): Promise<void> {
    const statements = cypherStatements
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("//"));
    await this.client.runMultiple(statements);
  }

  async runSeedFile(cypherStatements: string): Promise<void> {
    // Split on semicolons that are followed by a newline (not inside strings)
    const statements = cypherStatements
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("//"));
    await this.client.runMultiple(statements);
  }

  // --- Raw Write ---

  async runRawWrite(cypher: string, params: Record<string, unknown> = {}) {
    return this.client.runWriteQuery(cypher, params);
  }
}
