// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaksiRegistry
/// @notice Tamper-evident registry for anonymous misconduct reports at campuses and teaching hospitals.
/// @dev Stores only a commitment (hash of the encrypted report), timestamps and the task force's actions.
///      Report content, names and IP addresses never touch the chain. Spec: contracts/SPEC.md.
///      Task-force actions can be signed off-chain (EIP-712) and submitted by a gas-sponsoring relayer,
///      so neither reporters nor task forces need to hold ETH.
contract SaksiRegistry {
    // ---------------------------------------------------------------- types

    enum Status {
        Submitted,
        Acknowledged,
        Investigating,
        Resolved,
        Referred
    }

    struct Institution {
        string name;
        address taskForce; // the institution's Satgas signer
        bytes32 encPubKey; // task force X25519 public key; report keys are wrapped to it in the browser
        uint32 ackWindow; // seconds the task force has to acknowledge (604800 = 7 days)
        bool active;
    }

    struct Report {
        bytes32 institutionId;
        bytes32 commitment; // keccak256(iv ‖ ciphertext ‖ salt), computed in the reporter's browser
        uint40 submittedAt;
        uint40 acknowledgedAt; // 0 = never
        uint40 resolvedAt; // first time status became Resolved or Referred
        uint40 escalatedAt; // 0 = not escalated
        Status status;
    }

    // ---------------------------------------------------------------- EIP-712

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant ACKNOWLEDGE_TYPEHASH = keccak256("Acknowledge(uint256 reportId,uint256 nonce,uint256 deadline)");
    bytes32 public constant SET_STATUS_TYPEHASH =
        keccak256("SetStatus(uint256 reportId,uint8 status,uint256 nonce,uint256 deadline)");
    /// @dev secp256k1n / 2 — signatures with a higher s are malleable and rejected.
    uint256 private constant _HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // ---------------------------------------------------------------- state

    address public registrar; // the supervising ministry
    bytes32 public ministryEncPubKey; // escalated reports are re-wrapped to this key by the reporter
    mapping(bytes32 => bool) public commitmentUsed;
    mapping(address => uint256) public nonces;

    mapping(bytes32 => Institution) private _institutions;
    bytes32[] private _institutionIds;
    Report[] private _reports;

    // ---------------------------------------------------------------- events

    event InstitutionRegistered(bytes32 indexed id, string name, address taskForce, bytes32 encPubKey, uint32 ackWindow);
    event InstitutionUpdated(bytes32 indexed id, address taskForce, bytes32 encPubKey, uint32 ackWindow, bool active);
    event MinistryKeyUpdated(bytes32 key);
    event RegistrarTransferred(address indexed previousRegistrar, address indexed newRegistrar);
    event ReportSubmitted(uint256 indexed reportId, bytes32 indexed institutionId, bytes32 commitment, uint40 submittedAt);
    event Acknowledged(uint256 indexed reportId, address indexed by, uint40 at);
    event StatusChanged(uint256 indexed reportId, Status status, address indexed by, uint40 at);
    event Escalated(uint256 indexed reportId, bytes32 indexed institutionId, uint40 at);

    // ---------------------------------------------------------------- errors

    error NotRegistrar();
    error NotTaskForce();
    error ZeroAddress();
    error InvalidWindow();
    error UnknownInstitution();
    error InstitutionInactive();
    error InstitutionExists();
    error InvalidCommitment();
    error CommitmentUsed();
    error UnknownReport();
    error AlreadyAcknowledged();
    error InvalidStatus();
    error ReportClosed();
    error NotOverdue();
    error AlreadyEscalated();
    error SignatureExpired();
    error InvalidSignature();

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    constructor(bytes32 ministryEncPubKey_) {
        registrar = msg.sender;
        ministryEncPubKey = ministryEncPubKey_;
        emit RegistrarTransferred(address(0), msg.sender);
        emit MinistryKeyUpdated(ministryEncPubKey_);
    }

    // ---------------------------------------------------------------- registrar (ministry)

    function registerInstitution(
        bytes32 id,
        string calldata name,
        address taskForce,
        bytes32 encPubKey,
        uint32 ackWindow
    ) external onlyRegistrar {
        if (_institutions[id].taskForce != address(0)) revert InstitutionExists();
        if (taskForce == address(0)) revert ZeroAddress();
        if (ackWindow == 0) revert InvalidWindow();
        _institutions[id] = Institution(name, taskForce, encPubKey, ackWindow, true);
        _institutionIds.push(id);
        emit InstitutionRegistered(id, name, taskForce, encPubKey, ackWindow);
    }

    /// @notice Rotate a task force's signer or key, change its window, or deactivate it.
    ///         Past reports and actions are unaffected — a compromised key cannot rewrite history.
    function updateInstitution(bytes32 id, address taskForce, bytes32 encPubKey, uint32 ackWindow, bool active)
        external
        onlyRegistrar
    {
        Institution storage inst = _institutions[id];
        if (inst.taskForce == address(0)) revert UnknownInstitution();
        if (taskForce == address(0)) revert ZeroAddress();
        if (ackWindow == 0) revert InvalidWindow();
        inst.taskForce = taskForce;
        inst.encPubKey = encPubKey;
        inst.ackWindow = ackWindow;
        inst.active = active;
        emit InstitutionUpdated(id, taskForce, encPubKey, ackWindow, active);
    }

    function setMinistryEncPubKey(bytes32 key) external onlyRegistrar {
        ministryEncPubKey = key;
        emit MinistryKeyUpdated(key);
    }

    function transferRegistrar(address newRegistrar) external onlyRegistrar {
        if (newRegistrar == address(0)) revert ZeroAddress();
        emit RegistrarTransferred(registrar, newRegistrar);
        registrar = newRegistrar;
    }

    // ---------------------------------------------------------------- reporting (anyone / relayer)

    /// @notice Anchor a sealed report. The block timestamp is the fact that matters:
    ///         "a report with this fingerprint, for this institution, existed at this time".
    function submitReport(bytes32 institutionId, bytes32 commitment) external returns (uint256 reportId) {
        Institution storage inst = _institutions[institutionId];
        if (inst.taskForce == address(0)) revert UnknownInstitution();
        if (!inst.active) revert InstitutionInactive();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (commitmentUsed[commitment]) revert CommitmentUsed();
        commitmentUsed[commitment] = true;

        reportId = _reports.length;
        uint40 t = uint40(block.timestamp);
        _reports.push(Report(institutionId, commitment, t, 0, 0, 0, Status.Submitted));
        emit ReportSubmitted(reportId, institutionId, commitment, t);
    }

    /// @notice Anyone may escalate a report its task force has not acknowledged within the window.
    ///         The institution's inaction becomes public, permanent data.
    function escalate(uint256 reportId) external {
        Report storage r = _report(reportId);
        if (r.acknowledgedAt != 0) revert AlreadyAcknowledged();
        if (r.escalatedAt != 0) revert AlreadyEscalated();
        if (block.timestamp < uint256(r.submittedAt) + _institutions[r.institutionId].ackWindow) revert NotOverdue();
        uint40 t = uint40(block.timestamp);
        r.escalatedAt = t;
        emit Escalated(reportId, r.institutionId, t);
    }

    // ---------------------------------------------------------------- task force

    function acknowledge(uint256 reportId) external {
        Report storage r = _report(reportId);
        if (msg.sender != _institutions[r.institutionId].taskForce) revert NotTaskForce();
        _acknowledge(reportId, r, msg.sender);
    }

    function acknowledgeBySig(uint256 reportId, uint256 deadline, bytes calldata signature) external {
        Report storage r = _report(reportId);
        address taskForce = _institutions[r.institutionId].taskForce;
        _useSignature(
            taskForce, keccak256(abi.encode(ACKNOWLEDGE_TYPEHASH, reportId, nonces[taskForce], deadline)), deadline, signature
        );
        _acknowledge(reportId, r, taskForce);
    }

    function setStatus(uint256 reportId, Status status) external {
        Report storage r = _report(reportId);
        if (msg.sender != _institutions[r.institutionId].taskForce) revert NotTaskForce();
        _setStatus(reportId, r, status, msg.sender);
    }

    function setStatusBySig(uint256 reportId, Status status, uint256 deadline, bytes calldata signature) external {
        Report storage r = _report(reportId);
        address taskForce = _institutions[r.institutionId].taskForce;
        _useSignature(
            taskForce,
            keccak256(abi.encode(SET_STATUS_TYPEHASH, reportId, uint8(status), nonces[taskForce], deadline)),
            deadline,
            signature
        );
        _setStatus(reportId, r, status, taskForce);
    }

    // ---------------------------------------------------------------- views

    function reportCount() external view returns (uint256) {
        return _reports.length;
    }

    function getReport(uint256 id) external view returns (Report memory) {
        return _report(id);
    }

    function getReports(uint256 offset, uint256 limit) external view returns (Report[] memory page) {
        uint256 total = _reports.length;
        if (offset >= total) return new Report[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new Report[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _reports[i];
        }
    }

    function getInstitution(bytes32 id) external view returns (Institution memory) {
        return _institutions[id];
    }

    function getInstitutionIds() external view returns (bytes32[] memory) {
        return _institutionIds;
    }

    function isOverdue(uint256 id) external view returns (bool) {
        Report storage r = _report(id);
        return r.acknowledgedAt == 0 && block.timestamp >= uint256(r.submittedAt) + _institutions[r.institutionId].ackWindow;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(_DOMAIN_TYPEHASH, keccak256("SAKSI"), keccak256("1"), block.chainid, address(this)));
    }

    // ---------------------------------------------------------------- internals

    function _report(uint256 id) private view returns (Report storage) {
        if (id >= _reports.length) revert UnknownReport();
        return _reports[id];
    }

    function _acknowledge(uint256 reportId, Report storage r, address by) private {
        if (r.acknowledgedAt != 0) revert AlreadyAcknowledged();
        _markAcknowledged(reportId, r, by);
    }

    function _markAcknowledged(uint256 reportId, Report storage r, address by) private {
        uint40 t = uint40(block.timestamp);
        r.acknowledgedAt = t;
        if (r.status == Status.Submitted) r.status = Status.Acknowledged;
        emit Acknowledged(reportId, by, t);
    }

    function _setStatus(uint256 reportId, Report storage r, Status status, address by) private {
        if (status != Status.Investigating && status != Status.Resolved && status != Status.Referred) {
            revert InvalidStatus();
        }
        if (r.status == Status.Resolved || r.status == Status.Referred) revert ReportClosed();
        if (r.acknowledgedAt == 0) _markAcknowledged(reportId, r, by);

        uint40 t = uint40(block.timestamp);
        r.status = status;
        if ((status == Status.Resolved || status == Status.Referred) && r.resolvedAt == 0) r.resolvedAt = t;
        emit StatusChanged(reportId, status, by, t);
    }

    function _useSignature(address signer, bytes32 structHash, uint256 deadline, bytes calldata signature) private {
        if (block.timestamp > deadline) revert SignatureExpired();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
        if (_recover(digest, signature) != signer) revert InvalidSignature();
        nonces[signer]++;
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 sigR = bytes32(signature[0:32]);
        bytes32 sigS = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (uint256(sigS) > _HALF_N || (v != 27 && v != 28)) revert InvalidSignature();
        signer = ecrecover(digest, v, sigR, sigS);
        if (signer == address(0)) revert InvalidSignature();
    }
}
