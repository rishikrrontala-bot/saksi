/**
 * Deploys SaksiRegistry and registers the demo institutions.
 *
 *   node --env-file=.env.local scripts/deploy.ts            # Base Sepolia (RPC_URL)
 *   LOCAL=1 node --env-file=.env.local scripts/deploy.ts    # local Hardhat node on :8545
 *
 * The ministry's and each task force's X25519 encryption keys are derived from a signature by
 * their own wallet (see src/lib/crypto.ts), so the on-chain public keys match what the console derives.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  keccak256,
  parseEther,
  stringToHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encKeyFromSignature, KEY_DERIVATION_MESSAGE } from "../src/lib/crypto.ts";

const LOCAL = !!process.env.LOCAL;
const rpc = LOCAL ? "http://127.0.0.1:8545" : process.env.RPC_URL || "https://sepolia.base.org";
const chainId = LOCAL ? 31337 : Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);
const chain = defineChain({
  id: chainId,
  name: LOCAL ? "Hardhat" : "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});

// Hardhat's first default account funds the local deployer.
const HARDHAT_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export const DEMO_INSTITUTIONS = [
  { slug: "RSP-NUSANTARA-ANES", name: "RS Pendidikan Nusantara — PPDS Anestesiologi (demo)", tf: "TF1_PRIVATE_KEY", window: 180 },
  { slug: "UMP-FK", name: "Universitas Merah Putih — Fakultas Kedokteran (demo)", tf: "TF2_PRIVATE_KEY", window: 300 },
  { slug: "RSUD-HARAPAN-BANGSA", name: "RSUD Harapan Bangsa — Komite Etik (demo)", tf: "TF3_PRIVATE_KEY", window: 7 * 86400 },
];
export const institutionId = (slug: string) => keccak256(stringToHex(`saksi:institution:${slug}`));

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k} in .env.local`);
  return v as Hex;
};

async function main() {
  const artifact = JSON.parse(readFileSync(new URL("../src/lib/abi/SaksiRegistry.json", import.meta.url), "utf8"));
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const deployer = privateKeyToAccount(env("DEPLOYER_PRIVATE_KEY"));
  const relayer = privateKeyToAccount(env("RELAYER_PRIVATE_KEY"));
  const wallet = createWalletClient({ account: deployer, chain, transport: http(rpc) });

  if (LOCAL) {
    const faucet = createWalletClient({ account: privateKeyToAccount(HARDHAT_0), chain, transport: http(rpc) });
    for (const to of [deployer.address, relayer.address]) {
      await pub.waitForTransactionReceipt({ hash: await faucet.sendTransaction({ to, value: parseEther("10") }) });
    }
  }

  const bal = await pub.getBalance({ address: deployer.address });
  console.log(`deployer ${deployer.address} balance ${formatEther(bal)} ETH on ${chain.name}`);
  if (bal === 0n) throw new Error("Deployer has no ETH — fund it from a faucet first");

  const ministry = encKeyFromSignature(await deployer.signMessage({ message: KEY_DERIVATION_MESSAGE }));
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [ministry.pubHex] });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  const address = rcpt.contractAddress!;
  console.log(`SaksiRegistry deployed at ${address} (tx ${hash}, block ${rcpt.blockNumber})`);

  const institutions = [];
  for (const inst of DEMO_INSTITUTIONS) {
    const tf = privateKeyToAccount(env(inst.tf));
    const enc = encKeyFromSignature(await tf.signMessage({ message: KEY_DERIVATION_MESSAGE }));
    const id = institutionId(inst.slug);
    const tx = await wallet.writeContract({
      address,
      abi: artifact.abi,
      functionName: "registerInstitution",
      args: [id, inst.name, tf.address, enc.pubHex, inst.window],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    institutions.push({ ...inst, id, taskForce: tf.address, encPubKey: enc.pubHex });
    console.log(`registered ${inst.name} (window ${inst.window}s, task force ${tf.address})`);
  }

  // Gas: the relayer sponsors every reporter submission; task forces send their own
  // wallet-signed acknowledge/setStatus transactions, so each gets a little test ETH too.
  const remaining = await pub.getBalance({ address: deployer.address });
  const targets = [
    { to: relayer.address, value: (remaining * 40n) / 100n, label: "relayer" },
    ...institutions.map((i) => ({ to: i.taskForce as Hex, value: (remaining * 8n) / 100n, label: `task force ${i.slug}` })),
  ];
  for (const t of targets) {
    if ((await pub.getBalance({ address: t.to })) >= t.value / 2n) continue;
    const tx = await wallet.sendTransaction({ to: t.to, value: t.value });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`funded ${t.label} ${t.to} with ${formatEther(t.value)} ETH`);
  }

  mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
  const out = {
    chainId,
    address,
    deployTx: hash,
    deployBlock: rcpt.blockNumber.toString(),
    registrar: deployer.address,
    relayer: relayer.address,
    ministryEncPubKey: ministry.pubHex,
    institutions: institutions.map(({ tf: _tf, ...rest }) => rest),
  };
  writeFileSync(new URL(`../deployments/${chainId}.json`, import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nNEXT_PUBLIC_REGISTRY_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
