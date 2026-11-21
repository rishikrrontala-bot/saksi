/**
 * Featherless.ai (OpenAI-compatible) client running open-weight models.
 * Used only with the reporter's explicit consent; nothing here is stored.
 */
import { z } from "zod";

const ENDPOINT = "https://api.featherless.ai/v1/chat/completions";
const models = () =>
  [process.env.FEATHERLESS_MODEL || "Qwen/Qwen3-30B-A3B-Instruct-2507", "deepseek-ai/DeepSeek-V3.1"].filter(
    (m, i, a) => a.indexOf(m) === i
  );

export const CATEGORIES = [
  "Bullying",
  "Extortion / financial demands",
  "Excessive duty hours",
  "Psychological abuse / intimidation",
  "Physical violence",
  "Sexual harassment",
  "Discrimination",
  "Other",
] as const;

const str = z.string().catch("");
const strList = z.array(z.string()).catch([]);

export const IntakeSchema = z.object({
  category: z.enum(CATEGORIES).catch("Other"),
  severity: z.enum(["low", "medium", "high", "urgent"]).catch("medium"),
  summary: str,
  what: str,
  when: str,
  where: str,
  who: str,
  evidence: strList,
  requestedOutcome: str,
  missingInfo: strList,
  immediateDanger: z.boolean().catch(false),
  quotes: z.record(z.string(), z.string()).catch({}),
});
export type Intake = z.infer<typeof IntakeSchema>;

export const QUOTED_FIELDS = ["what", "when", "where", "who", "requestedOutcome"] as const;
const norm = (s: string) => s.toLowerCase().replace(/[“”"'’`]/g, "").replace(/\s+/g, " ").trim();

/**
 * Source-quotation check: every structured field must be backed by a verbatim quote from the
 * reporter's own narrative. Fields whose quote is missing or not found are flagged for review.
 */
export function checkQuotes(intake: Intake, narrative: string) {
  const hay = norm(narrative);
  const out: Record<string, { quote: string; found: boolean }> = {};
  for (const f of QUOTED_FIELDS) {
    if (!intake[f]) continue;
    const quote = (intake.quotes?.[f] ?? "").trim();
    out[f] = { quote, found: quote.length >= 3 && hay.includes(norm(quote)) };
  }
  return out;
}

export const SummarySchema = z.object({
  anonymizedSummary: str,
  category: z.enum(CATEGORIES).catch("Other"),
  urgency: z.enum(["low", "medium", "high", "urgent"]).catch("medium"),
  keyFacts: strList,
  financialDemand: str,
  recommendedActions: strList,
  retaliationRisk: z.enum(["low", "medium", "high"]).catch("medium"),
  identifyingDetailsRemoved: strList,
});
export type Summary = z.infer<typeof SummarySchema>;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function chatJson<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, system: string, user: string): Promise<{ data: T; model: string; ms: number }> {
  const key = process.env.FEATHERLESS_API_KEY;
  if (!key) throw new Error("AI is not configured");
  let lastError = "No model answered";
  for (const model of models()) {
    const t0 = Date.now();
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!resp.ok) {
        lastError = `${model}: HTTP ${resp.status} ${(await resp.text()).slice(0, 160)}`;
        continue;
      }
      const json = await resp.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      const parsed = schema.safeParse(extractJson(content));
      if (!parsed.success) {
        lastError = `${model}: reply did not match schema`;
        continue;
      }
      return { data: parsed.data, model, ms: Date.now() - t0 };
    } catch (e) {
      lastError = `${model}: ${(e as Error).message}`;
    }
  }
  throw new Error(lastError);
}

export const INTAKE_SYSTEM = `You are SAKSI's intake assistant. A student or medical resident in Indonesia is reporting bullying, extortion, harassment or other misconduct at their campus or teaching hospital. They may write in Indonesian or English (or mixed). Turn their narrative into a structured, actionable case WITHOUT inventing facts.

Return ONLY a JSON object with these keys:
- "category": one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}
- "severity": "low" | "medium" | "high" | "urgent" (urgent = risk to life or ongoing physical danger)
- "summary": 2 neutral sentences in English describing what happened. Use roles ("a senior resident", "the program head"), never personal names.
- "what": what happened, concretely (actions, amounts of money with currency, frequency)
- "when": dates, periods or frequency as stated; "" if not stated
- "where": unit, ward, department or program as stated; "" if not stated
- "who": the roles involved (perpetrators, witnesses), never names
- "evidence": array of evidence the reporter mentions having (chats, transfer receipts, rosters, witnesses)
- "requestedOutcome": what the reporter wants to happen; "" if not stated
- "missingInfo": up to 3 short questions that would make this report actionable for an investigator, only for details that are genuinely missing
- "immediateDanger": true only if the text suggests risk of self-harm or ongoing physical danger
- "quotes": an object with keys "what", "when", "where", "who", "requestedOutcome". For each field you filled, give the shortest EXACT phrase (3-15 words, copied character for character from the narrative, in its original language) that supports it. Use "" for fields you left empty.

Never add facts that are not in the narrative.`;

export const SUMMARY_SYSTEM = `You assist an institutional anti-violence task force (Satgas PPKPT under Permendikbudristek 55/2024, or a hospital ethics committee) in Indonesia. You receive one decrypted report. Produce an anonymized triage summary so that case handlers can act without unnecessary exposure to the reporter's identity.

Return ONLY a JSON object with these keys:
- "anonymizedSummary": 3-4 sentences in English. Replace every personal name, phone number, student ID and other identifier with a role ("Resident A", "Senior 1", "the program coordinator").
- "category": one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}
- "urgency": "low" | "medium" | "high" | "urgent"
- "keyFacts": 3-6 short bullet strings with concrete, checkable facts (amounts, frequency, period, place)
- "financialDemand": total or periodic amounts demanded, with currency, or "" if none
- "recommendedActions": 3-5 concrete next steps for the task force (protect the reporter from retaliation first, preserve evidence, interview witnesses, refer to the ministry or police where the law requires)
- "retaliationRisk": "low" | "medium" | "high"
- "identifyingDetailsRemoved": list the KINDS of identifiers you removed (e.g. "2 personal names", "a phone number"), not the values

Do not invent facts.`;
