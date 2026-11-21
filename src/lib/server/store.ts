/**
 * Off-chain store for ciphertext and wrapped keys (never plaintext).
 * Supabase Postgres in production; a local JSON file in development when Supabase isn't configured.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { WrappedKey } from "../crypto";

export interface ReportRecord {
  commitment: string;
  report_id: number | null;
  institution_id: string;
  iv: string;
  ciphertext: string;
  wrapped_tf: WrappedKey;
  wrapped_ministry: WrappedKey | null;
  tx_hash: string | null;
  created_at: string;
}

interface CodeRecord {
  code_hash: string;
  institution_id: string;
  used_at: string | null;
}

export interface Store {
  kind: "supabase" | "file";
  insertPending(r: Omit<ReportRecord, "report_id" | "tx_hash" | "created_at" | "wrapped_ministry">): Promise<void>;
  confirm(commitment: string, reportId: number, txHash: string): Promise<void>;
  remove(commitment: string): Promise<void>;
  byReportIds(ids: number[]): Promise<ReportRecord[]>;
  setWrappedMinistry(reportId: number, w: WrappedKey): Promise<void>;
  addCode(codeHash: string, institutionId: string): Promise<void>;
  /** Atomically consume an unused code for this institution. */
  useCode(codeHash: string, institutionId: string): Promise<boolean>;
  releaseCode(codeHash: string): Promise<void>;
}

// ---------------------------------------------------------------- Supabase

function supabaseStore(sb: SupabaseClient): Store {
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(`Database: ${error.message}`);
  };
  return {
    kind: "supabase",
    async insertPending(r) {
      check((await sb.from("reports").insert(r)).error);
    },
    async confirm(commitment, reportId, txHash) {
      check((await sb.from("reports").update({ report_id: reportId, tx_hash: txHash }).eq("commitment", commitment)).error);
    },
    async remove(commitment) {
      check((await sb.from("reports").delete().eq("commitment", commitment)).error);
    },
    async byReportIds(ids) {
      if (!ids.length) return [];
      const { data, error } = await sb.from("reports").select("*").in("report_id", ids);
      check(error);
      return (data ?? []) as ReportRecord[];
    },
    async setWrappedMinistry(reportId, w) {
      check((await sb.from("reports").update({ wrapped_ministry: w }).eq("report_id", reportId)).error);
    },
    async addCode(codeHash, institutionId) {
      check((await sb.from("access_codes").insert({ code_hash: codeHash, institution_id: institutionId })).error);
    },
    async useCode(codeHash, institutionId) {
      const { data, error } = await sb
        .from("access_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("code_hash", codeHash)
        .eq("institution_id", institutionId)
        .is("used_at", null)
        .select("code_hash");
      check(error);
      return (data ?? []).length === 1;
    },
    async releaseCode(codeHash) {
      check((await sb.from("access_codes").update({ used_at: null }).eq("code_hash", codeHash)).error);
    },
  };
}

// ---------------------------------------------------------------- local file (dev only)

function fileStore(file: string): Store {
  type Db = { reports: ReportRecord[]; codes: CodeRecord[] };
  let lock = Promise.resolve();
  const load = async (): Promise<Db> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return { reports: [], codes: [] };
    }
  };
  const mutate = <T>(fn: (db: Db) => T | Promise<T>): Promise<T> => {
    const run = lock.then(async () => {
      const db = await load();
      const out = await fn(db);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(db, null, 2));
      return out;
    });
    lock = run.then(() => undefined, () => undefined);
    return run;
  };
  return {
    kind: "file",
    insertPending: (r) =>
      mutate((db) => {
        if (db.reports.some((x) => x.commitment === r.commitment)) throw new Error("Database: duplicate commitment");
        db.reports.push({ ...r, report_id: null, tx_hash: null, wrapped_ministry: null, created_at: new Date().toISOString() });
      }),
    confirm: (c, id, tx) =>
      mutate((db) => {
        const r = db.reports.find((x) => x.commitment === c);
        if (r) Object.assign(r, { report_id: id, tx_hash: tx });
      }),
    remove: (c) => mutate((db) => void (db.reports = db.reports.filter((x) => x.commitment !== c))),
    byReportIds: async (ids) => (await load()).reports.filter((r) => r.report_id != null && ids.includes(r.report_id)),
    setWrappedMinistry: (id, w) =>
      mutate((db) => {
        const r = db.reports.find((x) => x.report_id === id);
        if (r) r.wrapped_ministry = w;
      }),
    addCode: (h, inst) => mutate((db) => void db.codes.push({ code_hash: h, institution_id: inst, used_at: null })),
    useCode: (h, inst) =>
      mutate((db) => {
        const c = db.codes.find((x) => x.code_hash === h && x.institution_id === inst && !x.used_at);
        if (!c) return false;
        c.used_at = new Date().toISOString();
        return true;
      }),
    releaseCode: (h) =>
      mutate((db) => {
        const c = db.codes.find((x) => x.code_hash === h);
        if (c) c.used_at = null;
      }),
  };
}

let cached: Store | null = null;
export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    cached = supabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  } else if (process.env.VERCEL) {
    throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  } else {
    cached = fileStore(path.join(process.cwd(), ".data", "store.json"));
  }
  return cached;
}
