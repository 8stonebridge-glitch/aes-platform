import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Get active (non-dismissed) notifications */
export const active = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_dismissed", (q) => q.eq("dismissed", false))
      .collect();
  },
});

/** Create a notification */
export const create = mutation({
  args: {
    type: v.string(),
    title: v.string(),
    message: v.string(),
    jobId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      type: args.type,
      title: args.title,
      message: args.message,
      jobId: args.jobId,
      dismissed: false,
      createdAt: Date.now(),
    });
  },
});

/** Dismiss a notification */
export const dismiss = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { dismissed: true });
  },
});
