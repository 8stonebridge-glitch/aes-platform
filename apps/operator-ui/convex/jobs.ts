import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** List all jobs, newest first */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

/** Get a single job by jobId — reactive subscription */
export const get = query({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
  },
});

/** Get logs for a job — reactive subscription */
export const getLogs = query({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobLogs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

/** Upsert job status — called by the orchestrator via HTTP action */
export const upsert = mutation({
  args: {
    jobId: v.string(),
    intent: v.optional(v.string()),
    currentGate: v.optional(v.string()),
    intentConfirmed: v.optional(v.boolean()),
    userApproved: v.optional(v.boolean()),
    targetPath: v.optional(v.string()),
    deployTarget: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    features: v.optional(v.array(v.string())),
    featureBridges: v.optional(v.any()),
    appSpec: v.optional(v.any()),
    vetoResults: v.optional(v.array(v.any())),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.currentGate !== undefined && { currentGate: args.currentGate }),
        ...(args.intentConfirmed !== undefined && { intentConfirmed: args.intentConfirmed }),
        ...(args.userApproved !== undefined && { userApproved: args.userApproved }),
        ...(args.targetPath !== undefined && { targetPath: args.targetPath }),
        ...(args.deployTarget !== undefined && { deployTarget: args.deployTarget }),
        ...(args.previewUrl !== undefined && { previewUrl: args.previewUrl }),
        ...(args.features !== undefined && { features: args.features }),
        ...(args.featureBridges !== undefined && { featureBridges: args.featureBridges }),
        ...(args.appSpec !== undefined && { appSpec: args.appSpec }),
        ...(args.vetoResults !== undefined && { vetoResults: args.vetoResults }),
        ...(args.errorMessage !== undefined && { errorMessage: args.errorMessage }),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("jobs", {
        jobId: args.jobId,
        intent: args.intent ?? "",
        currentGate: args.currentGate ?? "gate_0",
        intentConfirmed: args.intentConfirmed ?? false,
        userApproved: args.userApproved ?? false,
        targetPath: args.targetPath,
        deployTarget: args.deployTarget,
        previewUrl: args.previewUrl,
        features: args.features ?? [],
        featureBridges: args.featureBridges,
        appSpec: args.appSpec,
        vetoResults: args.vetoResults,
        errorMessage: args.errorMessage,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/** Append a log entry */
export const addLog = mutation({
  args: {
    jobId: v.string(),
    gate: v.string(),
    message: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("jobLogs", {
      jobId: args.jobId,
      gate: args.gate,
      message: args.message,
      timestamp: args.timestamp,
    });
  },
});
