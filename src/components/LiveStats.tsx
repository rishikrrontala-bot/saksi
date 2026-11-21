"use client";

import { useEffect, useState } from "react";
import { getState } from "@/lib/client";
import type { ChainState } from "@/lib/chain";
import { CHAIN_NAME } from "@/lib/config";
import { isOverdue } from "@/lib/metrics";

export function LiveStats() {
  const [s, setS] = useState<ChainState | null>(null);
  useEffect(() => {
    const load = () =>
      getState()
        .then((st) => setS({ ...st, now: Math.max(st.now, Math.floor(Date.now() / 1000)) }))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  const overdue = s ? s.reports.filter((r) => isOverdue(r, s.institutions.find((i) => i.id === r.institutionId), s.now)).length : null;
  const acked = s ? s.reports.filter((r) => r.acknowledgedAt > 0).length : null;
  const rows: [string, number | null, boolean?][] = [
    ["Reports anchored on-chain", s ? s.reports.length : null],
    ["Acknowledged by a task force", acked],
    ["Overdue right now", overdue, true],
    ["Escalated to the ministry", s ? s.reports.filter((r) => r.escalatedAt > 0).length : null, true],
  ];
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="label">Live from the registry</p>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok" /> {CHAIN_NAME}
        </span>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([label, v, alert]) => (
          <div key={label} className="flex items-baseline justify-between py-3">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className={`font-display text-3xl font-semibold tabular-nums ${alert && v ? "text-seal" : "text-ink"}`}>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
