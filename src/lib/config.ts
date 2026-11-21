import { defineChain, type Hex } from "viem";

/**
 * Public, build-time config. Everything here is safe to ship to the browser.
 * The proposal targeted Lisk Sepolia (chain 4202), which was wound down in June 2026; the contract
 * is chain-agnostic, so SAKSI runs on Base Sepolia — another OP Stack L2 testnet.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://base-sepolia.blockscout.com";
export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "") as Hex;
const NAMES: Record<number, string> = { 84532: "Base Sepolia", 4202: "Lisk Sepolia", 31337: "Local test chain" };
export const CHAIN_NAME = NAMES[CHAIN_ID] ?? `Chain ${CHAIN_ID}`;

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER_URL } },
  testnet: true,
});

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`;

export const STATUS_LABELS = ["Submitted", "Acknowledged", "Investigating", "Resolved", "Referred"] as const;
export type StatusCode = 0 | 1 | 2 | 3 | 4;
