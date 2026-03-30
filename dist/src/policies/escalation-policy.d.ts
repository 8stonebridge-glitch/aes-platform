/**
 * Escalation Policy — when to escalate to human operator.
 */
export interface EscalationRule {
    condition: string;
    action: "block" | "warn" | "escalate";
    timeout_ms: number;
}
export declare const escalationPolicy: {
    rules: EscalationRule[];
    defaultTimeout: number;
    maxEscalationAge: number;
};
export declare function shouldEscalate(condition: string): EscalationRule | null;
export declare function isHardBlock(condition: string): boolean;
