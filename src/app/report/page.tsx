"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { bytesToHex, hexToBytes, type Hex } from "viem";
import { getState, post, verifyUrl, type Receipt, type ReportPayload } from "@/lib/client";
import type { ChainState } from "@/lib/chain";
import { sealReport, toB64, wrapKey } from "@/lib/crypto";
import { displayName, explorerTx } from "@/lib/config";
import { formatDuration } from "@/lib/metrics";
import { Check, ErrorNote, fmtTime, Hash, Spinner } from "@/components/ui";
import { buildReceiptPdf } from "@/lib/receiptPdf";
import { WaxSeal } from "@/components/brand";

const CATEGORIES = [
  "Bullying",
  "Extortion / financial demands",
  "Excessive duty hours",
  "Psychological abuse / intimidation",
  "Physical violence",
  "Sexual harassment",
  "Discrimination",
  "Other",
];
const SEVERITIES = ["low", "medium", "high", "urgent"];

const SAMPLE =
  "Saya residen anestesi semester 2. Sejak Maret, senior semester 5 mewajibkan angkatan kami membayar Rp 15 juta per orang per bulan untuk 'iuran makan' dan kebutuhan pribadi mereka. Kalau telat bayar, kami dijadwalkan jaga 36 jam berturut-turut dan diancam tidak diluluskan ujian. Ada bukti transfer dan chat grup WhatsApp angkatan. Teman saya sampai harus pinjam online. Saya mau pungutan ini dihentikan dan jadwal jaga diperiksa, tapi saya takut identitas saya ketahuan.";

type Structured = ReportPayload["structured"];
const EMPTY: Structured = {
  category: "Other",
  severity: "medium",
  summary: "",
  what: "",
  when: "",
  where: "",
  who: "",
  evidence: [],
  requestedOutcome: "",
};

type SealStep = { label: string; detail?: React.ReactNode; done: boolean };

export default function ReportPage() {
  const [state, setState] = useState<ChainState | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState<string | null>(null);

  const [institutionId, setInstitutionId] = useState<Hex | "">("");
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  const [narrative, setNarrative] = useState("");
  const [aiConsent, setAiConsent] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState<{ model: string; ms: number } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [danger, setDanger] = useState(false);
  const [structured, setStructured] = useState<Structured | null>(null);
  const [quoteChecks, setQuoteChecks] = useState<Record<string, { quote: string; found: boolean }>>({});

  const [sealing, setSealing] = useState<SealStep[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    getState()
      .then((s) => {
        setState(s);
        const active = s.institutions.filter((i) => i.active);
        if (active.length) setInstitutionId(active[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const inst = useMemo(() => state?.institutions.find((i) => i.id === institutionId), [state, institutionId]);

  async function demoCode() {
    if (!institutionId) return;
    setCodeBusy(true);
    setError(null);
    try {
      const { code } = await post<{ code: string }>("/api/demo-code", { institutionId });
      setCode(code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCodeBusy(false);
    }
  }

  async function runAi() {
    setAiBusy(true);
    setError(null);
    try {
      const res = await post<{
        intake: Structured & { missingInfo: string[]; immediateDanger: boolean; quotes?: Record<string, string> };
        quoteChecks: Record<string, { quote: string; found: boolean }>;
        model: string;
        ms: number;
      }>("/api/ai/intake", { narrative });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { missingInfo, immediateDanger, quotes, ...rest } = res.intake;
      setQuoteChecks(res.quoteChecks ?? {});
      setStructured({ ...EMPTY, ...rest });
      setMissing(missingInfo ?? []);
      setDanger(!!immediateDanger);
      setAiMeta({ model: res.model, ms: res.ms });
    } catch (e) {
      setError(`AI structuring is unavailable right now (${(e as Error).message}). You can fill the form yourself.`);
      setStructured((s) => s ?? { ...EMPTY });
    } finally {
      setAiBusy(false);
    }
  }

  async function seal() {
    if (!inst || !structured) return;
    setError(null);
    const steps: SealStep[] = [
      { label: "Encrypting in your browser (AES-256-GCM)", done: false },
      { label: "Computing the fingerprint that goes on-chain", done: false },
      { label: `Locking the key so only ${inst.name.split(" \u2014 ")[0]}'s task force can open it`, done: false },
      { label: "Anchoring on the public chain (gas paid by SAKSI)", done: false },
    ];
    const show = (i: number, detail?: React.ReactNode) => {
      steps[i] = { ...steps[i], done: true, detail };
      setSealing([...steps]);
    };
    setSealing([...steps]);
    try {
      const payload: ReportPayload = {
        v: 1,
        institutionId: inst.id,
        institutionName: inst.name,
        createdAt: new Date().toISOString(),
        narrative,
        structured,
        aiConsent,
        aiModel: aiMeta?.model,
      };
      const sealed = await sealReport(payload);
      show(0, `${sealed.ciphertext.length} bytes of ciphertext. This is all SAKSI's servers will ever see`);
      show(1, <Hash value={sealed.commitment} head={18} tail={10} />);
      const wrappedTf = await wrapKey(sealed.key, hexToBytes(inst.encPubKey));
      show(2, "X25519 key agreement → HKDF → AES-GCM key wrap");
      const res = await post<{ reportId: number; txHash: Hex; submittedAt: number }>("/api/submit", {
        institutionId: inst.id,
        code,
        iv: toB64(sealed.iv),
        ciphertext: toB64(sealed.ciphertext),
        commitment: sealed.commitment,
        wrappedTf,
      });
      show(3, (
        <a className="font-mono text-info underline" href={explorerTx(res.txHash)} target="_blank" rel="noreferrer">
          tx {res.txHash.slice(0, 14)}… ↗
        </a>
      ));
      const r: Receipt = {
        kind: "saksi-receipt",
        version: 1,
        chainId: state!.chainId,
        registry: state!.registry,
        reportId: res.reportId,
        txHash: res.txHash,
        submittedAt: res.submittedAt,
        institutionId: inst.id,
        institutionName: inst.name,
        commitment: sealed.commitment,
        salt: bytesToHex(sealed.salt),
        key: toB64(sealed.key),
      };
      setReceipt(r);
      const qrUrl = await QRCode.toDataURL(verifyUrl(window.location.origin, r.reportId, r.commitment), { margin: 1, width: 360 });
      setQr(qrUrl);
      downloadPdf(r, qrUrl);
      setTimeout(() => setStep(4), 600);
    } catch (e) {
      setError((e as Error).message);
      setSealing([]);
    }
  }

  function downloadPdf(r: Receipt, qrUrl: string) {
    const deadline = inst ? fmtTime(r.submittedAt + inst.ackWindow) : "n/a";
    buildReceiptPdf(r, qrUrl, verifyUrl(window.location.origin, r.reportId, r.commitment), deadline).save(`saksi-receipt-${r.reportId}.pdf`);
  }

  function downloadJson(r: Receipt) {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `saksi-receipt-${r.reportId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openVerifier() {
    if (!receipt) return;
    sessionStorage.setItem("saksi.receipt", JSON.stringify(receipt));
    window.location.href = "/verify";
  }

  const activeInstitutions = state?.institutions.filter((i) => i.active) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {step < 4 && (
        <>
          <p className="label mb-2">File a sealed report</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Say what happened. Keep the proof.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            No account, no wallet, no name. Your report is encrypted on this device before it leaves it. You walk away with a receipt
            that proves it existed, and when, without anyone&apos;s cooperation.
          </p>
          <ol className="no-print mt-8 mb-6 flex gap-2 text-xs font-semibold">
            {["Where", "What happened", "Seal"].map((l, i) => (
              <li
                key={l}
                className={`flex-1 rounded-full px-3 py-1.5 text-center ${
                  step === i + 1 ? "bg-ink text-white" : step > i + 1 ? "bg-ok-soft text-ok" : "bg-black/5 text-muted"
                }`}
              >
                {i + 1}. {l}
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="space-y-4">
        <ErrorNote error={error} />

        {step === 1 && (
          <section className="rise card space-y-5 p-5 sm:p-6">
            <div>
              <label className="label" htmlFor="inst">
                Institution
              </label>
              {!state ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Reading registered institutions from the chain…
                </p>
              ) : (
                <select id="inst" className="field mt-2" value={institutionId} onChange={(e) => setInstitutionId(e.target.value as Hex)}>
                  {activeInstitutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {displayName(i.name)}
                    </option>
                  ))}
                </select>
              )}
              {inst && (
                <p className="mt-2 text-xs text-muted">
                  Its task force must acknowledge within <strong className="text-ink">{formatDuration(inst.ackWindow)}</strong>, enforced
                  by the contract. After that, you can escalate to the ministry yourself.
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="code">
                One-time access code
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="code"
                  className="field font-mono uppercase tracking-wider"
                  placeholder="SAKSI-XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                />
                <button type="button" className="btn-ghost shrink-0" onClick={demoCode} disabled={!institutionId || codeBusy}>
                  {codeBusy ? <Spinner /> : null} Get a demo code
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Codes are handed out in bulk to every student or resident. They prove &ldquo;I belong to this institution&rdquo;, not
                who you are. Each works once.
              </p>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={!institutionId || code.trim().length < 6} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="rise card space-y-5 p-5 sm:p-6">
            <div>
              <div className="flex items-end justify-between gap-2">
                <label className="label" htmlFor="narr">
                  In your own words (Bahasa Indonesia or English)
                </label>
                <button type="button" className="text-xs font-semibold text-info hover:underline" onClick={() => setNarrative(SAMPLE)}>
                  Use a sample story
                </button>
              </div>
              <textarea
                id="narr"
                className="field mt-2 min-h-44 leading-relaxed"
                placeholder="What happened, when, where, who was involved (roles are enough), and what you'd like to happen."
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg bg-info-soft/60 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
              <span>
                <strong>Let an open-weight AI model structure my report</strong>
                <span className="block text-muted">
                  Runs on Featherless.ai. The text is processed, not stored. Your choice is sealed into the report, so the task force can
                  only use AI summaries if you said yes.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!aiConsent || narrative.trim().length < 20 || aiBusy} onClick={runAi}>
                {aiBusy ? (
                  <>
                    <Spinner /> Structuring…
                  </>
                ) : structured ? (
                  "Re-run AI structuring"
                ) : (
                  "Structure with AI"
                )}
              </button>
              {!structured && (
                <button className="btn-ghost" onClick={() => setStructured({ ...EMPTY })} disabled={narrative.trim().length < 20}>
                  Fill the details myself
                </button>
              )}
            </div>

            {danger && (
              <p className="rounded-lg border border-seal/40 bg-seal-soft p-3 text-sm text-seal-dark">
                If you or someone else is in immediate danger, call <strong>112</strong> now. SAKSI is a record, not an emergency service.
              </p>
            )}

            {structured && (
              <div className="rise space-y-4 border-t border-line pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="label">Structured case · review and edit anything</p>
                  {aiMeta && (
                    <span className="font-mono text-[11px] text-muted">
                      {aiMeta.model} · {(aiMeta.ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category">
                    <select className="field" value={structured.category} onChange={(e) => setStructured({ ...structured, category: e.target.value })}>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Severity">
                    <select className="field" value={structured.severity} onChange={(e) => setStructured({ ...structured, severity: e.target.value })}>
                      {SEVERITIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Summary (roles, not names)">
                  <textarea className="field min-h-20" value={structured.summary} onChange={(e) => setStructured({ ...structured, summary: e.target.value })} />
                </Field>
                <Field label="What happened" check={quoteChecks.what}>
                  <textarea className="field min-h-16" value={structured.what} onChange={(e) => setStructured({ ...structured, what: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="When" check={quoteChecks.when}>
                    <input className="field" value={structured.when} onChange={(e) => setStructured({ ...structured, when: e.target.value })} />
                  </Field>
                  <Field label="Where" check={quoteChecks.where}>
                    <input className="field" value={structured.where} onChange={(e) => setStructured({ ...structured, where: e.target.value })} />
                  </Field>
                  <Field label="Who (roles)" check={quoteChecks.who}>
                    <input className="field" value={structured.who} onChange={(e) => setStructured({ ...structured, who: e.target.value })} />
                  </Field>
                </div>
                <Field label="Evidence you have (one per line)">
                  <textarea
                    className="field min-h-16"
                    value={structured.evidence.join("\n")}
                    onChange={(e) => setStructured({ ...structured, evidence: e.target.value.split("\n") })}
                  />
                </Field>
                <Field label="What you want to happen" check={quoteChecks.requestedOutcome}>
                  <input
                    className="field"
                    value={structured.requestedOutcome}
                    onChange={(e) => setStructured({ ...structured, requestedOutcome: e.target.value })}
                  />
                </Field>
                {missing.length > 0 && (
                  <div className="rounded-lg bg-warn-soft p-3 text-sm">
                    <p className="font-semibold text-warn">An investigator will probably ask:</p>
                    <ul className="mt-1 list-disc pl-5 text-ink-2">
                      {missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted">Add anything you can to your story above, or leave it. It&apos;s your call.</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <button className="btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn-primary" disabled={!structured} onClick={() => setStep(3)}>
                Review &amp; seal
              </button>
            </div>
          </section>
        )}

        {step === 3 && inst && structured && (
          <section className="rise card space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Fact k="Goes to" v={displayName(inst.name)} />
              <Fact k="Category" v={`${structured.category} · ${structured.severity}`} />
              <Fact k="Must be acknowledged within" v={formatDuration(inst.ackWindow)} />
            </div>
            <ul className="space-y-2 text-sm text-ink-2">
              <li>• Your words are encrypted here, in this browser. SAKSI&apos;s servers only ever store ciphertext.</li>
              <li>• Only a fingerprint (a hash) and a timestamp go on the public chain. Never content, never your identity.</li>
              <li>• Only this institution&apos;s task force can decrypt it. If they ignore it, you can hand it to the ministry.</li>
            </ul>
            {sealing.length > 0 && (
              <ol className="space-y-3 rounded-xl bg-paper p-4">
                {sealing.map((s, i) => {
                  const running = !s.done && (i === 0 || sealing[i - 1].done);
                  return (
                    <li key={s.label} className="rise flex gap-3 text-sm">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          s.done ? "bg-ok text-white" : running ? "text-ink" : "text-line"
                        }`}
                      >
                        {s.done ? <Check className="h-3.5 w-3.5" /> : running ? <Spinner /> : "•"}
                      </span>
                      <span>
                        <span className={s.done || running ? "font-medium" : "text-muted"}>{s.label}</span>
                        {s.detail && <span className="mt-0.5 block text-xs text-muted">{s.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="flex justify-between">
              <button className="btn-ghost" onClick={() => setStep(2)} disabled={sealing.length > 0}>
                Back
              </button>
              <button className="btn-seal" onClick={seal} disabled={sealing.length > 0}>
                {sealing.length > 0 ? <Spinner /> : null} Seal &amp; anchor report
              </button>
            </div>
          </section>
        )}

        {step === 4 && receipt && (
          <section className="rise space-y-6">
            <div className="print-card card relative overflow-hidden p-6 sm:p-8">
              <div className="stamp pointer-events-none absolute right-6 top-4 hidden w-32 sm:block">
                <WaxSeal priority className="h-auto w-full" />
              </div>
              <p className="label">Sealed Receipt · SAKSI</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Report #{receipt.reportId}</h1>
              <p className="mt-1 text-muted">{displayName(receipt.institutionName)}</p>
              <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto]">
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <Fact k="Anchored at (block time)" v={fmtTime(receipt.submittedAt)} />
                  <Fact k="Acknowledge by" v={inst ? fmtTime(receipt.submittedAt + inst.ackWindow) : "n/a"} />
                  <Fact k="Fingerprint (on-chain)" v={<Hash value={receipt.commitment} head={14} tail={8} />} />
                  <Fact
                    k="Transaction"
                    v={
                      <a className="font-mono text-[12.5px] text-info underline" href={explorerTx(receipt.txHash)} target="_blank" rel="noreferrer">
                        {receipt.txHash.slice(0, 16)}… ↗
                      </a>
                    }
                  />
                </dl>
                {qr && (
                  <figure className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR code linking to the public verification page" className="mx-auto h-40 w-40 rounded-lg border border-line" />
                    <figcaption className="mt-1 text-[11px] text-muted">Scan to verify. Reveals nothing.</figcaption>
                  </figure>
                )}
              </div>
              <p className="mt-6 rounded-lg bg-warn-soft p-3 text-sm text-ink-2">
                <strong>Your Sealed Receipt (PDF) just downloaded.</strong> It holds the only reporter copy of your report&apos;s key. With it you can
                check status, prove the report existed, show its contents to anyone you choose, and escalate if it&apos;s ignored. SAKSI
                cannot recover it for you.
              </p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button className="btn-primary" onClick={openVerifier}>
                Track &amp; verify this report
              </button>
              <button className="btn-ghost" onClick={() => downloadPdf(receipt, qr)}>
                Download receipt PDF again
              </button>
              <button className="btn-ghost" onClick={() => downloadJson(receipt)}>
                Also save as .json
              </button>
              <Link className="btn-ghost" href="/ledger">
                See the public ledger
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  check,
}: {
  label: string;
  children: React.ReactNode;
  check?: { quote: string; found: boolean };
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="label">{label}</span>
        {check &&
          (check.found ? (
            <span className="text-[11px] text-ok" title="The AI quoted this from your own words">
              ✓ from your words: &ldquo;{check.quote.length > 48 ? check.quote.slice(0, 48) + "…" : check.quote}&rdquo;
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-warn">⚠ not found in your text, please check</span>
          ))}
      </span>
      {children}
    </label>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="label mb-1">{k}</dt>
      <dd className="text-[14px] text-ink">{v}</dd>
    </div>
  );
}
