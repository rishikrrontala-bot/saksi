const assert = require("node:assert/strict");
const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { keccak256, toHex, stringToHex, pad } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const Status = { Submitted: 0, Acknowledged: 1, Investigating: 2, Resolved: 3, Referred: 4 };
const DAY = 86400;
const WEEK = 7 * DAY;
const id = (s) => keccak256(stringToHex(s));
const h = (n) => pad(toHex(n), { size: 32 });

// The task force signs off-chain with a plain key (no ETH); a relayer submits.
const taskForce = privateKeyToAccount("0x" + "11".repeat(32));
const stranger = privateKeyToAccount("0x" + "22".repeat(32));

async function expectRevert(promise, errorName) {
  try {
    await promise;
  } catch (e) {
    const text = [e.shortMessage, e.message, e.cause?.data?.errorName, e.details].join(" ");
    assert.ok(text.includes(errorName), `expected ${errorName}, got: ${e.shortMessage || e.message}`);
    return;
  }
  assert.fail(`expected revert ${errorName}`);
}

async function deploy() {
  const [registrar, relayer, other] = await hre.viem.getWalletClients();
  const registry = await hre.viem.deployContract("SaksiRegistry", [h(0xabc)]);
  const publicClient = await hre.viem.getPublicClient();
  const RSUP = id("RSUP-DEMO");
  await registry.write.registerInstitution([RSUP, "RSUP Demo Hospital", taskForce.address, h(0x1234), WEEK]);
  const asRelayer = await hre.viem.getContractAt("SaksiRegistry", registry.address, { client: { wallet: relayer } });
  const asOther = await hre.viem.getContractAt("SaksiRegistry", registry.address, { client: { wallet: other } });
  return { registry, asRelayer, asOther, registrar, relayer, other, publicClient, RSUP };
}

async function withReport() {
  const ctx = await deploy();
  await ctx.asRelayer.write.submitReport([ctx.RSUP, h(1)]);
  return ctx;
}

async function sign(registry, account, primaryType, message) {
  const chainId = await (await hre.viem.getPublicClient()).getChainId();
  const types =
    primaryType === "Acknowledge"
      ? { Acknowledge: [{ name: "reportId", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] }
      : {
          SetStatus: [
            { name: "reportId", type: "uint256" },
            { name: "status", type: "uint8" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        };
  return account.signTypedData({
    domain: { name: "SAKSI", version: "1", chainId, verifyingContract: registry.address },
    types,
    primaryType,
    message,
  });
}

const deadlineIn = async (s) => BigInt((await time.latest()) + s);

describe("SaksiRegistry", () => {
  describe("registrar", () => {
    it("only the registrar can register, update, rotate the ministry key or transfer", async () => {
      const { asOther, RSUP } = await loadFixture(deploy);
      await expectRevert(asOther.write.registerInstitution([id("X"), "X", taskForce.address, h(1), WEEK]), "NotRegistrar");
      await expectRevert(asOther.write.updateInstitution([RSUP, taskForce.address, h(1), WEEK, false]), "NotRegistrar");
      await expectRevert(asOther.write.setMinistryEncPubKey([h(9)]), "NotRegistrar");
      await expectRevert(asOther.write.transferRegistrar([stranger.address]), "NotRegistrar");
    });

    it("validates registrations and stores institutions", async () => {
      const { registry, RSUP } = await loadFixture(deploy);
      await expectRevert(registry.write.registerInstitution([RSUP, "dup", taskForce.address, h(1), WEEK]), "InstitutionExists");
      await expectRevert(
        registry.write.registerInstitution([id("Z"), "Z", "0x0000000000000000000000000000000000000000", h(1), WEEK]),
        "ZeroAddress"
      );
      await expectRevert(registry.write.registerInstitution([id("Z"), "Z", taskForce.address, h(1), 0]), "InvalidWindow");
      await expectRevert(registry.write.registerInstitution([id("Z"), "Z", taskForce.address, h(0), WEEK]), "InvalidKey");
      await expectRevert(registry.write.setMinistryEncPubKey([h(0)]), "InvalidKey");
      const inst = await registry.read.getInstitution([RSUP]);
      assert.equal(inst.name, "RSUP Demo Hospital");
      assert.equal(inst.taskForce, taskForce.address);
      assert.equal(inst.ackWindow, WEEK);
      assert.equal(inst.active, true);
      assert.deepEqual(await registry.read.getInstitutionIds(), [RSUP]);
      assert.equal(await registry.read.ministryEncPubKey(), h(0xabc));
    });

    it("transfers the registrar role", async () => {
      const { registry, other } = await loadFixture(deploy);
      await registry.write.transferRegistrar([other.account.address]);
      assert.equal((await registry.read.registrar()).toLowerCase(), other.account.address.toLowerCase());
    });
  });

  describe("submitReport", () => {
    it("anchors commitments with incrementing ids and a block timestamp", async () => {
      const { registry, asRelayer, RSUP, publicClient } = await loadFixture(deploy);
      await asRelayer.write.submitReport([RSUP, h(1)]);
      await asRelayer.write.submitReport([RSUP, h(2)]);
      assert.equal(await registry.read.reportCount(), 2n);
      const r = await registry.read.getReport([1n]);
      assert.equal(r.commitment, h(2));
      assert.equal(r.institutionId, RSUP);
      assert.equal(r.status, Status.Submitted);
      assert.equal(BigInt(r.submittedAt), BigInt(await time.latest()));
      const events = await registry.getEvents.ReportSubmitted({}, { fromBlock: 0n });
      assert.equal(events.length, 2);
      assert.equal(events[1].args.reportId, 1n);
      assert.equal(await registry.read.commitmentUsed([h(2)]), true);
      assert.ok(publicClient);
    });

    it("rejects unknown/inactive institutions and zero or duplicate commitments", async () => {
      const { registry, asRelayer, RSUP } = await loadFixture(deploy);
      await expectRevert(asRelayer.write.submitReport([id("nope"), h(1)]), "UnknownInstitution");
      await expectRevert(asRelayer.write.submitReport([RSUP, h(0)]), "InvalidCommitment");
      await asRelayer.write.submitReport([RSUP, h(1)]);
      await expectRevert(asRelayer.write.submitReport([RSUP, h(1)]), "CommitmentUsed");
      await registry.write.updateInstitution([RSUP, taskForce.address, h(0x1234), WEEK, false]);
      await expectRevert(asRelayer.write.submitReport([RSUP, h(2)]), "InstitutionInactive");
    });

    it("reverts UnknownReport for out-of-range ids", async () => {
      const { registry } = await loadFixture(deploy);
      await expectRevert(registry.read.getReport([0n]), "UnknownReport");
      await expectRevert(registry.write.escalate([5n]), "UnknownReport");
    });
  });

  describe("acknowledge", () => {
    it("direct call: only the institution's task force, only once", async () => {
      const { asOther, registry, RSUP, other } = await loadFixture(withReport);
      await expectRevert(asOther.write.acknowledge([0n]), "NotTaskForce");
      // make `other` the task force and acknowledge directly
      await registry.write.updateInstitution([RSUP, other.account.address, h(0x1234), WEEK, true]);
      await asOther.write.acknowledge([0n]);
      const r = await registry.read.getReport([0n]);
      assert.equal(r.status, Status.Acknowledged);
      assert.equal(BigInt(r.acknowledgedAt), BigInt(await time.latest()));
      await expectRevert(asOther.write.acknowledge([0n]), "AlreadyAcknowledged");
    });

    it("by signature: gasless, relayed by anyone, nonce-protected, deadline-bound", async () => {
      const { registry, asRelayer } = await loadFixture(withReport);
      const deadline = await deadlineIn(600);
      const sig = await sign(registry, taskForce, "Acknowledge", { reportId: 0n, nonce: 0n, deadline });
      await asRelayer.write.acknowledgeBySig([0n, deadline, sig]);
      assert.equal((await registry.read.getReport([0n])).status, Status.Acknowledged);
      assert.equal(await registry.read.nonces([taskForce.address]), 1n);
      const ev = await registry.getEvents.Acknowledged({}, { fromBlock: 0n });
      assert.equal(ev[0].args.by, taskForce.address);
      // replay of the same signature fails (nonce moved on)
      await asRelayer.write.submitReport([(await registry.read.getReport([0n])).institutionId, h(2)]);
      await expectRevert(asRelayer.write.acknowledgeBySig([1n, deadline, sig]), "InvalidSignature");
    });

    it("by signature: rejects a stranger's signature and expired deadlines", async () => {
      const { registry, asRelayer } = await loadFixture(withReport);
      const deadline = await deadlineIn(600);
      const bad = await sign(registry, stranger, "Acknowledge", { reportId: 0n, nonce: 0n, deadline });
      await expectRevert(asRelayer.write.acknowledgeBySig([0n, deadline, bad]), "InvalidSignature");
      const past = await deadlineIn(-1);
      const late = await sign(registry, taskForce, "Acknowledge", { reportId: 0n, nonce: 0n, deadline: past });
      await expectRevert(asRelayer.write.acknowledgeBySig([0n, past, late]), "SignatureExpired");
      await expectRevert(asRelayer.write.acknowledgeBySig([0n, deadline, "0x1234"]), "InvalidSignature");
    });
  });

  describe("setStatus", () => {
    it("implicitly acknowledges, records resolution time, then closes the report", async () => {
      const { registry, asRelayer } = await loadFixture(withReport);
      let deadline = await deadlineIn(600);
      let sig = await sign(registry, taskForce, "SetStatus", { reportId: 0n, status: Status.Investigating, nonce: 0n, deadline });
      await asRelayer.write.setStatusBySig([0n, Status.Investigating, deadline, sig]);
      let r = await registry.read.getReport([0n]);
      assert.equal(r.status, Status.Investigating);
      assert.ok(r.acknowledgedAt > 0);
      assert.equal(r.resolvedAt, 0);

      await time.increase(3 * DAY);
      deadline = await deadlineIn(600);
      sig = await sign(registry, taskForce, "SetStatus", { reportId: 0n, status: Status.Resolved, nonce: 1n, deadline });
      await asRelayer.write.setStatusBySig([0n, Status.Resolved, deadline, sig]);
      r = await registry.read.getReport([0n]);
      assert.equal(r.status, Status.Resolved);
      assert.equal(BigInt(r.resolvedAt), BigInt(await time.latest()));

      deadline = await deadlineIn(600);
      sig = await sign(registry, taskForce, "SetStatus", { reportId: 0n, status: Status.Investigating, nonce: 2n, deadline });
      await expectRevert(asRelayer.write.setStatusBySig([0n, Status.Investigating, deadline, sig]), "ReportClosed");
    });

    it("rejects Submitted/Acknowledged as targets and non-task-force callers", async () => {
      const { registry, asRelayer, asOther } = await loadFixture(withReport);
      const deadline = await deadlineIn(600);
      for (const s of [Status.Submitted, Status.Acknowledged]) {
        const sig = await sign(registry, taskForce, "SetStatus", { reportId: 0n, status: s, nonce: 0n, deadline });
        await expectRevert(asRelayer.write.setStatusBySig([0n, s, deadline, sig]), "InvalidStatus");
      }
      await expectRevert(asOther.write.setStatus([0n, Status.Resolved]), "NotTaskForce");
    });

    it("Referred also counts as resolution", async () => {
      const { registry, asRelayer } = await loadFixture(withReport);
      const deadline = await deadlineIn(600);
      const sig = await sign(registry, taskForce, "SetStatus", { reportId: 0n, status: Status.Referred, nonce: 0n, deadline });
      await asRelayer.write.setStatusBySig([0n, Status.Referred, deadline, sig]);
      const r = await registry.read.getReport([0n]);
      assert.equal(r.status, Status.Referred);
      assert.ok(r.resolvedAt > 0);
    });
  });

  describe("escalate (the 7-day rule)", () => {
    it("is impossible before the window and open to anyone after it", async () => {
      const { registry, asOther } = await loadFixture(withReport);
      assert.equal(await registry.read.isOverdue([0n]), false);
      await expectRevert(asOther.write.escalate([0n]), "NotOverdue");
      await time.increase(WEEK - 10);
      await expectRevert(asOther.write.escalate([0n]), "NotOverdue");
      await time.increase(10);
      assert.equal(await registry.read.isOverdue([0n]), true);
      await asOther.write.escalate([0n]);
      const r = await registry.read.getReport([0n]);
      assert.equal(BigInt(r.escalatedAt), BigInt(await time.latest()));
      await expectRevert(asOther.write.escalate([0n]), "AlreadyEscalated");
    });

    it("cannot escalate an acknowledged report; a late acknowledgement after escalation is still recorded", async () => {
      const { registry, asRelayer, asOther, RSUP } = await loadFixture(withReport);
      await asRelayer.write.submitReport([RSUP, h(2)]);
      let deadline = await deadlineIn(WEEK * 2);
      let sig = await sign(registry, taskForce, "Acknowledge", { reportId: 0n, nonce: 0n, deadline });
      await asRelayer.write.acknowledgeBySig([0n, deadline, sig]);
      await time.increase(WEEK);
      await expectRevert(asOther.write.escalate([0n]), "AlreadyAcknowledged");

      await asOther.write.escalate([1n]);
      deadline = await deadlineIn(600);
      sig = await sign(registry, taskForce, "Acknowledge", { reportId: 1n, nonce: 1n, deadline });
      await asRelayer.write.acknowledgeBySig([1n, deadline, sig]);
      const r = await registry.read.getReport([1n]);
      assert.ok(r.escalatedAt > 0 && r.acknowledgedAt > r.submittedAt + WEEK - 1);
    });
  });

  describe("views", () => {
    it("paginates reports with clamping", async () => {
      const { registry, asRelayer, RSUP } = await loadFixture(deploy);
      for (let i = 1; i <= 5; i++) await asRelayer.write.submitReport([RSUP, h(i)]);
      assert.equal((await registry.read.getReports([0n, 2n])).length, 2);
      const tail = await registry.read.getReports([3n, 10n]);
      assert.deepEqual(tail.map((r) => r.commitment), [h(4), h(5)]);
      assert.equal((await registry.read.getReports([5n, 10n])).length, 0);
    });
  });
});
