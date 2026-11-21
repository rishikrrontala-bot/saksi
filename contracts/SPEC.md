# SaksiRegistry — contract spec (source of truth for the app's ABI)

Solidity ^0.8.24, Foundry. No OpenZeppelin: minimal inline EIP-712 + `ecrecover`.
On-chain data per report: two 32-byte hashes, four timestamps, a status byte. **No content, no names, no IPs.**

## Types

```solidity
enum Status { Submitted, Acknowledged, Investigating, Resolved, Referred } // 0..4

struct Institution {
    string  name;
    address taskForce;   // the institution's Satgas signer
    bytes32 encPubKey;   // task force X25519 public key (reports' AES keys are wrapped to it)
    uint32  ackWindow;   // seconds; 604800 (7 days) in production, short for demo institutions
    bool    active;
}

struct Report {
    bytes32 institutionId;
    bytes32 commitment;     // keccak256(iv ‖ ciphertext ‖ salt), computed in the reporter's browser
    uint40  submittedAt;
    uint40  acknowledgedAt; // 0 = never
    uint40  resolvedAt;     // first time status became Resolved or Referred; 0 = open
    uint40  escalatedAt;    // 0 = not escalated
    Status  status;
}
```

## State

- `address public registrar` — the ministry; `msg.sender` in the constructor
- `bytes32 public ministryEncPubKey` — constructor argument
- `mapping(bytes32 => bool) public commitmentUsed`
- `mapping(address => uint256) public nonces` — per task-force signer, for EIP-712
- internal: institutions mapping, institution id list, `Report[]`

## Functions

Registrar only (`NotRegistrar`):
- `registerInstitution(bytes32 id, string name, address taskForce, bytes32 encPubKey, uint32 ackWindow)` — reverts `InstitutionExists`, `ZeroAddress`, `InvalidWindow` (0), `InvalidKey` (zero key). Emits `InstitutionRegistered`.
- `updateInstitution(bytes32 id, address taskForce, bytes32 encPubKey, uint32 ackWindow, bool active)` — key rotation / deactivation. Emits `InstitutionUpdated`.
- `setMinistryEncPubKey(bytes32 key)` — reverts `InvalidKey` for a zero key (also checked in the constructor). Emits `MinistryKeyUpdated`.
- `transferRegistrar(address newRegistrar)` — emits `RegistrarTransferred`.

Anyone (in practice the gas-sponsoring relayer):
- `submitReport(bytes32 institutionId, bytes32 commitment) returns (uint256 reportId)` — institution must exist (`UnknownInstitution`) and be active (`InstitutionInactive`); commitment non-zero (`InvalidCommitment`) and unused (`CommitmentUsed`). `reportId` = index in the reports array, starting at 0. Emits `ReportSubmitted`.
- `escalate(uint256 reportId)` — only if `acknowledgedAt == 0` (`AlreadyAcknowledged`), not escalated (`AlreadyEscalated`), and `block.timestamp >= submittedAt + ackWindow` (`NotOverdue`). Sets `escalatedAt`. Emits `Escalated`. A task force may still acknowledge after escalation (the late ack is recorded).

Task force of the report's institution — direct call (`NotTaskForce`) or gasless EIP-712 signature submitted by anyone:
- `acknowledge(uint256 reportId)` / `acknowledgeBySig(uint256 reportId, uint256 deadline, bytes signature)` — sets `acknowledgedAt`, status `Submitted → Acknowledged`. Reverts `AlreadyAcknowledged`. Emits `Acknowledged`.
- `setStatus(uint256 reportId, Status status)` / `setStatusBySig(uint256 reportId, Status status, uint256 deadline, bytes signature)` — `status ∈ {Investigating, Resolved, Referred}` else `InvalidStatus`; reverts `ReportClosed` if current status is Resolved or Referred; implicitly acknowledges first if `acknowledgedAt == 0` (emits `Acknowledged` too); sets `resolvedAt` when moving to Resolved/Referred. Emits `StatusChanged`.

All report functions revert `UnknownReport` for an out-of-range id.

## EIP-712

- Domain: `name = "SAKSI"`, `version = "1"`, `chainId = block.chainid`, `verifyingContract = address(this)`. Expose `DOMAIN_SEPARATOR()`.
- `Acknowledge(uint256 reportId,uint256 nonce,uint256 deadline)`
- `SetStatus(uint256 reportId,uint8 status,uint256 nonce,uint256 deadline)`
- `nonce = nonces[taskForce]`, incremented on use. `SignatureExpired` if `block.timestamp > deadline`. `InvalidSignature` if length ≠ 65, `v ∉ {27,28}`, high-s, or recovered ≠ institution's taskForce.

## Views

- `reportCount() → uint256`
- `getReport(uint256 id) → Report`
- `getReports(uint256 offset, uint256 limit) → Report[]` (clamped to the end; empty if offset ≥ count)
- `getInstitution(bytes32 id) → Institution`
- `getInstitutionIds() → bytes32[]`
- `isOverdue(uint256 id) → bool` — `acknowledgedAt == 0 && block.timestamp >= submittedAt + ackWindow`

## Events

```solidity
event InstitutionRegistered(bytes32 indexed id, string name, address taskForce, bytes32 encPubKey, uint32 ackWindow);
event InstitutionUpdated(bytes32 indexed id, address taskForce, bytes32 encPubKey, uint32 ackWindow, bool active);
event MinistryKeyUpdated(bytes32 key);
event RegistrarTransferred(address indexed previousRegistrar, address indexed newRegistrar);
event ReportSubmitted(uint256 indexed reportId, bytes32 indexed institutionId, bytes32 commitment, uint40 submittedAt);
event Acknowledged(uint256 indexed reportId, address indexed by, uint40 at);
event StatusChanged(uint256 indexed reportId, Status status, address indexed by, uint40 at);
event Escalated(uint256 indexed reportId, bytes32 indexed institutionId, uint40 at);
```
