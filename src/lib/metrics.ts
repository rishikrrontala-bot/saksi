import type { ChainInstitution, ChainReport, ChainState } from "./chain";

/** Accountability metrics computed purely from on-chain data. Anyone can recompute these. */
export interface InstitutionMetrics {
  institution: ChainInstitution;
  total: number;
  acknowledged: number;
  /** of reports whose window has closed (or that were acknowledged), share acknowledged inside the window */
  onTimeRate: number | null;
  medianAckSeconds: number | null;
  medianResolveSeconds: number | null;
  resolved: number;
  open: number;
  overdue: number; // unacknowledged past the window right now
  escalated: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const isOverdue = (r: ChainReport, inst: ChainInstitution | undefined, now: number) =>
  !!inst && r.acknowledgedAt === 0 && now >= r.submittedAt + inst.ackWindow;

export function institutionMetrics(state: ChainState): InstitutionMetrics[] {
  return state.institutions.map((inst) => {
    const rs = state.reports.filter((r) => r.institutionId === inst.id);
    const due = rs.filter((r) => r.acknowledgedAt > 0 || state.now >= r.submittedAt + inst.ackWindow);
    const onTime = due.filter((r) => r.acknowledgedAt > 0 && r.acknowledgedAt - r.submittedAt <= inst.ackWindow);
    const resolved = rs.filter((r) => r.resolvedAt > 0);
    return {
      institution: inst,
      total: rs.length,
      acknowledged: rs.filter((r) => r.acknowledgedAt > 0).length,
      onTimeRate: due.length ? onTime.length / due.length : null,
      medianAckSeconds: median(rs.filter((r) => r.acknowledgedAt > 0).map((r) => r.acknowledgedAt - r.submittedAt)),
      medianResolveSeconds: median(resolved.map((r) => r.resolvedAt - r.submittedAt)),
      resolved: resolved.length,
      open: rs.length - resolved.length,
      overdue: rs.filter((r) => isOverdue(r, inst, state.now)).length,
      escalated: rs.filter((r) => r.escalatedAt > 0).length,
    };
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "n/a";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60 ? `${s % 60}s` : ""}`.trim();
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d} days`;
}
