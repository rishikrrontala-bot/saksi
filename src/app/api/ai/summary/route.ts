import { fail, handle, ok } from "@/lib/server/http";
import { chatJson, SUMMARY_SYSTEM, SummarySchema } from "@/lib/server/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called from the task-force console after the report is decrypted in the browser, and only if the
 * reporter consented to AI processing (flag inside the encrypted payload). Nothing is stored.
 */
export const POST = handle(async (req) => {
  const { report } = await req.json();
  if (!report || typeof report !== "object") return fail("report required");
  if (report.aiConsent !== true) return fail("The reporter did not consent to AI processing of this report", 403);
  const text = JSON.stringify(
    { narrative: report.narrative, structured: report.structured, language: report.language },
    null,
    1
  ).slice(0, 10000);
  const { data, model, ms } = await chatJson(SummarySchema, SUMMARY_SYSTEM, text);
  return ok({ summary: data, model, ms });
});
