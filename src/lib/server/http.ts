import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { indexedChainState, type IndexedState } from "./indexer";
import { RelayError } from "./relayer";

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof RelayError) return NextResponse.json({ error: e.message, code: e.code ?? null }, { status: 409 });
      console.error(e);
      return fail((e as Error).message || "Server error", 500);
    }
  };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Normalise a human-typed access code: case-insensitive, ignores spaces and dashes. */
export const codeHash = (code: string) => sha256("saksi-code-v1:" + code.toUpperCase().replace(/[^A-Z0-9]/g, ""));

let cache: { at: number; state: IndexedState } | null = null;
export async function chainState(maxAgeMs = 2500): Promise<IndexedState> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.state;
  const state = await indexedChainState();
  cache = { at: Date.now(), state };
  return state;
}
export const invalidateChainState = () => {
  cache = null;
};

export const isHex32 = (s: unknown): s is `0x${string}` => typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s);
