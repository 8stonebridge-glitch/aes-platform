/**
 * design-extract.ts — Extracts structured DesignEvidence from Paper MCP
 * designs, JSON descriptions, or screenshot descriptions.
 *
 * Modes:
 *   --paper <file>   Accept piped Paper MCP JSON (get_tree_summary / get_children output)
 *   --json <file>    Accept a semi-structured design description JSON
 *   --output <file>  Write the extracted evidence to a file
 *   --persist        Also persist the evidence to Neo4j
 *
 * Usage:
 *   npx tsx src/tools/design-extract.ts --json design-input.json
 *   npx tsx src/tools/design-extract.ts --json design-input.json --output evidence.json --persist
 */
import type { DesignEvidence } from "../types/design-evidence.js";
export interface DesignInput {
    name: string;
    source_type: "paper" | "figma" | "screenshot" | "manual";
    source_ref: string;
    screens: DesignInputScreen[];
    navigation?: {
        primary?: {
            label: string;
            target_screen: string;
            icon?: string;
        }[];
        secondary?: {
            label: string;
            target_screen: string;
            parent?: string;
        }[];
    };
    layout?: {
        pattern?: string;
        responsive_notes?: string[];
        sidebar?: {
            position?: string;
            collapsible?: boolean;
            width_hint?: string;
        };
        topbar?: {
            sticky?: boolean;
            has_search?: boolean;
            has_user_menu?: boolean;
            has_notifications?: boolean;
        };
    };
}
interface DesignInputScreen {
    name: string;
    purpose: string;
    is_overlay?: boolean;
    artboard_ref?: string;
    dimensions?: {
        width: number;
        height: number;
    };
    regions?: {
        name: string;
        purpose: string;
        components?: string[];
    }[];
    components?: string[];
    data_views?: DesignInputDataView[];
    forms?: DesignInputForm[];
    actions?: DesignInputAction[];
    states?: DesignInputState[];
}
interface DesignInputDataView {
    name: string;
    type: "table" | "list" | "card_grid" | "detail_pane" | "tree" | "timeline" | "chart" | "kanban" | "calendar";
    implied_model: string;
    columns?: {
        name: string;
        type?: string;
        sortable?: boolean;
        filterable?: boolean;
    }[];
    capabilities?: string[];
    row_actions?: string[];
    bulk_actions?: string[];
}
interface DesignInputForm {
    name: string;
    fields: {
        name: string;
        label: string;
        type?: string;
        required?: boolean;
        placeholder?: string;
        options?: string[];
    }[];
    submit_label: string;
    cancel_label?: string;
    is_multi_step?: boolean;
}
interface DesignInputAction {
    label: string;
    type?: string;
    element?: string;
    is_destructive?: boolean;
    is_primary?: boolean;
    target_screen?: string;
    implied_operation?: string;
}
interface DesignInputState {
    type: string;
    description: string;
    explicit?: boolean;
    recovery_action?: string;
}
export declare function extractDesignEvidence(input: DesignInput): DesignEvidence;
/**
 * Persist design evidence to Neo4j.
 *
 * IMPORTANT: This function accepts ONLY the canonical DesignEvidence type.
 * Raw/authored evidence must be normalized first via normalizeDesignEvidence().
 * Do not pass RawDesignEvidence directly — it will compile but produce null
 * properties in the graph.
 */
export declare function persistDesignEvidence(evidence: DesignEvidence): Promise<void>;
export {};
