/**
 * SAKSI browser-side cryptography (also runs in Node 20+ for scripts).
 *
 *  - Each report is encrypted with a fresh random AES-256-GCM key (WebCrypto).
 *  - commitment = keccak256(iv ‖ ciphertext ‖ salt) is what goes on-chain.
 *  - The report key is wrapped for the task force (and later the ministry) with
 *    X25519 ECDH → HKDF-SHA256 → AES-256-GCM.
 *  - Task-force and ministry X25519 keys are derived from a wallet signature over a fixed
 *    message, so a wallet is the only secret they hold.
 */
import { x25519 } from "@noble/curves/ed25519";
import { bytesToHex, concat, hexToBytes, keccak256, type Hex } from "viem";

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
/** Copy into a fresh ArrayBuffer-backed view; WebCrypto's TS types reject SharedArrayBuffer-backed views. */
const buf = (u: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(u);

export const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const computeCommitment = (iv: Uint8Array, ciphertext: Uint8Array, salt: Uint8Array): Hex =>
  keccak256(concat([iv, ciphertext, salt]));

async function aesKey(raw: Uint8Array, usages: KeyUsage[]) {
  return subtle().importKey("raw", buf(raw), { name: "AES-GCM" }, false, usages);
}

export interface SealedReport {
  key: Uint8Array; // 32-byte AES key - only the reporter (receipt) and wrapped copies hold it
  iv: Uint8Array;
  ciphertext: Uint8Array;
  salt: Uint8Array; // stays in the receipt; proves the receipt holder can open the commitment
  commitment: Hex;
}

export async function sealReport(payload: unknown): Promise<SealedReport> {
  const key = random(32);
  const iv = random(12);
  const salt = random(32);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, await aesKey(key, ["encrypt"]), enc.encode(JSON.stringify(payload)))
  );
  return { key, iv, ciphertext: ct, salt, commitment: computeCommitment(iv, ct, salt) };
}

export async function openReport<T = unknown>(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<T> {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: buf(iv) }, await aesKey(key, ["decrypt"]), buf(ciphertext));
  return JSON.parse(dec.decode(pt)) as T;
}

// ---------------------------------------------------------------- key wrapping (X25519 + HKDF + AES-GCM)

export interface WrappedKey {
  epk: string; // ephemeral X25519 public key, base64
  iv: string;
  ct: string;
}

async function kek(shared: Uint8Array, epk: Uint8Array, recipientPub: Uint8Array, usage: KeyUsage) {
  const ikm = await subtle().importKey("raw", buf(shared), "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buf(concat([epk, recipientPub])), info: enc.encode("SAKSI-wrap-v1") },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

export async function wrapKey(reportKey: Uint8Array, recipientPub: Uint8Array): Promise<WrappedKey> {
  const eph = random(32);
  const epk = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, recipientPub);
  const iv = random(12);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, await kek(shared, epk, recipientPub, "encrypt"), buf(reportKey))
  );
  return { epk: toB64(epk), iv: toB64(iv), ct: toB64(ct) };
}

export async function unwrapKey(w: WrappedKey, recipientPriv: Uint8Array): Promise<Uint8Array> {
  const epk = fromB64(w.epk);
  const pub = x25519.getPublicKey(recipientPriv);
  const shared = x25519.getSharedSecret(recipientPriv, epk);
  const k = await kek(shared, epk, pub, "decrypt");
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(fromB64(w.iv)) }, k, buf(fromB64(w.ct))));
}

// ---------------------------------------------------------------- wallet-derived decryption keys

/** Signed (free, off-chain) by task forces and the ministry to derive their X25519 decryption key. */
export const KEY_DERIVATION_MESSAGE =
  "SAKSI decryption key v1\n\nSigning this derives your private key for reading sealed reports.\nIt is free and sends no transaction.";

export interface EncKeyPair {
  priv: Uint8Array;
  pub: Uint8Array;
  pubHex: Hex; // bytes32 as registered on-chain
}

/**
 * ECDSA signatures are deterministic (RFC 6979), so the same wallet always derives the same key.
 * The signature is therefore as sensitive as a private key: SAKSI never logs, stores or transmits it -
 * it lives only in this tab's memory. (Hardware-wallet or HSM-held keys are the production path.)
 */
export function encKeyFromSignature(signature: Hex): EncKeyPair {
  const priv = hexToBytes(keccak256(signature));
  const pub = x25519.getPublicKey(priv);
  return { priv, pub, pubHex: bytesToHex(pub) };
}

export const hexToPub = (h: Hex) => hexToBytes(h);
