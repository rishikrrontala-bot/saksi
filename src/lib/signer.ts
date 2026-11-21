"use client";

/**
 * Task-force and ministry signers (proposal §6: "wagmi + viem — wallet signatures for task-force and
 * ministry actions"). Either a browser wallet connected through wagmi, or a key held in this browser.
 * acknowledge / setStatus are sent as real transactions from the task force's own wallet.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  http,
  type Hex,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
// `injected` comes from wagmi's core export (the wagmi/connectors barrel pulls in optional SDKs we don't use).
import { createConfig, http as wagmiHttp, injected } from "wagmi";
import { connect, getWalletClient, switchChain } from "wagmi/actions";
import { publicClient, registryAbi } from "./chain";
import { chain, REGISTRY_ADDRESS, RPC_URL } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transports: { [chain.id]: wagmiHttp(RPC_URL) } as any,
  ssr: true,
});

export type RegistryWrite = "acknowledge" | "setStatus";

export interface ConsoleSigner {
  address: Hex;
  kind: "local" | "injected";
  signMessage(message: string): Promise<Hex>;
  /** Simulates (to surface the contract's own revert reason), sends, and waits for the receipt. */
  sendTx(functionName: RegistryWrite, args: unknown[]): Promise<Hex>;
}

function contractError(e: unknown): Error {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName) return new Error(`Rejected by the contract: ${revert.data.errorName}()`);
    if (/insufficient funds/i.test(e.message)) return new Error("This wallet has no test ETH for gas.");
    return new Error(e.shortMessage);
  }
  return e as Error;
}

async function send(wallet: WalletClient, address: Hex, functionName: RegistryWrite, args: unknown[]): Promise<Hex> {
  try {
    const { request } = await publicClient.simulateContract({
      account: address,
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName,
      args,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await wallet.writeContract({ ...(request as any), account: wallet.account ?? address, chain });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    return hash;
  } catch (e) {
    throw contractError(e);
  }
}

export function localSigner(pk: Hex): ConsoleSigner {
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
  return {
    address: account.address,
    kind: "local",
    signMessage: (message) => account.signMessage({ message }),
    sendTx: (fn, args) => send(wallet, account.address, fn, args),
  };
}

export async function injectedSigner(): Promise<ConsoleSigner> {
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum)
    throw new Error("No browser wallet found. Install MetaMask, or use a key held in this browser.");
  const { accounts } = await connect(wagmiConfig, { connector: injected() });
  try {
    await switchChain(wagmiConfig, { chainId: chain.id });
  } catch {
    /* wallet may already be on the chain, or the user declined; sending will tell */
  }
  const wallet = (await getWalletClient(wagmiConfig)) as unknown as WalletClient;
  const address = accounts[0] as Hex;
  return {
    address,
    kind: "injected",
    signMessage: (message) => wallet.signMessage({ account: address, message }),
    sendTx: (fn, args) => send(wallet, address, fn, args),
  };
}
