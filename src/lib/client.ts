import type { Hex } from "viem";
import type { ChainState } from "./chain";
import type { WrappedKey } from "./crypto";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || `Request failed (${res.status})`, body.code ?? null);
  return body as T;
}

/** `code` is the contract's custom error name when the chain itself rejected the request. */
export class ApiError extends Error {
  constructor(message: string, public code: string | null) {
    super(message);
  }
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const getState = () => api<ChainState>("/api/state");

export interface StoredRecord {
  reportId: number;
  commitment: Hex;
  iv: string;
  ciphertext: string;
  wrappedTf: WrappedKey;
  wrappedMinistry: WrappedKey | null;
  txHash: string | null;
}
export const getRecords = async (ids: number[]) =>
  ids.length ? (await api<{ records: StoredRecord[] }>(`/api/records?ids=${ids.join(",")}`)).records : [];

/** The plaintext that gets encrypted in the reporter's browser. */
export interface ReportPayload {
  v: 1;
  institutionId: Hex;
  institutionName: string;
  createdAt: string;
  narrative: string;
  structured: {
    category: string;
    severity: string;
    summary: string;
    what: string;
    when: string;
    where: string;
    who: string;
    evidence: string[];
    requestedOutcome: string;
  };
  aiConsent: boolean;
  aiModel?: string;
}

/** Everything the reporter needs to prove, check, decrypt and escalate. Contains the report key: keep private. */
export interface Receipt {
  kind: "saksi-receipt";
  version: 1;
  chainId: number;
  registry: Hex;
  reportId: number;
  txHash: Hex;
  submittedAt: number;
  institutionId: Hex;
  institutionName: string;
  commitment: Hex;
  salt: Hex;
  key: string; // base64 AES-256 report key
}

export function parseReceipt(text: string): Receipt {
  const r = JSON.parse(text);
  if (r?.kind !== "saksi-receipt" || typeof r.reportId !== "number" || !r.commitment || !r.salt || !r.key)
    throw new Error("This doesn't look like a SAKSI receipt file.");
  return r as Receipt;
}

export const verifyUrl = (origin: string, reportId: number, commitment: string) =>
  `${origin}/verify?id=${reportId}&c=${commitment}`;
