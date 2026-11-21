import { hexToBytes, type Hex } from "viem";
import { computeCommitment, fromB64 } from "@/lib/crypto";
import { chainState, fail, handle, invalidateChainState, isHex32, ok } from "@/lib/server/http";
import { relay } from "@/lib/server/relayer";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reporter-initiated escalation. The reporter proves they hold the receipt by revealing the salt
 * (the server recomputes the on-chain commitment) and hands over the report key re-wrapped for the
 * ministry. The time lock is NOT checked here: the request goes to the contract, which enforces it
 * (an early attempt comes back as the contract's own NotOverdue revert).
 */
export const POST = handle(async (req) => {
  const { reportId, salt, wrappedMinistry } = await req.json();
  if (!Number.isInteger(reportId) || reportId < 0) return fail("reportId required");
  if (!isHex32(salt)) return fail("salt (from your receipt) required");
  if (!wrappedMinistry?.epk || !wrappedMinistry?.iv || !wrappedMinistry?.ct) return fail("wrapped key required");

  const state = await chainState(0);
  const report = state.reports[reportId];
  if (!report) return fail("No such report on-chain", 404);

  const [record] = await getStore().byReportIds([reportId]);
  if (!record) return fail("Sealed report not found in storage", 404);
  const recomputed = computeCommitment(fromB64(record.iv), fromB64(record.ciphertext), hexToBytes(salt as Hex));
  if (recomputed.toLowerCase() !== report.commitment.toLowerCase())
    return fail("This receipt does not open the on-chain commitment", 403);

  let txHash: string | null = null;
  if (!report.escalatedAt) {
    const res = await relay("escalate", [BigInt(reportId)]); // reverts NotOverdue / AlreadyAcknowledged
    txHash = res.hash;
  }
  // Only after the contract accepted the escalation does the ministry get a copy of the key —
  // and only once: a leaked receipt can't be used to overwrite it later.
  if (!record.wrapped_ministry) {
    await getStore().setWrappedMinistry(reportId, {
      epk: wrappedMinistry.epk,
      iv: wrappedMinistry.iv,
      ct: wrappedMinistry.ct,
    });
  }
  invalidateChainState();
  return ok({ txHash, alreadyEscalated: !!report.escalatedAt });
});
