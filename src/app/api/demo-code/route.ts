import { randomInt } from "node:crypto";
import { codeHash, fail, handle, isHex32, ok } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/**
 * Demo only: issues one fresh one-time access code. In production the institution issues codes
 * in bulk (e.g. printed with enrolment packs); only their hashes are stored, never who got which.
 */
export const POST = handle(async (req) => {
  if (process.env.DEMO_MODE === "off") return fail("Demo codes are disabled", 403);
  const { institutionId } = await req.json();
  if (!isHex32(institutionId)) return fail("institutionId must be bytes32 hex");
  const pick = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const code = `SAKSI-${pick(4)}-${pick(4)}`;
  await getStore().addCode(codeHash(code), institutionId.toLowerCase());
  return ok({ code });
});
