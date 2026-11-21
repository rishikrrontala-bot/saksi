"use client";

import { useEffect, useMemo, useState } from "react";
import { getState } from "@/lib/client";
import type { ChainState } from "@/lib/chain";
import { displayName, explorerAddress, CHAIN_NAME } from "@/lib/config";
import { formatDuration, institutionMetrics, isOverdue } from "@/lib/metrics";
import { ErrorNote, Hash, SectionTitle, Spinner, StatusPill } from "@/components/ui";

export default function LedgerPage() {
  const [state, setState] = useState<ChainState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const load = () =>
      getState()
        .then((s) => {
          setState({ ...s, now: Math.max(s.now, Math.floor(Date.now() / 1000)) });
          setUpdated(new Date());
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const metrics = useMemo(() => (state ? institutionMetrics(state) : []), [state]);
  const totals = useMemo(() => {
    if (!state) return null;
    const windowOf = (id: string) => state.institutions.find((i) => i.id === id)?.ackWindow ?? 0;
    const due = state.reports.filter((r) => r.acknowledgedAt > 0 || state.now >= r.submittedAt + windowOf(r.institutionId));
    const onTime = due.filter((r) => r.acknowledgedAt > 0 && r.acknowledgedAt - r.submittedAt <= windowOf(r.institutionId));
    return {
      reports: state.reports.length,
      institutions: state.institutions.length,
      onTime: due.length ? onTime.length / due.length : null,
      overdue: metrics.reduce((a, m) => a + m.overdue, 0),
      escalated: metrics.reduce((a, m) => a + m.escalated, 0),
    };
  }, [state, metrics]);

  const recent = useMemo(() => (state ? [...state.reports].reverse().slice(0, 12) : []), [state]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <SectionTitle kicker="Public accountability ledger" title="How fast does each institution respond?">
        Every number on this page is computed in your browser from public chain data: report fingerprints, timestamps and the task
        forces&apos; signed actions. No report content is involved, and nobody, including SAKSI or the institutions, can edit it.
      </SectionTitle>
      <ErrorNote error={error} />

      {!state || !totals ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Reading the registry on {CHAIN_NAME}…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Reports anchored" value={String(totals.reports)} note={`across ${totals.institutions} institutions`} />
            <Kpi
              label="Acknowledged on time"
              value={totals.onTime == null ? "n/a" : `${Math.round(totals.onTime * 100)}%`}
              note="of reports whose window has closed"
            />
            <Kpi label="Overdue right now" value={String(totals.overdue)} note="deadline missed, no acknowledgement" alert={totals.overdue > 0} />
            <Kpi label="Escalated to ministry" value={String(totals.escalated)} note="by the reporters themselves" />
          </div>

          <section className="card mt-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line bg-paper/60 text-[11px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Institution</th>
                    <th className="px-3 py-3 font-semibold">Window</th>
                    <th className="px-3 py-3 text-right font-semibold">Reports</th>
                    <th className="px-3 py-3 text-right font-semibold">On time</th>
                    <th className="px-3 py-3 text-right font-semibold">Median to ack</th>
                    <th className="px-3 py-3 text-right font-semibold">Median to resolve</th>
                    <th className="px-3 py-3 text-right font-semibold">Open</th>
                    <th className="px-3 py-3 text-right font-semibold">Overdue</th>
                    <th className="px-4 py-3 text-right font-semibold">Escalated</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.institution.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-ink">{displayName(m.institution.name)}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          task force{" "}
                          <a className="font-mono underline decoration-dotted" href={explorerAddress(m.institution.taskForce)} target="_blank" rel="noreferrer">
                            {m.institution.taskForce.slice(0, 8)}…
                          </a>
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-muted">{formatDuration(m.institution.ackWindow)}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">{m.total}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        {m.onTimeRate == null ? <span className="text-muted">n/a</span> : <RateBar rate={m.onTimeRate} />}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums">{formatDuration(m.medianAckSeconds)}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">{formatDuration(m.medianResolveSeconds)}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">{m.open}</td>
                      <td className={`px-3 py-3.5 text-right font-semibold tabular-nums ${m.overdue ? "text-seal" : "text-muted"}`}>{m.overdue}</td>
                      <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${m.escalated ? "text-seal" : "text-muted"}`}>{m.escalated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="card p-5">
              <p className="label mb-3">Latest anchored reports · fingerprints only</p>
              {recent.length === 0 ? (
                <p className="text-sm text-muted">No reports yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((r) => {
                    const inst = state.institutions.find((i) => i.id === r.institutionId);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                        <a href={`/verify?id=${r.id}&c=${r.commitment}`} className="w-10 font-mono font-semibold text-ink hover:underline">
                          #{r.id}
                        </a>
                        <span className="min-w-0 flex-1 truncate text-muted">{inst?.name.split(" \u2014 ")[0]}</span>
                        <Hash value={r.commitment} head={8} tail={4} />
                        <span className="w-24 text-right text-xs text-muted">{formatDuration(state.now - r.submittedAt)} ago</span>
                        <StatusPill status={r.status} overdue={isOverdue(r, inst, state.now)} escalated={r.escalatedAt > 0} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="card space-y-3 p-5 text-sm text-ink-2">
              <p className="label">Recompute it yourself</p>
              <p>
                Registry <Hash value={state.registry} head={10} tail={6} /> on {CHAIN_NAME} (chain {state.chainId}).
              </p>
              <p>
                Call <code className="font-mono text-xs">getInstitutionIds()</code>, <code className="font-mono text-xs">getInstitution(id)</code>{" "}
                and <code className="font-mono text-xs">getReports(0, reportCount())</code>. &ldquo;On time&rdquo; means{" "}
                <code className="font-mono text-xs">acknowledgedAt − submittedAt ≤ ackWindow</code>.
              </p>
              <p className="text-xs text-muted">
                Block {state.blockNumber} · refreshed {updated?.toLocaleTimeString()} · demo institutions use shortened windows so the
                7-day rule can be shown live.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, note, alert }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={`card p-4 ${alert ? "border-seal/40 bg-seal-soft/40" : ""}`}>
      <p className="label">{label}</p>
      <p className={`mt-2 font-display text-4xl font-semibold tabular-nums ${alert ? "text-seal" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function RateBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-black/5 sm:inline-block">
        <span className={`block h-full ${pct >= 80 ? "bg-ok" : pct >= 50 ? "bg-warn" : "bg-seal"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={pct >= 80 ? "text-ok" : pct >= 50 ? "text-warn" : "text-seal"}>{pct}%</span>
    </span>
  );
}
