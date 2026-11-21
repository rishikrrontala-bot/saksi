// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SaksiRegistry} from "../src/SaksiRegistry.sol";

/// Foundry suite for SaksiRegistry (run: `forge test` in contracts/).
contract SaksiRegistryTest is Test {
    SaksiRegistry internal reg;

    bytes32 internal constant RSUP = keccak256("RSUP-DEMO");
    uint32 internal constant WEEK = 7 days;
    uint256 internal constant TF_PK = 0xA11CE;
    uint256 internal constant STRANGER_PK = 0xB0B;
    address internal tf;
    address internal relayer = address(0xBEEF);
    address internal other = address(0xCAFE);

    event ReportSubmitted(uint256 indexed reportId, bytes32 indexed institutionId, bytes32 commitment, uint40 submittedAt);
    event Escalated(uint256 indexed reportId, bytes32 indexed institutionId, uint40 at);

    function setUp() public {
        tf = vm.addr(TF_PK);
        reg = new SaksiRegistry(bytes32(uint256(0xabc)));
        reg.registerInstitution(RSUP, "RSUP Demo Hospital", tf, bytes32(uint256(0x1234)), WEEK);
    }

    // ------------------------------------------------------------ helpers

    function _submit(bytes32 c) internal returns (uint256) {
        vm.prank(relayer);
        return reg.submitReport(RSUP, c);
    }

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", reg.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _ackSig(uint256 pk, uint256 id, uint256 nonce, uint256 deadline) internal view returns (bytes memory) {
        return _sign(pk, keccak256(abi.encode(reg.ACKNOWLEDGE_TYPEHASH(), id, nonce, deadline)));
    }

    function _statusSig(uint256 pk, uint256 id, SaksiRegistry.Status s, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, keccak256(abi.encode(reg.SET_STATUS_TYPEHASH(), id, uint8(s), nonce, deadline)));
    }

    // ------------------------------------------------------------ registrar

    function test_OnlyRegistrarCanAdminister() public {
        vm.startPrank(other);
        vm.expectRevert(SaksiRegistry.NotRegistrar.selector);
        reg.registerInstitution(keccak256("X"), "X", tf, bytes32(0), WEEK);
        vm.expectRevert(SaksiRegistry.NotRegistrar.selector);
        reg.updateInstitution(RSUP, tf, bytes32(0), WEEK, false);
        vm.expectRevert(SaksiRegistry.NotRegistrar.selector);
        reg.setMinistryEncPubKey(bytes32(uint256(9)));
        vm.expectRevert(SaksiRegistry.NotRegistrar.selector);
        reg.transferRegistrar(other);
        vm.stopPrank();
    }

    function test_RegistrationValidation() public {
        vm.expectRevert(SaksiRegistry.InstitutionExists.selector);
        reg.registerInstitution(RSUP, "dup", tf, bytes32(0), WEEK);
        vm.expectRevert(SaksiRegistry.ZeroAddress.selector);
        reg.registerInstitution(keccak256("Z"), "Z", address(0), bytes32(0), WEEK);
        vm.expectRevert(SaksiRegistry.InvalidWindow.selector);
        reg.registerInstitution(keccak256("Z"), "Z", tf, bytes32(0), 0);

        SaksiRegistry.Institution memory inst = reg.getInstitution(RSUP);
        assertEq(inst.name, "RSUP Demo Hospital");
        assertEq(inst.taskForce, tf);
        assertEq(inst.ackWindow, WEEK);
        assertTrue(inst.active);
        assertEq(reg.getInstitutionIds().length, 1);
        assertEq(reg.ministryEncPubKey(), bytes32(uint256(0xabc)));
    }

    function test_TransferRegistrar() public {
        reg.transferRegistrar(other);
        assertEq(reg.registrar(), other);
    }

    // ------------------------------------------------------------ submitReport

    function test_SubmitAnchorsWithIncrementingIds() public {
        vm.expectEmit(true, true, false, true);
        emit ReportSubmitted(0, RSUP, bytes32(uint256(1)), uint40(block.timestamp));
        assertEq(_submit(bytes32(uint256(1))), 0);
        assertEq(_submit(bytes32(uint256(2))), 1);
        assertEq(reg.reportCount(), 2);
        SaksiRegistry.Report memory r = reg.getReport(1);
        assertEq(r.commitment, bytes32(uint256(2)));
        assertEq(r.institutionId, RSUP);
        assertEq(uint8(r.status), uint8(SaksiRegistry.Status.Submitted));
        assertEq(r.submittedAt, block.timestamp);
        assertTrue(reg.commitmentUsed(bytes32(uint256(2))));
    }

    function test_SubmitRejectsBadInput() public {
        vm.startPrank(relayer);
        vm.expectRevert(SaksiRegistry.UnknownInstitution.selector);
        reg.submitReport(keccak256("nope"), bytes32(uint256(1)));
        vm.expectRevert(SaksiRegistry.InvalidCommitment.selector);
        reg.submitReport(RSUP, bytes32(0));
        reg.submitReport(RSUP, bytes32(uint256(1)));
        vm.expectRevert(SaksiRegistry.CommitmentUsed.selector);
        reg.submitReport(RSUP, bytes32(uint256(1)));
        vm.stopPrank();

        reg.updateInstitution(RSUP, tf, bytes32(uint256(0x1234)), WEEK, false);
        vm.prank(relayer);
        vm.expectRevert(SaksiRegistry.InstitutionInactive.selector);
        reg.submitReport(RSUP, bytes32(uint256(2)));
    }

    function test_UnknownReport() public {
        vm.expectRevert(SaksiRegistry.UnknownReport.selector);
        reg.getReport(0);
        vm.expectRevert(SaksiRegistry.UnknownReport.selector);
        reg.escalate(5);
    }

    // ------------------------------------------------------------ acknowledge

    function test_AcknowledgeOnlyTaskForceOnce() public {
        _submit(bytes32(uint256(1)));
        vm.prank(other);
        vm.expectRevert(SaksiRegistry.NotTaskForce.selector);
        reg.acknowledge(0);

        vm.prank(tf);
        reg.acknowledge(0);
        SaksiRegistry.Report memory r = reg.getReport(0);
        assertEq(uint8(r.status), uint8(SaksiRegistry.Status.Acknowledged));
        assertEq(r.acknowledgedAt, block.timestamp);

        vm.prank(tf);
        vm.expectRevert(SaksiRegistry.AlreadyAcknowledged.selector);
        reg.acknowledge(0);
    }

    function test_AcknowledgeBySigIsReplayProtected() public {
        _submit(bytes32(uint256(1)));
        _submit(bytes32(uint256(2)));
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _ackSig(TF_PK, 0, 0, deadline);
        vm.prank(relayer);
        reg.acknowledgeBySig(0, deadline, sig);
        assertEq(uint8(reg.getReport(0).status), uint8(SaksiRegistry.Status.Acknowledged));
        assertEq(reg.nonces(tf), 1);

        vm.prank(relayer); // same signature, other report: nonce moved on
        vm.expectRevert(SaksiRegistry.InvalidSignature.selector);
        reg.acknowledgeBySig(1, deadline, sig);
    }

    function test_AcknowledgeBySigRejectsStrangerExpiredAndMalformed() public {
        _submit(bytes32(uint256(1)));
        uint256 deadline = block.timestamp + 600;
        vm.expectRevert(SaksiRegistry.InvalidSignature.selector);
        reg.acknowledgeBySig(0, deadline, _ackSig(STRANGER_PK, 0, 0, deadline));

        uint256 past = block.timestamp - 1;
        vm.expectRevert(SaksiRegistry.SignatureExpired.selector);
        reg.acknowledgeBySig(0, past, _ackSig(TF_PK, 0, 0, past));

        vm.expectRevert(SaksiRegistry.InvalidSignature.selector);
        reg.acknowledgeBySig(0, deadline, hex"1234");
    }

    // ------------------------------------------------------------ setStatus

    function test_SetStatusFlow() public {
        _submit(bytes32(uint256(1)));
        vm.prank(tf);
        reg.setStatus(0, SaksiRegistry.Status.Investigating);
        SaksiRegistry.Report memory r = reg.getReport(0);
        assertEq(uint8(r.status), uint8(SaksiRegistry.Status.Investigating));
        assertGt(r.acknowledgedAt, 0); // implicit acknowledgement
        assertEq(r.resolvedAt, 0);

        vm.warp(block.timestamp + 3 days);
        uint256 deadline = block.timestamp + 600;
        reg.setStatusBySig(0, SaksiRegistry.Status.Resolved, deadline, _statusSig(TF_PK, 0, SaksiRegistry.Status.Resolved, 0, deadline));
        r = reg.getReport(0);
        assertEq(uint8(r.status), uint8(SaksiRegistry.Status.Resolved));
        assertEq(r.resolvedAt, block.timestamp);

        vm.prank(tf);
        vm.expectRevert(SaksiRegistry.ReportClosed.selector);
        reg.setStatus(0, SaksiRegistry.Status.Investigating);
    }

    function test_SetStatusRejectsInvalidTargetsAndStrangers() public {
        _submit(bytes32(uint256(1)));
        vm.startPrank(tf);
        vm.expectRevert(SaksiRegistry.InvalidStatus.selector);
        reg.setStatus(0, SaksiRegistry.Status.Submitted);
        vm.expectRevert(SaksiRegistry.InvalidStatus.selector);
        reg.setStatus(0, SaksiRegistry.Status.Acknowledged);
        vm.stopPrank();
        vm.prank(other);
        vm.expectRevert(SaksiRegistry.NotTaskForce.selector);
        reg.setStatus(0, SaksiRegistry.Status.Resolved);
    }

    function test_ReferredCountsAsResolution() public {
        _submit(bytes32(uint256(1)));
        vm.prank(tf);
        reg.setStatus(0, SaksiRegistry.Status.Referred);
        assertGt(reg.getReport(0).resolvedAt, 0);
    }

    // ------------------------------------------------------------ escalate (the 7-day rule)

    function test_EscalateOnlyAfterWindow() public {
        _submit(bytes32(uint256(1)));
        assertFalse(reg.isOverdue(0));
        vm.prank(other);
        vm.expectRevert(SaksiRegistry.NotOverdue.selector);
        reg.escalate(0);

        vm.warp(block.timestamp + WEEK - 1);
        vm.expectRevert(SaksiRegistry.NotOverdue.selector);
        reg.escalate(0);

        vm.warp(block.timestamp + 1);
        assertTrue(reg.isOverdue(0));
        vm.expectEmit(true, true, false, true);
        emit Escalated(0, RSUP, uint40(block.timestamp));
        vm.prank(other);
        reg.escalate(0);
        assertEq(reg.getReport(0).escalatedAt, block.timestamp);

        vm.expectRevert(SaksiRegistry.AlreadyEscalated.selector);
        reg.escalate(0);
    }

    function test_AcknowledgedCannotEscalate_LateAckRecorded() public {
        _submit(bytes32(uint256(1)));
        _submit(bytes32(uint256(2)));
        vm.prank(tf);
        reg.acknowledge(0);
        vm.warp(block.timestamp + WEEK);
        vm.expectRevert(SaksiRegistry.AlreadyAcknowledged.selector);
        reg.escalate(0);

        reg.escalate(1);
        vm.prank(tf);
        reg.acknowledge(1); // late acknowledgement is still recorded
        SaksiRegistry.Report memory r = reg.getReport(1);
        assertGt(r.escalatedAt, 0);
        assertGe(r.acknowledgedAt, r.submittedAt + WEEK);
    }

    /// Fuzz: no matter how long before the deadline, escalation is impossible.
    function testFuzz_NoEscalationBeforeWindow(uint256 dt) public {
        dt = bound(dt, 0, WEEK - 1);
        _submit(bytes32(uint256(1)));
        vm.warp(block.timestamp + dt);
        vm.expectRevert(SaksiRegistry.NotOverdue.selector);
        reg.escalate(0);
    }

    // ------------------------------------------------------------ views

    function test_GetReportsPaginationClamps() public {
        for (uint256 i = 1; i <= 5; i++) _submit(bytes32(i));
        assertEq(reg.getReports(0, 2).length, 2);
        SaksiRegistry.Report[] memory tail = reg.getReports(3, 10);
        assertEq(tail.length, 2);
        assertEq(tail[0].commitment, bytes32(uint256(4)));
        assertEq(tail[1].commitment, bytes32(uint256(5)));
        assertEq(reg.getReports(5, 10).length, 0);
    }
}
