/**
 * Seeds the demo with FICTIONAL cases by driving the real pipeline end to end — nothing is hard-coded:
 *   reporter side: demo access code → Featherless AI intake → browser-equivalent sealing → /api/submit (relayer anchors)
 *   task-force side: real acknowledge / setStatus transactions signed by each task force's own wallet
 *   reporter escalation: after an institution's window passes, /api/escalate (contract enforces the time lock)
 *
 *   SEED_BASE_URL=http://localhost:3000 LOCAL=1 node --env-file=.env.local --env-file=.env.development.local scripts/seed.ts
 *   SEED_BASE_URL=https://<deployment> node --env-file=.env.local scripts/seed.ts
 *
 * Receipts (which contain report keys) are written to demo/receipts/ — gitignored.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, hexToBytes, bytesToHex, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sealReport, toB64, wrapKey } from "../src/lib/crypto.ts";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const LOCAL = !!process.env.LOCAL;
const rpc = LOCAL ? "http://127.0.0.1:8545" : process.env.RPC_URL || "https://sepolia.base.org";
const chain = defineChain({
  id: LOCAL ? 31337 : Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532),
  name: "seed",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const pub = createPublicClient({ chain, transport: http(rpc) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Plan = "ignore" | "ignore-escalate" | "ack" | "ack-investigate" | "ack-resolve" | "ack-refer";
const CASES: { inst: number; plan: Plan; narrative: string }[] = [
  {
    inst: 0,
    plan: "ignore",
    narrative:
      "Saya residen anestesi semester 2. Sejak Maret, senior semester 5 mewajibkan angkatan kami membayar Rp 15 juta per orang per bulan untuk 'iuran makan' dan kebutuhan pribadi mereka. Kalau telat bayar, kami dijadwalkan jaga 36 jam berturut-turut dan diancam tidak diluluskan ujian. Ada bukti transfer dan chat grup WhatsApp angkatan. Saya mau pungutan ini dihentikan dan jadwal jaga diperiksa.",
  },
  {
    inst: 0,
    plan: "ack-investigate",
    narrative:
      "Senior memaksa kami jaga tiga malam berturut-turut tanpa istirahat, lalu memarahi dan mempermalukan kami di depan pasien kalau ada yang tertidur. Ini terjadi di ICU sejak dua bulan terakhir. Rekan satu angkatan bisa jadi saksi dan saya punya foto jadwal jaga.",
  },
  {
    inst: 0,
    plan: "ignore-escalate",
    narrative:
      "Setiap hari saya disuruh membelikan makan siang dan kopi untuk 12 senior dengan uang saya sendiri, sekitar Rp 2 juta per minggu. Kalau menolak, saya tidak diberi kesempatan ikut operasi. Saya simpan semua struk dan pesan perintahnya.",
  },
  {
    inst: 1,
    plan: "ack-resolve",
    narrative:
      "A lecturer repeatedly mocked my regional accent in front of the whole class and lowered my practical grade, saying students 'from the regions' are slow. It happened in three sessions this semester. Classmates witnessed it and one recorded a voice note.",
  },
  {
    inst: 1,
    plan: "ack-refer",
    narrative:
      "Kakak tingkat memaksa angkatan baru ikut 'malam keakraban' di luar kampus dengan hukuman fisik push-up 200 kali dan berdiri semalaman. Dua teman saya pingsan. Ada video dari grup angkatan. Saya ingin kegiatan ini dihentikan.",
  },
  {
    inst: 1,
    plan: "ignore",
    narrative:
      "Senior collects a mandatory 'contribution' of Rp 500,000 from each junior for their wedding gifts and parties. Those who don't pay are excluded from the study group and exam materials. I have the bank transfer list shared in the group chat.",
  },
  {
    inst: 2,
    plan: "ack-investigate",
    narrative:
      "Residen jaga 40 jam tanpa tidur hampir setiap minggu, dan jadwal yang dilaporkan ke rumah sakit diubah supaya terlihat sesuai aturan maksimal jam kerja. Saya punya jadwal asli dan jadwal yang dilaporkan.",
  },
  {
    inst: 2,
    plan: "ack-resolve",
    narrative:
      "A consultant threw a patient chart at a junior resident and shouted insults during morning rounds last Tuesday. Several nurses witnessed it. I would like a formal warning and a safe way to report future incidents.",
  },
];

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error}`);
  return json as T;
}

async function main() {
  const state = await (await fetch(BASE + "/api/state")).json();
  if (!state.institutions?.length) throw new Error("No institutions registered — run scripts/deploy.ts first");
  const tfKeys = [process.env.TF1_PRIVATE_KEY, process.env.TF2_PRIVATE_KEY, process.env.TF3_PRIVATE_KEY] as Hex[];
  mkdirSync(new URL("../demo/receipts/", import.meta.url), { recursive: true });

  const made: { c: (typeof CASES)[number]; reportId: number; receipt: Record<string, unknown> }[] = [];
  for (const c of CASES) {
    const inst = state.institutions[c.inst];
    const { code } = await post<{ code: string }>("/api/demo-code", { institutionId: inst.id });
    let structured: Record<string, unknown>;
    let aiModel: string | undefined;
    try {
      const ai = await post<{ intake: Record<string, unknown>; model: string }>("/api/ai/intake", { narrative: c.narrative });
      const { missingInfo: _m, immediateDanger: _d, ...rest } = ai.intake;
      structured = rest;
      aiModel = ai.model;
    } catch {
      structured = { category: "Other", severity: "medium", summary: "", what: c.narrative, when: "", where: "", who: "", evidence: [], requestedOutcome: "" };
    }
    const payload = {
      v: 1,
      institutionId: inst.id,
      institutionName: inst.name,
      createdAt: new Date().toISOString(),
      narrative: c.narrative,
      structured,
      aiConsent: true,
      aiModel,
    };
    const sealed = await sealReport(payload);
    const wrappedTf = await wrapKey(sealed.key, hexToBytes(inst.encPubKey));
    const res = await post<{ reportId: number; txHash: Hex; submittedAt: number }>("/api/submit", {
      institutionId: inst.id,
      code,
      iv: toB64(sealed.iv),
      ciphertext: toB64(sealed.ciphertext),
      commitment: sealed.commitment,
      wrappedTf,
    });
    const receipt = {
      kind: "saksi-receipt",
      version: 1,
      chainId: state.chainId,
      registry: state.registry,
      reportId: res.reportId,
      txHash: res.txHash,
      submittedAt: res.submittedAt,
      institutionId: inst.id,
      institutionName: inst.name,
      commitment: sealed.commitment,
      salt: bytesToHex(sealed.salt),
      key: toB64(sealed.key),
    };
    writeFileSync(new URL(`../demo/receipts/report-${res.reportId}-${c.plan}.json`, import.meta.url), JSON.stringify(receipt, null, 2));
    made.push({ c, reportId: res.reportId, receipt });
    console.log(`#${res.reportId} anchored for ${inst.name.split(" — ")[0]} (${String(structured.category)}) — plan: ${c.plan}`);
  }

  const tfWallet = (i: number) => createWalletClient({ account: privateKeyToAccount(tfKeys[i]), chain, transport: http(rpc) });
  const abi = (await import("../src/lib/abi/SaksiRegistry.json", { with: { type: "json" } })).default.abi;
  const tx = async (i: number, functionName: string, args: unknown[]) => {
    const hash = await tfWallet(i).writeContract({ address: state.registry, abi, functionName, args });
    await pub.waitForTransactionReceipt({ hash });
    if (LOCAL) await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"evm_mine","params":[]}' });
  };

  console.log("…task forces respond after a realistic pause");
  await sleep(25_000);
  for (const m of made.filter((m) => m.c.plan.startsWith("ack"))) {
    await tx(m.c.inst, "acknowledge", [BigInt(m.reportId)]);
    console.log(`#${m.reportId} acknowledged by its task force`);
  }
  await sleep(20_000);
  for (const m of made) {
    const status = { "ack-investigate": 2, "ack-resolve": 3, "ack-refer": 4 }[m.c.plan as string];
    if (!status) continue;
    await tx(m.c.inst, "setStatus", [BigInt(m.reportId), status]);
    console.log(`#${m.reportId} → status ${["", "", "Investigating", "Resolved", "Referred"][status]}`);
  }

  const toEscalate = made.filter((m) => m.c.plan === "ignore-escalate");
  for (const m of toEscalate) {
    const inst = state.institutions[m.c.inst];
    const due = (m.receipt.submittedAt as number) + inst.ackWindow + 5;
    const wait = due * 1000 - Date.now();
    if (wait > 0) {
      console.log(`…waiting ${Math.ceil(wait / 1000)}s for #${m.reportId}'s window to close`);
      await sleep(wait);
    }
    if (LOCAL) await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"evm_mine","params":[]}' });
    const freshState = await (await fetch(BASE + "/api/state")).json();
    const wrappedMinistry = await wrapKey(Uint8Array.from(Buffer.from(m.receipt.key as string, "base64")), hexToBytes(freshState.ministryEncPubKey));
    await post("/api/escalate", { reportId: m.reportId, salt: m.receipt.salt, wrappedMinistry });
    console.log(`#${m.reportId} escalated to the ministry by its reporter`);
  }
  console.log("\nDone. Receipts in demo/receipts/ (contain report keys — keep private).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
