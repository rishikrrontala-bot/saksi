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
  constructor(message: string, public code?: string) {
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
  // Serialise sends (not confirmations) so concurrent requests don't reuse a nonce.
  const send = queue.then(async () => {
    try {
      const { request } = await publicClient.simulateContract({
        account,
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName,
        args,
      });
      return await wallet.writeContract(request);
    } catch (e) {
      if (e instanceof BaseError) {
        const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
        const name = revert?.data?.errorName;
        if (name) throw new RelayError(FRIENDLY[name] ?? name, name);
        throw new RelayError(e.shortMessage);
      }
      throw e;
    }
  });
  queue = send.catch(() => undefined);
  const hash = await send;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new RelayError("Transaction reverted on-chain");
  return { hash, receipt };
}

export const relayerAddress = () => relayerAccount().address;
