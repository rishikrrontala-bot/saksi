/**
 * Gas-sponsoring relayer. Reporters and task forces never hold ETH: the relayer submits
 * commitments and the task force's EIP-712 signed actions. It cannot forge either —
 * the contract checks the task force's signature itself.
 */
import { BaseError, ContractFunctionRevertedError, createWalletClient, http, type Hex, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient, registryAbi } from "../chain";
import { chain, REGISTRY_ADDRESS, RPC_URL } from "../config";

const FRIENDLY: Record<string, string> = {
  NotOverdue: "This report is not overdue yet — the institution's acknowledgement window is still open.",
  AlreadyAcknowledged: "The task force has already acknowledged this report.",
  AlreadyEscalated: "This report has already been escalated.",
  InvalidSignature: "The signature does not belong to this institution's task force.",
  SignatureExpired: "The signature expired. Please sign again.",
  CommitmentUsed: "This report was already anchored.",
  UnknownInstitution: "Unknown institution.",
  InstitutionInactive: "This institution is not accepting reports.",
  ReportClosed: "This report is already closed.",
  InvalidStatus: "That status change is not allowed.",
  UnknownReport: "No report with that id exists on-chain.",
};

export class RelayError extends Error {
  /** `sentHash` is set when the transaction was broadcast but not confirmed — it may still be mined. */
  constructor(message: string, public code?: string, public sentHash?: Hex) {
    super(message);
  }
}

function relayerAccount() {
  const pk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new RelayError("Relayer key not configured");
  return privateKeyToAccount(pk);
}

let queue: Promise<unknown> = Promise.resolve();

export async function relay(functionName: string, args: unknown[]): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
  const account = relayerAccount();
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
  // One transaction at a time, send AND confirmation, so each simulation sees the previous
  // transaction's effects and concurrent requests never reuse a nonce.
  const run = queue.then(async () => {
    let hash: Hex;
    try {
      const { request } = await publicClient.simulateContract({
        account,
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName,
        args,
      });
      hash = await wallet.writeContract(request);
    } catch (e) {
      if (e instanceof BaseError) {
        const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
        const name = revert?.data?.errorName;
        if (name) throw new RelayError(FRIENDLY[name] ?? name, name);
        throw new RelayError(e.shortMessage);
      }
      throw e;
    }
    let receipt: TransactionReceipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    } catch {
      throw new RelayError(`Sent (tx ${hash}) but not confirmed yet — it may still be mined.`, "Pending", hash);
    }
    if (receipt.status !== "success") throw new RelayError("Transaction reverted on-chain");
    return { hash, receipt };
  });
  queue = run.catch(() => undefined);
  return run;
}

export const relayerAddress = () => relayerAccount().address;
