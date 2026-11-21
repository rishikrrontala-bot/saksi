import { createPublicClient, http, type Abi, type Hex } from "viem";
import abiJson from "./abi/SaksiRegistry.json";
import { chain, REGISTRY_ADDRESS, RPC_URL } from "./config";

export const registryAbi = abiJson.abi as Abi;

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

export interface ChainInstitution {
  id: Hex;
  name: string;
  taskForce: Hex;
  encPubKey: Hex;
  ackWindow: number;
  active: boolean;
}

export interface ChainReport {
  id: number;
  institutionId: Hex;
  commitment: Hex;
  submittedAt: number;
  acknowledgedAt: number;
  resolvedAt: number;
  escalatedAt: number;
  status: number;
}

export interface ChainState {
  registry: Hex;
  chainId: number;
  registrar: Hex;
  ministryEncPubKey: Hex;
  institutions: ChainInstitution[];
  reports: ChainReport[];
  now: number; // latest block timestamp — the contract's notion of "now"
  blockNumber: string;
  source?: "events" | "contract"; // events = rebuilt by the indexer; contract = view-function fallback
  eventCount?: number;
  indexedBlock?: string;
}

type RawReport = Omit<ChainReport, "id">;
type RawInstitution = Omit<ChainInstitution, "id">;

const read = <T>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName, args }) as Promise<T>;

/** Everything the ledger, console and verifier need, read straight from the contract. */
export async function readChainState(): Promise<ChainState> {
  if (!REGISTRY_ADDRESS) throw new Error("Registry address not configured (NEXT_PUBLIC_REGISTRY_ADDRESS)");
  const [registrar, ministryEncPubKey, ids, count, block] = await Promise.all([
    read<Hex>("registrar"),
    read<Hex>("ministryEncPubKey"),
    read<Hex[]>("getInstitutionIds"),
    read<bigint>("reportCount"),
    publicClient.getBlock(),
  ]);
  const [insts, raw] = await Promise.all([
    Promise.all(ids.map((id) => read<RawInstitution>("getInstitution", [id]))),
    count > 0n ? read<RawReport[]>("getReports", [0n, count]) : Promise.resolve([] as RawReport[]),
  ]);
  return {
    registry: REGISTRY_ADDRESS,
    chainId: chain.id,
    registrar,
    ministryEncPubKey,
    institutions: insts.map((x, i) => ({
      id: ids[i],
      name: x.name,
      taskForce: x.taskForce,
      encPubKey: x.encPubKey,
      ackWindow: Number(x.ackWindow),
      active: x.active,
    })),
    reports: raw.map((r, i) => ({
      id: i,
      institutionId: r.institutionId,
      commitment: r.commitment,
      submittedAt: Number(r.submittedAt),
      acknowledgedAt: Number(r.acknowledgedAt),
      resolvedAt: Number(r.resolvedAt),
      escalatedAt: Number(r.escalatedAt),
      status: Number(r.status),
    })),
    now: Number(block.timestamp),
    blockNumber: block.number.toString(),
  };
}
