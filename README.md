# SAKSI: reports the institution can't bury

**SAKSI** (Indonesian for *witness*; *Saluran Aduan Kekerasan yang Sah & Independen*) is an anonymous, tamper-evident reporting rail for bullying, extortion, harassment and other violence at universities and teaching hospitals. A student or medical resident files a report from any browser with no account, no wallet and no name. The report is **encrypted in the browser**; only a **fingerprint and a timestamp** are anchored on a public chain. The reporter keeps a **Sealed Receipt (PDF + QR)** that proves the report existed, and when, without the institution's cooperation. The institution's task force must acknowledge it with an **on-chain, wallet-signed transaction**, so response times become public data; a report ignored past its window can be **escalated to the ministry** by the reporter, with the deadline enforced by the contract.

Built for **COMPSPHERE 12 International Web3 Hackathon** (team *rrr*). All demo institutions and cases are fictional.

- **Live app:** https://saksi-compsphere.vercel.app
- **Contract:** `SaksiRegistry` on Base Sepolia: [`0x5ccf07245d652380b1d13f6a72dc351389648150`](https://base-sepolia.blockscout.com/address/0x5ccf07245d652380b1d13f6a72dc351389648150) ([why not Lisk Sepolia?](#chain)) · deployment record: [`deployments/84532.json`](deployments/84532.json)

## The four MVP features (as proposed)

| # | Feature | Where |
|---|---|---|
| F1 | **Sealed Report Submission**: one-time access code → AI-guided intake → AES-256-GCM in the browser → commitment anchored by a gas-sponsored relayer → Sealed Receipt (PDF + QR) with explorer link | `/report` |
| F2 | **Task-Force Console**: wallet sign-in, in-browser decryption, AI anonymized summary and category, `acknowledge` / `setStatus` transactions signed by the task force's wallet | `/console` |
| F3 | **Public Accountability Ledger**: per-institution reports, % acknowledged on time, median time to acknowledge / resolve, overdue and escalated, computed from chain events by an indexer | `/ledger` |
| F4 | **Verify & Escalate**: load a receipt → on-chain match, ciphertext integrity, one-byte tamper test; after the window, one click re-wraps the key for the ministry and calls `escalate` (early attempts are rejected by the contract) | `/verify` |

## How a report flows

1. **Access code.** Institutions distribute one-time codes in bulk; only SHA-256 hashes are stored, never who received which. (Demo: "Get a demo code".)
2. **AI intake (consent-gated).** The narrative (Bahasa Indonesia or English) goes to an open-weight model on **Featherless.ai** (`Qwen/Qwen3-30B-A3B-Instruct-2507`, fallback `deepseek-ai/DeepSeek-V3.1`) which returns a zod-validated structured case. The reporter edits everything before sealing. Nothing is stored.
3. **Sealing in the browser.** A random AES-256-GCM key encrypts the report (WebCrypto). `H = keccak256(iv ‖ ciphertext ‖ salt)`. The report key is wrapped for the task force's X25519 public key (ECDH → HKDF-SHA256 → AES-GCM).
4. **Anchoring.** The server receives ciphertext + wrapped key only, checks the access code, and the relayer calls `submitReport(institutionId, H)`. The block timestamp is the legally useful fact.
5. **Sealed Receipt.** PDF + QR with report ID, tx hash, `H`, salt and the reporter's copy of the key (the machine-readable receipt is embedded in the PDF, so the verifier loads the same file).
6. **Accountable handling.** The task force signs in with its wallet; a free signature derives its X25519 decryption key (checked against the key registered on-chain). It decrypts in the browser and sends `acknowledge()` / `setStatus()` transactions.
7. **Escalation.** After the institution's window (7 days in production) without acknowledgement, the reporter re-wraps the key for the ministry's key and the contract's `escalate()` records it. The ministry console decrypts escalated reports.
8. **Ledger.** An event indexer folds `ReportSubmitted`, `Acknowledged`, `StatusChanged`, `Escalated` and `InstitutionRegistered` events into per-institution metrics (fallback: the contract's view functions).

**On-chain per report:** two 32-byte hashes, four timestamps, one status byte. No content, no names, no IP addresses.

## Architecture

```
Browser (Next.js 15 + WebCrypto)            Next.js API routes (Vercel)                Base Sepolia (OP Stack L2)
 ─ AES-256-GCM seal, keccak commitment  ─▶  /api/submit  ─ access code check ─▶ relayer ─▶ SaksiRegistry.submitReport
 ─ X25519 key wrap for task force           /api/ai/*    ─ Featherless.ai (open-weight)    .acknowledge / .setStatus  ◀─ task-force wallet (wagmi + viem)
 ─ Sealed Receipt PDF + QR                  /api/records ─ Supabase Postgres (ciphertext,  .escalate                  ◀─ relayer, after the window
 ─ verifier, tamper test, escalation                       wrapped keys, code hashes)      events ─▶ indexer ─▶ /api/state ─▶ Ledger
```

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (React 19, TypeScript), Tailwind CSS 4, WebCrypto, `qrcode`, `jspdf` |
| Wallet / chain client | wagmi (browser wallet) + viem |
| Smart contract | Solidity 0.8.24: `contracts/src/SaksiRegistry.sol` |
| Chain | Base Sepolia (chain 84532), explorer `base-sepolia.blockscout.com` |
| Backend | Next.js API routes: relayer (viem wallet client), event indexer, AI endpoints |
| Database | Supabase (PostgreSQL): `supabase/schema.sql`; RLS on, service key only |
| AI | Featherless.ai OpenAI-compatible API, open-weight Qwen3 / DeepSeek, JSON validated with zod |

### <a id="chain"></a>Why Base Sepolia and not Lisk Sepolia

The proposal targeted Lisk Sepolia (chain 4202) and stated the contract is chain-agnostic ("any EVM L2"). Lisk Sepolia was wound down in June 2026 (its RPC hostname no longer resolves and its explorer is offline), so SAKSI is deployed, unchanged, to **Base Sepolia**, another OP Stack L2 testnet.

### Why a blockchain and not a database

The adversary is whoever operates the database: today, the institution being reported. SAKSI needs an append-only timestamp no institution can alter or backdate, verification by any third party without trusting SAKSI, and receipts that still verify if SAKSI disappears. Only hashes, IDs and timestamps go on-chain; personal data lives only in erasable off-chain ciphertext.

## Smart contract

`SaksiRegistry` ([spec](contracts/SPEC.md)):

- `registerInstitution(id, name, taskForce, encPubKey, ackWindow)` / `updateInstitution(...)`: registrar (ministry) only; key rotation never rewrites history
- `submitReport(institutionId, commitment) → reportId`: anyone (the relayer in practice)
- `acknowledge(reportId)`, `setStatus(reportId, Investigating|Resolved|Referred)`: the institution's task-force wallet only
- `escalate(reportId)`: anyone, only if unacknowledged and `block.timestamp ≥ submittedAt + ackWindow`
- Views: `getReport`, `getReports(offset, limit)`, `getInstitution`, `getInstitutionIds`, `isOverdue`, `reportCount`

The contract also accepts EIP-712 signed variants (`acknowledgeBySig`, `setStatusBySig`) as a gasless option for institutions without test ETH; the app itself uses direct wallet transactions.

Demo institutions use shortened windows (3 and 5 minutes) so the escalation rule can be shown live; the third uses the production 7-day window. The UI always shows each institution's window.

## Tests

- `cd contracts && npx hardhat test`: 15 tests (registrar rights, replay protection, the time lock, closing rules, pagination), all passing.
- `contracts/test/SaksiRegistry.t.sol`: the same suite for **Foundry** plus a fuzz test that escalation is impossible before the deadline (`forge test` in `contracts/`). It is included for parity with the proposal's tooling; it was not executed during the final because Foundry could not be installed on the build machine in time.
- End-to-end: report → AI intake → seal → anchor → receipt → tamper test → early escalation rejected by the contract → escalation → ministry decrypt → late acknowledgement → ledger, run locally and on Base Sepolia (`scripts/seed.ts`, `scripts/escalate.ts`).

## Run it locally

```bash
npm install
cd contracts && npm install && npx hardhat test && npx hardhat node   # tests, then a local chain on :8545
```

```bash
cp .env.example .env.local   # fill in FEATHERLESS_API_KEY; generate test keys
LOCAL=1 node --env-file=.env.local scripts/deploy.ts               # deploy + register demo institutions
npm run dev
SEED_BASE_URL=http://localhost:3000 LOCAL=1 node --env-file=.env.local --env-file=.env.development.local scripts/seed.ts
```

Without Supabase variables the dev server stores ciphertext in `.data/store.json`.

## Security and privacy model

- **Confidentiality:** encryption happens in the reporter's browser; servers, relayer and chain only hold ciphertext or hashes. The task force reads a report with its wallet-derived key; the ministry only after escalation.
- **Integrity:** the commitment binds the ciphertext and the block timestamp binds the time; changing one byte breaks both the fingerprint and AES-GCM authentication (try the tamper test on `/verify`).
- **Anonymity:** one-time codes prove membership, not identity. Residual risks (device, network timing, code issuance) are real and are why a pilot needs independent oversight; zero-knowledge membership proofs are on the roadmap.
- **Availability:** if the relayer is down, any wallet can call `submitReport` directly; receipts verify against the public chain even if SAKSI is offline.

## Roadmap (not part of the MVP)

Zero-knowledge membership proofs (e.g. Semaphore) to replace one-time codes · anonymous two-way messaging · mobile PWA · on-premise hosting of the open-weight model · integration with the Kemenkes reporting channel.

## Attribution

Open-source libraries used (per the competition's open-source rule): Next.js, React, Tailwind CSS, viem, wagmi, @tanstack/react-query, @noble/curves and @noble/hashes (Paul Miller), zod, qrcode, jsPDF, @supabase/supabase-js, Hardhat. AI inference by Featherless.ai using open-weight models (Qwen3 by Alibaba Qwen team; DeepSeek-V3.1). Fonts: Fraunces, Inter, JetBrains Mono (Google Fonts, OFL).

Statistics cited on the home page come from the team's Phase 1 proposal and link to their sources.
