"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hexToBytes, type Hex } from "viem";
import {
  ApiError,
  getRecords,
  getState,
  parseReceipt,
  post,
  type Receipt,
  type ReportPayload,
  type StoredRecord,
} from "@/lib/client";
import type { ChainState } from "@/lib/chain";
import { computeCommitment, fromB64, openReport, wrapKey } from "@/lib/crypto";
import { explorerAddress, explorerTx } from "@/lib/config";
import { formatDuration, isOverdue } from "@/lib/metrics";
import { Check, Countdown, ErrorNote, fmtTime, Hash, SectionTitle, Spinner, StatusPill, useNow } from "@/components/ui";
import { receiptFromPdfText } from "@/lib/receiptPdf";

type CheckState = "pending" | "pass" | "fail";

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const params = useSearchParams();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [publicId, setPublicId] = useState<{ id: number; c: Hex } | null>(null);
  const [paste, setPaste] = useState("");
  const [state, setState] = useState<ChainState | null>(null);
  const [offset, setOffset] = useState(0);
  const [record, setRecord] = useState<StoredRecord | null>(null);
  const [plain, setPlain] = useState<ReportPayload | null>(null);
  const [decryptOk, setDecryptOk] = useState<CheckState>("pending");
  const [tamper, setTamper] = useState<{ fingerprint: Hex; decrypts: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [escalation, setEscalation] = useState<{ ok: boolean; text: string; tx?: string | null } | null>(null);
  const now = useNow(offset);

  // Receipt handed over from the report page (same tab only), or a public QR link.
  useEffect(() => {
    const stored = sessionStorage.getItem("saksi.receipt");
    if (stored) {
      try {
        setReceipt(parseReceipt(stored));
      } catch {
        /* ignore */
      }
    } else if (params.get("id") && params.get("c")) {
      setPublicId({ id: Number(params.get("id")), c: params.get("c") as Hex });
    }
  }, [params]);

  const reportId = receipt?.reportId ?? publicId?.id ?? null;

  const refresh = useCallback(async () => {
    try {
      const s = await getState();
      setState(s);
      setOffset(0); // UI clocks use this device's time; the contract enforces deadlines with block.timestamp
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (reportId == null) return;
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [reportId, refresh]);

  // Fetch the stored ciphertext and, with a receipt, open it.
  useEffect(() => {
    if (!receipt) return;
    getRecords([receipt.reportId])
      .then(async ([r]) => {
        setRecord(r ?? null);
        if (!r) return;
        try {
          setPlain(await openReport<ReportPayload>(fromB64(receipt.key), fromB64(r.iv), fromB64(r.ciphertext)));
          setDecryptOk("pass");
        } catch {
          setDecryptOk("fail");
        }
      })
      .catch((e) => setError(e.message));
  }, [receipt]);

  const onchain = reportId != null ? state?.reports[reportId] : undefined;
  const inst = state?.institutions.find((i) => i.id === onchain?.institutionId);
  const expected = (receipt?.commitment ?? publicId?.c)?.toLowerCase();
  const fingerprintMatch: CheckState = !onchain ? "pending" : onchain.commitment.toLowerCase() === expected ? "pass" : "fail";
  const storedOpens: CheckState = useMemo(() => {
    if (!receipt || !record) return "pending";
    const h = computeCommitment(fromB64(record.iv), fromB64(record.ciphertext), hexToBytes(receipt.salt));
    return h.toLowerCase() === receipt.commitment.toLowerCase() ? "pass" : "fail";
  }, [receipt, record]);

  async function runTamper() {
    if (!receipt || !record) return;
    const ct = fromB64(record.ciphertext);
    ct[Math.floor(ct.length / 2)] ^= 0x01; // flip one bit of one byte
    const fingerprint = computeCommitment(fromB64(record.iv), ct, hexToBytes(receipt.salt));
    let decrypts = true;
    try {
      await openReport(fromB64(receipt.key), fromB64(record.iv), ct);
    } catch {
      decrypts = false;
    }
    setTamper({ fingerprint, decrypts });
  }

  async function escalate() {
    if (!receipt || !state) return;
    setEscalating(true);
    setEscalation(null);
    try {
      const wrappedMinistry = await wrapKey(fromB64(receipt.key), hexToBytes(state.ministryEncPubKey));
      const res = await post<{ txHash: string | null }>("/api/escalate", {
        reportId: receipt.reportId,
        salt: receipt.salt,
        wrappedMinistry,
      });
      setEscalation({ ok: true, text: "Escalated. The ministry can now decrypt this report — and the institution's missed deadline is public.", tx: res.txHash });
      refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      setEscalation({
        ok: false,
        text: code ? `Rejected by the smart contract: ${code}() — ${(e as Error).message}` : (e as Error).message,
      });
    } finally {
      setEscalating(false);
    }
  }

  function loadPasted(text: string) {
    try {
      const r = parseReceipt(text);
      sessionStorage.setItem("saksi.receipt", JSON.stringify(r));
      setReceipt(r);
      setPublicId(null);
      setError(null);
      setPlain(null);
      setTamper(null);
      setEscalation(null);
      setDecryptOk("pending");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function forget() {
    sessionStorage.removeItem("saksi.receipt");
    setReceipt(null);
    setRecord(null);
    setPlain(null);
    setTamper(null);
    setEscalation(null);
  }

  if (reportId == null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SectionTitle kicker="Verify a report" title="Check any report against the chain">
          Load a Sealed Receipt to see its status, prove it existed, open it, and escalate it if it&apos;s ignored. The check runs in
          your browser against public chain data — it doesn&apos;t depend on the institution, or on trusting SAKSI.
        </SectionTitle>
        <div className="card space-y-4 p-5 sm:p-6">
          <label className="btn-primary cursor-pointer">
            Open Sealed Receipt (PDF or .json)
            <input
              type="file"
              accept="application/pdf,.pdf,application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.name.toLowerCase().endsWith(".pdf")) {
                  const bytes = new Uint8Array(await f.arrayBuffer());
                  let latin1 = "";
                  for (let i = 0; i < bytes.length; i++) latin1 += String.fromCharCode(bytes[i]);
                  const json = receiptFromPdfText(latin1);
                  if (!json) return setError("This PDF is not a SAKSI Sealed Receipt.");
                  loadPasted(json);
                } else loadPasted(await f.text());
              }}
            />
          </label>
          <p className="text-center text-xs text-muted">or paste its contents</p>
          <textarea className="field min-h-32 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"kind":"saksi-receipt", …}' />
          <button className="btn-ghost w-full" disabled={!paste.trim()} onClick={() => loadPasted(paste)}>
            Verify pasted receipt
          </button>
          <ErrorNote error={error} />
        </div>
      </div>
    );
  }

  const windowEnd = onchain && inst ? onchain.submittedAt + inst.ackWindow : 0;
  const overdue = !!onchain && isOverdue(onchain, inst, now);
  const canEscalate = !!receipt && !!onchain && onchain.acknowledgedAt === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label mb-2">{receipt ? "Your report" : "Public verification"}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Report #{reportId}</h1>
          <p className="mt-1 text-muted">{inst?.name ?? receipt?.institutionName ?? "…"}</p>
        </div>
        {onchain && <StatusPill status={onchain.status} overdue={overdue} escalated={onchain.escalatedAt > 0} />}
      </div>
      <ErrorNote error={error} />

      {!state ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Reading the registry…
        </p>
      ) : !onchain ? (
        <p className="card p-5 text-sm">No report #{reportId} exists on this registry.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="card p-5 sm:p-6">
            <p className="label mb-4">On-chain timeline</p>
            <ol className="relative space-y-5 border-l border-line pl-5">
              <TimelineItem done title="Anchored" when={fmtTime(onchain.submittedAt)}>
                Fingerprint <Hash value={onchain.commitment} head={12} tail={6} />
              </TimelineItem>
              <TimelineItem
                done={onchain.acknowledgedAt > 0}
                late={onchain.acknowledgedAt > 0 && onchain.acknowledgedAt > windowEnd}
                alert={overdue}
                title={
                  onchain.acknowledgedAt
                    ? `Acknowledged after ${formatDuration(onchain.acknowledgedAt - onchain.submittedAt)}${onchain.acknowledgedAt > windowEnd ? " — late" : ""}`
                    : overdue
                    ? "Not acknowledged — deadline missed"
                    : "Waiting for the task force to acknowledge"
                }
                when={onchain.acknowledgedAt ? fmtTime(onchain.acknowledgedAt) : `Deadline ${fmtTime(windowEnd)}`}
              >
                {!onchain.acknowledgedAt && <Countdown until={windowEnd} now={now} />}
                {inst && <span className="ml-2 text-muted">(window: {formatDuration(inst.ackWindow)})</span>}
              </TimelineItem>
              {onchain.status >= 2 && (
                <TimelineItem
                  done
                  title={["", "", "Investigating", "Resolved", "Referred to authorities"][onchain.status]}
                  when={onchain.resolvedAt ? `${fmtTime(onchain.resolvedAt)} · ${formatDuration(onchain.resolvedAt - onchain.submittedAt)} after report` : "in progress"}
                />
              )}
              {onchain.escalatedAt > 0 && (
                <TimelineItem done alert title="Escalated to the ministry" when={fmtTime(onchain.escalatedAt)} />
              )}
            </ol>
            <p className="mt-6 text-xs text-muted">
              Don&apos;t trust this page? Call <code className="font-mono">getReport({reportId})</code> on the{" "}
              <a className="underline" href={explorerAddress(state.registry)} target="_blank" rel="noreferrer">
                registry contract ↗
              </a>{" "}
              yourself.
              {receipt && (
                <>
                  {" "}
                  Anchoring tx:{" "}
                  <a className="font-mono underline" href={explorerTx(receipt.txHash)} target="_blank" rel="noreferrer">
                    {receipt.txHash.slice(0, 12)}… ↗
                  </a>
                </>
              )}
            </p>
          </section>

          <section className="space-y-4">
            <div className="card p-5 sm:p-6">
              <p className="label mb-3">Checks</p>
              <ul className="space-y-3 text-sm">
                <CheckRow s={fingerprintMatch} label={receipt ? "Receipt fingerprint matches the chain" : "QR fingerprint matches the chain"} />
                {receipt && (
                  <>
                    <CheckRow s={storedOpens} label="Stored ciphertext + your salt recompute the on-chain fingerprint" />
                    <CheckRow s={decryptOk} label="Your key decrypts it (AES-GCM authenticated)" />
                  </>
                )}
              </ul>
              {receipt && record && (
                <div className="mt-4 border-t border-line pt-4">
                  <button className="btn-ghost w-full" onClick={runTamper}>
                    Tamper test: change one byte of a copy
                  </button>
                  {tamper && (
                    <ul className="mt-3 space-y-2 text-sm">
                      <CheckRow s="fail" label={<>Fingerprint becomes <Hash value={tamper.fingerprint} head={10} tail={6} /> — no longer matches</>} />
                      <CheckRow s={tamper.decrypts ? "pass" : "fail"} label={tamper.decrypts ? "Still decrypts (unexpected)" : "Decryption refuses the altered bytes"} />
                    </ul>
                  )}
                </div>
              )}
            </div>

            {receipt && (
              <div className={`card p-5 sm:p-6 ${overdue && !onchain.escalatedAt ? "border-seal/50 ring-2 ring-seal/15" : ""}`}>
                <p className="label mb-2">Escalate to the ministry</p>
                {onchain.escalatedAt > 0 ? (
                  <p className="text-sm text-ink-2">Escalated on {fmtTime(onchain.escalatedAt)}. The ministry holds a copy of the key.</p>
                ) : onchain.acknowledgedAt > 0 ? (
                  <p className="text-sm text-muted">The task force acknowledged this report, so escalation isn&apos;t available.</p>
                ) : (
                  <>
                    <p className="text-sm text-ink-2">
                      {overdue
                        ? "The task force missed its deadline. You can now hand this report to the supervising ministry — the contract allows it and nobody can stop it."
                        : `Available once the deadline passes (${fmtTime(windowEnd)}). The contract enforces this, not SAKSI.`}
                    </p>
                    <button className={`${overdue ? "btn-seal" : "btn-ghost"} mt-3 w-full`} onClick={escalate} disabled={!canEscalate || escalating}>
                      {escalating ? <Spinner /> : null} {overdue ? "Escalate to the ministry" : "Try to escalate now"}
                    </button>
                  </>
                )}
                {escalation && (
                  <p className={`mt-3 rounded-lg p-3 text-sm ${escalation.ok ? "bg-ok-soft text-ok" : "bg-seal-soft text-seal-dark"}`}>
                    {escalation.text}
                    {escalation.tx && (
                      <a className="ml-1 font-mono underline" href={explorerTx(escalation.tx)} target="_blank" rel="noreferrer">
                        tx ↗
                      </a>
                    )}
                  </p>
                )}
              </div>
            )}
          </section>

          {plain && (
            <section className="card p-5 sm:p-6 lg:col-span-2">
              <div className="flex items-center justify-between">
                <p className="label">Decrypted in this browser — only you see this</p>
                <span className="text-xs text-muted">{plain.structured.category} · {plain.structured.severity}</span>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{plain.structured.summary || plain.narrative}</p>
              <details className="mt-3 text-sm text-ink-2">
                <summary className="cursor-pointer text-muted">Original words</summary>
                <p className="mt-2 whitespace-pre-wrap">{plain.narrative}</p>
              </details>
            </section>
          )}
        </div>
      )}

      {receipt && (
        <button className="mt-8 text-xs text-muted underline" onClick={forget}>
          Forget this receipt on this device
        </button>
      )}
    </div>
  );
}

function CheckRow({ s, label }: { s: CheckState; label: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          s === "pass" ? "bg-ok text-white" : s === "fail" ? "bg-seal text-white" : "bg-black/5 text-muted"
        }`}
      >
        {s === "pass" ? <Check className="h-3.5 w-3.5" /> : s === "fail" ? "✕" : <Spinner className="h-3 w-3" />}
      </span>
      <span className="text-ink-2">{label}</span>
    </li>
  );
}

function TimelineItem({
  done,
  late,
  alert,
  title,
  when,
  children,
}: {
  done?: boolean;
  late?: boolean;
  alert?: boolean;
  title: string;
  when: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-card ${
          alert ? "bg-seal" : late ? "bg-warn" : done ? "bg-ok" : "bg-line"
        }`}
      />
      <p className={`text-sm font-semibold ${alert ? "text-seal" : "text-ink"}`}>{title}</p>
      <p className="text-xs text-muted">{when}</p>
      {children && <div className="mt-1 text-xs">{children}</div>}
    </li>
  );
}
