import { fail, handle, ok } from "@/lib/server/http";
import { chatJson, INTAKE_SYSTEM, IntakeSchema } from "@/lib/server/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Consent-gated: the browser only calls this after the reporter ticks "use AI". Nothing is stored. */
export const POST = handle(async (req) => {
  const { narrative } = await req.json();
  if (typeof narrative !== "string" || narrative.trim().length < 20) return fail("Please write at least a couple of sentences.");
  const { data, model, ms } = await chatJson(IntakeSchema, INTAKE_SYSTEM, narrative.slice(0, 8000));
  return ok({ intake: data, model, ms });
});
