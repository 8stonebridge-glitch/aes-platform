import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Job status — pushed by the orchestrator after each gate transition
  jobs: defineTable({
    jobId: v.string(),
    intent: v.string(),
    currentGate: v.string(),
    intentConfirmed: v.boolean(),
    userApproved: v.boolean(),
    targetPath: v.optional(v.string()),
    deployTarget: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    features: v.array(v.string()),
    featureBridges: v.optional(v.any()),
    appSpec: v.optional(v.any()),
    vetoResults: v.optional(v.array(v.any())),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_jobId", ["jobId"])
    .index("by_createdAt", ["createdAt"]),

  // Log entries for each job
  jobLogs: defineTable({
    jobId: v.string(),
    gate: v.string(),
    message: v.string(),
    timestamp: v.string(),
  }).index("by_jobId", ["jobId"]),

  // Notifications / attention items
  notifications: defineTable({
    type: v.string(),
    title: v.string(),
    message: v.string(),
    jobId: v.optional(v.string()),
    dismissed: v.boolean(),
    createdAt: v.number(),
  }).index("by_dismissed", ["dismissed"])
    .index("by_jobId", ["jobId"]),
});
