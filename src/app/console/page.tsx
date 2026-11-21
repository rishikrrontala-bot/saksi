"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { getRecords, getState, post, type ReportPayload, type StoredRecord } from "@/lib/client";
import type { ChainInstitution, ChainReport, ChainState } from "@/lib/chain";
import { encKeyFromSignature, fromB64, KEY_DERIVATION_MESSAGE, openReport, unwrapKey, type EncKeyPair } from "@/lib/crypto";
import { explorerTx } from "@/lib/config";
import { formatDuration, isOverdue } from "@/lib/metrics";
import { injectedSigner, localSigner, type ConsoleSigner } from "@/lib/signer";
import { Check, Countdown, ErrorNote, fmtTime, Hash, Pill, SectionTitle, Spinner, StatusPill, useNow } from "@/components/ui";

const KEY_STORAGE = "saksi.console.key";

interface Summary {
  anonymizedSummary: string;
  category: string;
  urgency: string;
  keyFacts: string[];
  financialDemand: string;
  recommendedActions: string[];
  retaliationRisk: string;
  identifyingDetailsRemoved: string[];
}

type Opened = { payload?: ReportPayload; error?: string };

export default function ConsolePage() {
  const [signer, setSigner] = useState<ConsoleSigner | null>(null);
  const [encKey, setEncKey] = useState<EncKeyPair | null>(null);
  const [state, setState] = useState<ChainState | null>(null);
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<Record<number, StoredRecord>>({});
  const [opened, setOpened] = useState<Record<number, Opened>>({});
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [remember, setRemember] = useState(true);
  const now = useNow(offset);

  const refresh = useCallback(async () => {
    try {
      const s = await getState();
      setState(s);
      setOffset(s.now - Math.floor(Date.now() / 1000));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  const signIn = useCallback(async (make: () => Promise<ConsoleSigner>) => {
    setSigningIn(true);
    setError(null);
    try {
      const s = await make();
      // Free, off-chain signature: derives this wallet's X25519 decryption key.
      const sig = await s.signMessage(KEY_DERIVATION_MESSAGE);
      setEncKey(encKeyFromSignature(sig));
      setSigner(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSigningIn(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORAGE);
    if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved)) signIn(async () => localSigner(saved as Hex));
  }, [signIn]);

  const addr = signer?.address.toLowerCase();
  const myInstitutions = useMemo(() => state?.institutions.filter((i) => i.taskForce.toLowerCase() === addr) ?? [], [state, addr]);
  const isMinistry = !!state && !!addr && state.registrar.toLowerCase() === addr;

  const visibleReports = useMemo(() => {
    if (!state) return [];
    if (isMinistry) return state.reports.filter((r) => r.escalatedAt > 0);
    const ids = new Set(myInstitutions.map((i) => i.id));
    return state.reports.filter((r) => ids.has(r.institutionId));
  }, [state, isMinistry, myInstitutions]);

  // Fetch ciphertext for visible reports and decrypt it locally.
  useEffect(() => {
    if (!encKey || !visibleReports.length) return;
    const missing = visibleReports.map((r) => r.id).filter((id) => !records[id] || (isMinistry && !records[id].wrappedMinistry));
    if (!missing.length) return;
    getRecords(missing)
      .then(async (recs) => {
        const nextRecords = { ...records };
        const nextOpened: Record<number, Opened> = {};
        for (const rec of recs) {
          nextRecords[rec.reportId] = rec;
          const wrapped = isMinistry ? rec.wrappedMinistry : rec.wrappedTf;
          if (!wrapped) {
            nextOpened[rec.reportId] = { error: "Escalated on-chain, but the reporter has not handed over a key." };
            continue;
          }
          try {
            const key = await unwrapKey(wrapped, encKey.priv);
            nextOpened[rec.reportId] = { payload: await openReport<ReportPayload>(key, fromB64(rec.iv), fromB64(rec.ciphertext)) };
          } catch {
            nextOpened[rec.reportId] = { error: "This wallet's key cannot open this report." };
          }
        }
        setRecords(nextRecords);
        setOpened((o) => ({ ...o, ...nextOpened }));
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encKey, visibleReports, isMinistry]);

  function signOut() {
    localStorage.removeItem(KEY_STORAGE);
    setSigner(null);
    setEncKey(null);
    setRecords({});
    setOpened({});
  }

  if (!signer || !encKey) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SectionTitle kicker="Task-force & ministry console" title="Handle reports — on the record">
          Task forces decrypt reports in this browser and acknowledge them with on-chain transactions from their own wallet, so
          response times become public. The ministry sees reports that were escalated to it.
        </SectionTitle>
        <div className="card space-y-5 p-5 sm:p-6">
          <button className="btn-primary w-full" disabled={signingIn} onClick={() => signIn(injectedSigner)}>
            {signingIn ? <Spinner /> : null} Connect browser wallet
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or use a key held in this browser <span className="h-px flex-1 bg-line" />
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const k = keyInput.trim() as Hex;
              if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return setError("A private key is 0x followed by 64 hex characters.");
              if (remember) localStorage.setItem(KEY_STORAGE, k);
              setKeyInput("");
              signIn(async () => localSigner(k));
            }}
          >
            <input
              type="password"
              className="field font-mono"
              placeholder="0x… task-force or ministry test key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
            </label>
            <button className="btn-ghost w-full" disabled={signingIn || !keyInput}>
              Sign in with key
            </button>
          </form>
          <p className="text-xs text-muted">
            Signing in asks for one free signature (no transaction). Your decryption key is derived from it and never leaves this
            browser.
          </p>
          <ErrorNote error={error} />
        </div>
      </div>
    );
  }

  const role = isMinistry ? "Ministry (registrar)" : myInstitutions.length ? "Task force" : "No role";
  const keyMatches = isMinistry
    ? state?.ministryEncPubKey.toLowerCase() === encKey.pubHex.toLowerCase()
    : myInstitutions.every((i) => i.encPubKey.toLowerCase() === encKey.pubHex.toLowerCase());

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label mb-2">{role}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {isMinistry ? "Escalated reports" : myInstitutions[0]?.name ?? "This wallet has no role"}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Hash value={signer.address} head={8} tail={6} /> · {signer.kind === "injected" ? "browser wallet" : "key in this browser"}
            {state && (
              <Pill className={keyMatches ? "bg-ok-soft text-ok" : "bg-seal-soft text-seal"}>
                {keyMatches ? <Check className="h-3 w-3" /> : "✕"} decryption key {keyMatches ? "matches" : "does not match"} the key registered on-chain
              </Pill>
            )}
          </p>
        </div>
        <button className="btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
      <ErrorNote error={error} />

      {!state ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Reading the registry…
        </p>
      ) : !isMinistry && !myInstitutions.length ? (
        <p className="card p-5 text-sm text-ink-2">
          This wallet isn&apos;t registered as a task force or as the ministry on this registry. Institutions are registered by the
          ministry with <code className="font-mono">registerInstitution</code>.
        </p>
      ) : visibleReports.length === 0 ? (
        <p className="card p-5 text-sm text-muted">{isMinistry ? "No report has been escalated yet." : "No reports yet."}</p>
      ) : (
        <div className="space-y-4">
          {[...visibleReports].reverse().map((r) => (
            <CaseCard
              key={r.id}
              report={r}
              inst={state.institutions.find((i) => i.id === r.institutionId)}
              opened={opened[r.id]}
              record={records[r.id]}
              now={now}
              signer={signer}
              canAct={!isMinistry}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseCard({
  report: r,
  inst,
  opened,
  record,
  now,
  signer,
  canAct,
  onChanged,
}: {
  report: ChainReport;
  inst?: ChainInstitution;
  opened?: Opened;
  record?: StoredRecord;
  now: number;
  signer: ConsoleSigner;
  canAct: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ data: Summary; model: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const p = opened?.payload;
  const overdue = isOverdue(r, inst, now);
  const closed = r.status === 3 || r.status === 4;
  const deadline = inst ? r.submittedAt + inst.ackWindow : 0;

  async function act(label: string, fn: "acknowledge" | "setStatus", args: unknown[]) {
    setBusy(label);
    setErr(null);
    try {
      const hash = await signer.sendTx(fn, args);
      setLastTx(hash);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function summarize() {
    if (!p) return;
    setAiBusy(true);
    setErr(null);
    try {
      const res = await post<{ summary: Summary; model: string }>("/api/ai/summary", { report: p });
      setSummary({ data: res.summary, model: res.model });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <article className={`card overflow-hidden ${overdue ? "border-seal/40" : ""}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-paper/50 px-5 py-3">
        <span className="font-mono text-sm font-semibold">#{r.id}</span>
        <span className="text-sm text-ink-2">{p ? `${p.structured.category} · ${p.structured.severity}` : "…"}</span>
        <span className="text-xs text-muted">received {formatDuration(now - r.submittedAt)} ago</span>
        <span className="ml-auto flex items-center gap-3 text-xs">
          {r.acknowledgedAt === 0 && !closed && (
            <span className={overdue ? "text-seal" : "text-muted"}>
              ack deadline: <Countdown until={deadline} now={now} />
            </span>
          )}
          <StatusPill status={r.status} overdue={overdue} escalated={r.escalatedAt > 0} />
        </span>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3 text-sm">
          {opened?.error && <p className="text-seal">{opened.error}</p>}
          {!opened && (
            <p className="flex items-center gap-2 text-muted">
              <Spinner /> Decrypting in this browser…
            </p>
          )}
          {p && (
            <>
              <p className="text-[15px] leading-relaxed text-ink">{p.structured.summary || p.narrative}</p>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {(
                  [
                    ["What", p.structured.what],
                    ["When", p.structured.when],
                    ["Where", p.structured.where],
                    ["Who (roles)", p.structured.who],
                    ["Evidence", p.structured.evidence.filter(Boolean).join(" · ")],
                    ["Requested outcome", p.structured.requestedOutcome],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="label">{k}</dt>
                      <dd className="text-ink-2">{v}</dd>
                    </div>
                  ))}
              </dl>
              <details className="text-ink-2">
                <summary className="cursor-pointer text-xs text-muted">Reporter&apos;s original words</summary>
                <p className="mt-2 whitespace-pre-wrap">{p.narrative}</p>
              </details>
              {record && (
                <p className="text-xs text-muted">
                  Fingerprint <Hash value={r.commitment} head={10} tail={6} /> · decrypted locally from {Math.round((record.ciphertext.length * 3) / 4)} bytes of
                  ciphertext
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-info-soft/50 p-4">
            <div className="flex items-center justify-between">
              <p className="label">AI triage (anonymized)</p>
              {summary && <span className="font-mono text-[10px] text-muted">{summary.model}</span>}
            </div>
            {!p ? null : !p.aiConsent ? (
              <p className="mt-2 text-sm text-muted">The reporter did not consent to AI processing.</p>
            ) : summary ? (
              <div className="mt-2 space-y-2 text-sm">
                <p className="text-ink">{summary.data.anonymizedSummary}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Pill className="bg-white text-ink-2">urgency: {summary.data.urgency}</Pill>
                  <Pill className="bg-white text-ink-2">retaliation risk: {summary.data.retaliationRisk}</Pill>
                  {summary.data.financialDemand && <Pill className="bg-white text-seal">{summary.data.financialDemand}</Pill>}
                </div>
                {summary.data.keyFacts.length > 0 && (
                  <ul className="list-disc pl-5 text-ink-2">
                    {summary.data.keyFacts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                {summary.data.recommendedActions.length > 0 && (
                  <>
                    <p className="label pt-1">Recommended next steps</p>
                    <ol className="list-decimal pl-5 text-ink-2">
                      {summary.data.recommendedActions.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ol>
                  </>
                )}
                {summary.data.identifyingDetailsRemoved.length > 0 && (
                  <p className="text-xs text-muted">Removed: {summary.data.identifyingDetailsRemoved.join(", ")}</p>
                )}
              </div>
            ) : (
              <button className="btn-ghost mt-2 w-full" onClick={summarize} disabled={aiBusy}>
                {aiBusy ? <Spinner /> : null} Generate anonymized summary
              </button>
            )}
          </div>

          {canAct && (
            <div className="space-y-2">
              <p className="label">On-chain actions · signed by your wallet</p>
              {r.acknowledgedAt === 0 ? (
                <button className="btn-primary w-full" disabled={!!busy} onClick={() => act("ack", "acknowledge", [BigInt(r.id)])}>
                  {busy === "ack" ? <Spinner /> : null} Acknowledge report
                </button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <Check /> Acknowledged {fmtTime(r.acknowledgedAt)} ({formatDuration(r.acknowledgedAt - r.submittedAt)} after report
                  {r.acknowledgedAt > deadline ? ", late" : ""})
                </p>
              )}
              {!closed && (
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Investigating", 2],
                      ["Resolved", 3],
                      ["Referred", 4],
                    ] as const
                  ).map(([label, s]) => (
                    <button
                      key={label}
                      className="btn-ghost px-2 text-xs"
                      disabled={!!busy || r.status === s}
                      onClick={() => act(label, "setStatus", [BigInt(r.id), s])}
                    >
                      {busy === label ? <Spinner className="h-3 w-3" /> : null} {label}
                    </button>
                  ))}
                </div>
              )}
              {closed && <p className="text-sm text-muted">Closed {fmtTime(r.resolvedAt)}.</p>}
              {lastTx && (
                <a className="block font-mono text-xs text-info underline" href={explorerTx(lastTx)} target="_blank" rel="noreferrer">
                  tx {lastTx.slice(0, 18)}… ↗
                </a>
              )}
            </div>
          )}
          {!canAct && r.escalatedAt > 0 && inst && (
            <p className="text-sm text-ink-2">
              Escalated {fmtTime(r.escalatedAt)} — {inst.name.split(" — ")[0]} left it unacknowledged for{" "}
              {formatDuration(r.escalatedAt - r.submittedAt)} (window {formatDuration(inst.ackWindow)}).
            </p>
          )}
          {err && <p className="rounded-lg bg-seal-soft p-2 text-sm text-seal-dark">{err}</p>}
        </div>
      </div>
    </article>
  );
}
