/**
 * Reporter-side escalation from a receipt file — the same steps the /verify page runs in the browser:
 * re-wrap the report key for the ministry's on-chain key, prove receipt ownership with the salt,
 * and ask the relayer to call escalate() (the contract enforces the deadline).
 *
 *   SEED_BASE_URL=https://saksi-compsphere.vercel.app node scripts/escalate.ts demo/receipts/report-2-ignore-escalate.json
 */
import { readFileSync } from "node:fs";
import { hexToBytes, type Hex } from "viem";
import { fromB64, wrapKey } from "../src/lib/crypto.ts";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const receipt = JSON.parse(readFileSync(process.argv[2], "utf8"));

const state = await (await fetch(BASE + "/api/state")).json();
const wrappedMinistry = await wrapKey(fromB64(receipt.key), hexToBytes(state.ministryEncPubKey as Hex));
const res = await fetch(BASE + "/api/escalate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reportId: receipt.reportId, salt: receipt.salt, wrappedMinistry }),
});
const body = await res.json();
console.log(res.ok ? `#${receipt.reportId} escalated (tx ${body.txHash})` : `#${receipt.reportId} not escalated: ${body.code ?? ""} ${body.error}`);
