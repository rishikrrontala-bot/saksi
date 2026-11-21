import { chainState, handle, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Public: institutions + every report's on-chain record (hashes, timestamps, status). No content. */
export const GET = handle(async () => ok(await chainState()));
