import { decodeEventLog, type Hex } from "viem";
import { registryAbi } from "@/lib/chain";
import { chainState, codeHash, fail, handle, invalidateChainState, isHex32, ok } from "@/lib/server/http";
import { relay } from "@/lib/server/relayer";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CIPHERTEXT_B64 = 200_000;

/**
 * Receives an already-sealed report: ciphertext, iv, the commitment and the report key wrapped for
 * the task force. The server never sees plaintext, the report key or the salt.
 */
export const POST = handle(async (req) => {
  const body = await req.json();
  const { institutionId, code, iv, ciphertext, commitment, wrappedTf } = body ?? {};
  if (!isHex32(institutionId) || !isHex32(commitment)) return fail("institutionId and commitment must be bytes32 hex");
  if (typeof code !== "string" || code.length < 6) return fail("An access code is required");
  if (typeof iv !== "string" || typeof ciphertext !== "string" || ciphertext.length > MAX_CIPHERTEXT_B64)
    return fail("Malformed ciphertext");
  if (!wrappedTf?.epk || !wrappedTf?.iv || !wrappedTf?.ct) return fail("Missing wrapped key");

  const state = await chainState();
  const inst = state.institutions.find((i) => i.id.toLowerCase() === institutionId.toLowerCase());
  if (!inst || !inst.active) return fail("This institution is not registered on SAKSI");

  const store = getStore();
  const h = codeHash(code);
  if (!(await store.useCode(h, institutionId.toLowerCase())))
    return fail("That access code is invalid, already used, or belongs to another institution", 403);

  try {
    await store.insertPending({
      commitment: commitment.toLowerCase(),
      institution_id: institutionId.toLowerCase(),
      iv,
      ciphertext,
      wrapped_tf: { epk: wrappedTf.epk, iv: wrappedTf.iv, ct: wrappedTf.ct },
    });
  } catch (e) {
    await store.releaseCode(h);
    throw e;
  }

  let result;
  try {
    result = await relay("submitReport", [institutionId as Hex, commitment as Hex]);
  } catch (e) {
    await store.remove(commitment.toLowerCase());
    await store.releaseCode(h);
    throw e;
  }

  let reportId: number | null = null;
  let submittedAt = 0;
  for (const log of result.receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "ReportSubmitted") {
        const args = ev.args as unknown as { reportId: bigint; submittedAt: number };
        reportId = Number(args.reportId);
        submittedAt = Number(args.submittedAt);
      }
    } catch {
      /* other contract's log */
    }
  }
  if (reportId == null) throw new Error("Anchored, but the ReportSubmitted event was not found");
  await store.confirm(commitment.toLowerCase(), reportId, result.hash);
  invalidateChainState();

  return ok({
    reportId,
    txHash: result.hash,
    blockNumber: result.receipt.blockNumber.toString(),
    submittedAt,
    institutionName: inst.name,
    ackWindow: inst.ackWindow,
  });
});
