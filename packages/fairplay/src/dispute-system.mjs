/**
 * Nizalo Fair Play Infrastructure - LAYER 6: DISPUTE SYSTEM.
 *
 * Implements:
 * 1. Player reporting categories:
 *    - ILLEGAL_MOVE
 *    - DISCONNECT
 *    - WRONG_RESULT
 *    - SUSPICIOUS_BEHAVIOR
 *    - SETTLEMENT_ISSUE
 * 2. Immutable Dispute Record:
 *    - Dispute ID
 *    - Match ID
 *    - Evidence (Replay, logs, telemetry, statements)
 *    - Status (OPEN -> UNDER_REVIEW -> RESOLVED / REJECTED -> APPEALED -> CLOSED)
 *    - Reviewer (Human admin)
 *    - Decision & Mandatory Decision Reason
 *    - Audit Trail
 * 3. Two-Admin Independence: Appeals must be decided by a different admin than the initial reviewer.
 */

import { randomUUID } from "node:crypto";

export const DisputeCategory = {
  ILLEGAL_MOVE: "ILLEGAL_MOVE",
  DISCONNECT: "DISCONNECT",
  WRONG_RESULT: "WRONG_RESULT",
  SUSPICIOUS_BEHAVIOR: "SUSPICIOUS_BEHAVIOR",
  SETTLEMENT_ISSUE: "SETTLEMENT_ISSUE",
};

export const DisputeStatus = {
  OPEN: "OPEN",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
  APPEALED: "APPEALED",
  CLOSED: "CLOSED",
};

export const DisputeDecision = {
  UPHELD_REFUND: "UPHELD_REFUND",                 // Void match, 100% full refund
  UPHELD_REVERSE_RESULT: "UPHELD_REVERSE_RESULT", // Correct outcome to innocent player
  DISMISSED: "DISMISSED",                         // Unfounded, original result stands
  SPLIT_SETTLEMENT: "SPLIT_SETTLEMENT",           // Technical glitch, split pot
};

export class DisputeRecord {
  constructor({
    disputeId = `disp_${randomUUID()}`,
    matchId,
    reporterId,
    category,
    evidence = {},
    createdAt = new Date().toISOString(),
  }) {
    if (!matchId) throw new Error("matchId required for DisputeRecord");
    if (!reporterId) throw new Error("reporterId required for DisputeRecord");
    if (!DisputeCategory[category]) {
      throw new Error(`Invalid dispute category: ${category}`);
    }

    this.disputeId = disputeId;
    this.matchId = matchId;
    this.reporterId = reporterId;
    this.category = category;
    this.evidence = Object.freeze(structuredClone(evidence));
    this.status = DisputeStatus.OPEN;
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
    this.reviewer = null;
    this.decision = null;
    this.decisionReason = null;
    this.decidedAt = null;

    this.appeal = null;

    this.auditTrail = [
      {
        action: "DISPUTE_FILED",
        actor: reporterId,
        at: createdAt,
        details: { category, evidenceSummary: Object.keys(evidence) },
      },
    ];
  }

  toJSON() {
    return {
      disputeId: this.disputeId,
      matchId: this.matchId,
      reporterId: this.reporterId,
      category: this.category,
      evidence: this.evidence,
      status: this.status,
      reviewer: this.reviewer,
      decision: this.decision,
      decisionReason: this.decisionReason,
      decidedAt: this.decidedAt,
      appeal: this.appeal,
      auditTrail: this.auditTrail,
    };
  }
}

export class DisputeService {
  constructor() {
    this.disputes = new Map(); // disputeId -> DisputeRecord
    this.matchDisputes = new Map(); // matchId -> [disputeId]
  }

  fileDispute({ matchId, reporterId, category, evidence = {} }) {
    const dispute = new DisputeRecord({
      matchId,
      reporterId,
      category,
      evidence,
    });

    this.disputes.set(dispute.disputeId, dispute);

    if (!this.matchDisputes.has(matchId)) {
      this.matchDisputes.set(matchId, []);
    }
    this.matchDisputes.get(matchId).push(dispute.disputeId);

    return {
      ok: true,
      disputeId: dispute.disputeId,
      status: dispute.status,
      category: dispute.category,
    };
  }

  assignReviewer({ disputeId, adminId }) {
    const disp = this.disputes.get(disputeId);
    if (!disp) throw new Error(`Dispute not found: ${disputeId}`);

    disp.reviewer = adminId;
    disp.status = DisputeStatus.UNDER_REVIEW;
    disp.updatedAt = new Date().toISOString();
    disp.auditTrail.push({
      action: "REVIEWER_ASSIGNED",
      actor: adminId,
      at: disp.updatedAt,
      details: { reviewer: adminId },
    });

    return { ok: true, disputeId, status: disp.status, reviewer: adminId };
  }

  resolveDispute({
    disputeId,
    adminId,
    decision,
    decisionReason,
    walletLedger = null,
  }) {
    const disp = this.disputes.get(disputeId);
    if (!disp) throw new Error(`Dispute not found: ${disputeId}`);

    if (!adminId) throw new Error("REVIEWER_REQUIRED: Human administrator ID must be supplied");
    if (!decision || !DisputeDecision[decision]) {
      throw new Error(`Invalid dispute decision: ${decision}`);
    }
    if (!decisionReason || decisionReason.trim().length < 10) {
      throw new Error("DECISION_REASON_MANDATORY: Minimum 10 characters required for decision reasoning");
    }

    disp.reviewer = adminId;
    disp.decision = decision;
    disp.decisionReason = decisionReason;
    disp.status = decision === DisputeDecision.DISMISSED ? DisputeStatus.REJECTED : DisputeStatus.RESOLVED;
    disp.decidedAt = new Date().toISOString();
    disp.updatedAt = disp.decidedAt;

    disp.auditTrail.push({
      action: "DISPUTE_DECIDED",
      actor: adminId,
      at: disp.decidedAt,
      details: { decision, decisionReason },
    });

    // If refund decision and ledger supplied, post refund
    if (decision === DisputeDecision.UPHELD_REFUND && walletLedger) {
      walletLedger.post({
        idempotencyKey: `dispute:${disputeId}:refund`,
        type: "REFUND",
        reference: `dispute:${disputeId}`,
        legs: [
          { account: `user:${disp.reporterId}:locked`, amount: "10000000" },
          { account: `user:${disp.reporterId}:available`, amount: "-10000000" },
        ],
        actor: `DISPUTE_ARBITER_${adminId}`,
        metadata: { disputeId, decisionReason },
      });
    }

    return {
      ok: true,
      disputeId,
      status: disp.status,
      decision: disp.decision,
      decisionReason: disp.decisionReason,
    };
  }

  appealDispute({ disputeId, appellantId, appealNote }) {
    const disp = this.disputes.get(disputeId);
    if (!disp) throw new Error(`Dispute not found: ${disputeId}`);
    if (disp.status !== DisputeStatus.RESOLVED && disp.status !== DisputeStatus.REJECTED) {
      throw new Error(`Cannot appeal dispute in status: ${disp.status}`);
    }

    disp.status = DisputeStatus.APPEALED;
    disp.updatedAt = new Date().toISOString();
    disp.appeal = {
      appellantId,
      appealNote,
      appealedAt: disp.updatedAt,
      reviewedBy: null,
      reviewedAt: null,
      upheld: null,
    };

    disp.auditTrail.push({
      action: "DISPUTE_APPEALED",
      actor: appellantId,
      at: disp.updatedAt,
      details: { appealNote },
    });

    return { ok: true, disputeId, status: disp.status };
  }

  resolveAppeal({
    disputeId,
    appealAdminId,
    upheld,
    appealDecisionReason,
  }) {
    const disp = this.disputes.get(disputeId);
    if (!disp) throw new Error(`Dispute not found: ${disputeId}`);
    if (disp.status !== DisputeStatus.APPEALED) {
      throw new Error(`Dispute is not in APPEALED status: ${disp.status}`);
    }

    // STRICT 2-ADMIN RULE: The appeal reviewer cannot be the original decider!
    if (disp.reviewer && disp.reviewer === appealAdminId) {
      throw new Error("REVIEWER_NOT_INDEPENDENT: Appeal must be reviewed by a different administrator than the original decider");
    }

    if (!appealDecisionReason || appealDecisionReason.trim().length < 10) {
      throw new Error("DECISION_REASON_MANDATORY: Minimum 10 characters required for appeal reasoning");
    }

    const t = new Date().toISOString();
    disp.appeal.reviewedBy = appealAdminId;
    disp.appeal.reviewedAt = t;
    disp.appeal.upheld = Boolean(upheld);
    disp.appeal.reviewerReason = appealDecisionReason;

    disp.status = DisputeStatus.CLOSED;
    disp.updatedAt = t;

    disp.auditTrail.push({
      action: "APPEAL_DECIDED",
      actor: appealAdminId,
      at: t,
      details: { upheld, appealDecisionReason },
    });

    return {
      ok: true,
      disputeId,
      status: disp.status,
      upheld: Boolean(upheld),
      appealAdminId,
    };
  }

  getDispute(disputeId) {
    return this.disputes.get(disputeId) ?? null;
  }
}
