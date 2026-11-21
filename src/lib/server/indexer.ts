/**
 * Event indexer (proposal §6, data-flow step 8). Rebuilds every institution and report purely from
 * the registry's events — the same computation anyone can repeat against a public RPC.
 * Incremental: keeps the decoded events in memory and only fetches new blocks on each call.
 */
import type { Hex } from "viem";
import { publicClient, readChainState, registryAbi, type ChainInstitution, type ChainReport, type ChainState } from "../chain";
import { chain, REGISTRY_ADDRESS } from "../config";

const CHUNK = 5_000n;
const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || process.env.DEPLOY_BLOCK || "0");

type Ev = { eventName: string; args: Record<string, unknown>; blockNumber: bigint; logIndex: number };

let events: Ev[] = [];
let indexedTo = DEPLOY_BLOCK - 1n;
let running: Promise<void> | null = null;

async function catchUp(latest: bigint) {
  const ranges: [bigint, bigint][] = [];
  for (let from = indexedTo + 1n; from <= latest; from += CHUNK) {
    ranges.push([from, from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n]);
  }
  const batches = await Promise.all(
    ranges.map(([fromBlock, toBlock]) =>
      publicClient.getContractEvents({ address: REGISTRY_ADDRESS, abi: registryAbi, fromBlock, toBlock })
    )
  );
  for (const batch of batches) {
    for (const log of batch) {
      events.push({
        eventName: (log as unknown as { eventName: string }).eventName,
        args: (log as unknown as { args: Record<string, unknown> }).args,
        blockNumber: log.blockNumber!,
        logIndex: log.logIndex!,
      });
    }
  }
  events.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  indexedTo = latest;
}

function fold(): Omit<ChainState, "now" | "blockNumber"> & { eventCount: number } {
  let registrar = "0x" as Hex;
  let ministryEncPubKey = "0x" as Hex;
  const insts = new Map<string, ChainInstitution>();
  const order: string[] = [];
  const reports: ChainReport[] = [];
  for (const { eventName, args: a } of events) {
    switch (eventName) {
      case "RegistrarTransferred":
        registrar = a.newRegistrar as Hex;
        break;
      case "MinistryKeyUpdated":
        ministryEncPubKey = a.key as Hex;
        break;
      case "InstitutionRegistered":
        insts.set(a.id as string, {
          id: a.id as Hex,
          name: a.name as string,
          taskForce: a.taskForce as Hex,
          encPubKey: a.encPubKey as Hex,
          ackWindow: Number(a.ackWindow),
          active: true,
        });
        order.push(a.id as string);
        break;
      case "InstitutionUpdated": {
        const i = insts.get(a.id as string);
        if (i) Object.assign(i, { taskForce: a.taskForce, encPubKey: a.encPubKey, ackWindow: Number(a.ackWindow), active: a.active });
        break;
      }
      case "ReportSubmitted":
        reports[Number(a.reportId)] = {
          id: Number(a.reportId),
          institutionId: a.institutionId as Hex,
          commitment: a.commitment as Hex,
          submittedAt: Number(a.submittedAt),
          acknowledgedAt: 0,
          resolvedAt: 0,
          escalatedAt: 0,
          status: 0,
        };
        break;
      case "Acknowledged": {
        const r = reports[Number(a.reportId)];
        if (r) {
          r.acknowledgedAt = Number(a.at);
          if (r.status === 0) r.status = 1;
        }
        break;
      }
      case "StatusChanged": {
        const r = reports[Number(a.reportId)];
        if (r) {
          r.status = Number(a.status);
          if ((r.status === 3 || r.status === 4) && !r.resolvedAt) r.resolvedAt = Number(a.at);
        }
        break;
      }
      case "Escalated": {
        const r = reports[Number(a.reportId)];
        if (r) r.escalatedAt = Number(a.at);
        break;
      }
    }
  }
  return {
    registry: REGISTRY_ADDRESS,
    chainId: chain.id,
    registrar,
    ministryEncPubKey,
    institutions: order.map((id) => insts.get(id)!),
    reports: reports.filter(Boolean),
    eventCount: events.length,
  };
}

export type IndexedState = ChainState & { source: "events" | "contract"; eventCount?: number; indexedBlock?: string };

export async function indexedChainState(): Promise<IndexedState> {
  if (!REGISTRY_ADDRESS) throw new Error("Registry address not configured (NEXT_PUBLIC_REGISTRY_ADDRESS)");
  try {
    const block = await publicClient.getBlock();
    if (!running) running = catchUp(block.number).finally(() => (running = null));
    await running;
    const folded = fold();
    return { ...folded, now: Number(block.timestamp), blockNumber: block.number.toString(), source: "events", indexedBlock: indexedTo.toString() };
  } catch (e) {
    // Fallback: read the same facts straight from the contract's view functions.
    console.error("indexer failed, falling back to contract reads:", (e as Error).message);
    events = [];
    indexedTo = DEPLOY_BLOCK - 1n;
    return { ...(await readChainState()), source: "contract" };
  }
}
