import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

/** POST /push-status — orchestrator pushes job state here after each gate */
http.route({
  path: "/push-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    await ctx.runMutation(api.jobs.upsert, {
      jobId: body.jobId,
      intent: body.intent,
      currentGate: body.currentGate,
      intentConfirmed: body.intentConfirmed,
      userApproved: body.userApproved,
      targetPath: body.targetPath,
      deployTarget: body.deployTarget,
      previewUrl: body.previewUrl,
      features: body.features,
      featureBridges: body.featureBridges,
      appSpec: body.appSpec,
      vetoResults: body.vetoResults,
      errorMessage: body.errorMessage,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/** POST /push-log — orchestrator pushes log entries here */
http.route({
  path: "/push-log",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    await ctx.runMutation(api.jobs.addLog, {
      jobId: body.jobId,
      gate: body.gate,
      message: body.message,
      timestamp: body.timestamp ?? new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/** POST /push-notification — orchestrator pushes notifications */
http.route({
  path: "/push-notification",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    await ctx.runMutation(api.notifications.create, {
      type: body.type ?? "info",
      title: body.title,
      message: body.message,
      jobId: body.jobId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
