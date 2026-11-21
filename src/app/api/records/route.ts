import { fail, handle, ok } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * Ciphertext + wrapped keys for the given on-chain report ids. Safe to serve: without the task
 * force's (or ministry's) wallet-derived key, or the reporter's receipt, it is unreadable.
 */
export const GET = handle(async (req) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .slice(0, 200);
  if (!ids.length) return fail("ids required");
  const records = await getStore().byReportIds(ids);
  return ok({
    records: records.map((r) => ({
      reportId: r.report_id,
      commitment: r.commitment,
      iv: r.iv,
      ciphertext: r.ciphertext,
      wrappedTf: r.wrapped_tf,
      wrappedMinistry: r.wrapped_ministry,
      txHash: r.tx_hash,
    })),
  });
});
