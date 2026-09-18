/**
 * The authorisation layer.
 *
 * Deny by default, and deny loudly. An action that has not been declared in
 * ACTIONS below cannot be authorised by anybody -- not the super admin, not a
 * system caller. Adding an endpoint without declaring who may call it is
 * therefore a *failure*, not an accidental grant, and `undeclaredActions()`
 * turns that into a CI check.
 *
 * The capability matrix is deliberately written out in full rather than
 * derived from role hierarchies. Hierarchies are how roles quietly accumulate
 * privileges nobody chose to give them: "support inherits from admin" reads
 * fine until support can approve withdrawals. Every cell here is a decision,
 * and the test suite asserts the whole grid, so widening a role means editing
 * a test on purpose.
 */

export const Decision = {
  ALLOW: "ALLOW",
  DENY: "DENY",
  REQUIRE_STEP_UP: "REQUIRE_STEP_UP",
  REQUIRE_APPROVAL: "REQUIRE_APPROVAL",
};

/**
 * Every action the admin plane and the player API can perform.
 *
 *  capability     - the permission a role must hold
 *  stepUp         - re-authentication required, even for a held capability
 *  fourEyes       - a second, different admin must approve before execution
 *  control        - an emergency switch that must be ON for this to proceed
 *  selfOnly       - a player action limited to their own resources
 */
export const ACTIONS = {
  // --- Player-facing ---------------------------------------------------------
  "player.register":         { capability: null, control: "REGISTRATION" },
  "player.login":            { capability: null },
  "player.profile.read":     { capability: null, selfOnly: false },
  "player.profile.update":   { capability: null, selfOnly: true },
  "player.email.set":        { capability: null, selfOnly: true },
  "player.password.change":  { capability: null, selfOnly: true, stepUp: true },
  // Deliberately NOT stepUp -- unlike player.password.change, this is a
  // one-time bootstrap operation for a player who has NO credential row
  // yet (a Google-only signup). setInitialPassword() itself is the real
  // guard: it refuses outright the instant a credential already exists,
  // so this can never be used to change an existing password. Step-up
  // itself requires an existing password or TOTP to satisfy (see
  // auth.stepUp()) -- gating this route on it would make the one escape
  // hatch directive #8 requires unreachable for exactly the accounts that
  // need it.
  "player.password.set":     { capability: null, selfOnly: true },
  "player.identity.link":    { capability: null, selfOnly: true, stepUp: true },
  "player.identity.unlink":  { capability: null, selfOnly: true, stepUp: true },
  "player.auth_methods.read": { capability: null, selfOnly: true },
  // Reporting someone ELSE's content -- not selfOnly (there is no "owner"
  // in the ownership sense; profile.mjs's own reportContent() refuses a
  // report where reporter === subject at the business-logic level).
  "player.content.report": { capability: null },
  "player.totp.enrol":       { capability: null, selfOnly: true, stepUp: true },
  "player.session.list":     { capability: null, selfOnly: true },
  "player.session.revoke":   { capability: null, selfOnly: true },
  "player.account.close":    { capability: null, selfOnly: true, stepUp: true },

  "wallet.read":             { capability: null, selfOnly: true },
  "wallet.deposit":          { capability: null, selfOnly: true, control: "DEPOSITS" },
  "wallet.withdraw":         { capability: null, selfOnly: true, stepUp: true, control: "WITHDRAWALS" },

  "duel.play.free":          { capability: null, control: "MATCHMAKING" },
  "duel.play.cash":          { capability: null, control: "CASH_MATCHES" },
  "duel.spectate":           { capability: null },
  "duel.history.read":       { capability: null, selfOnly: true },
  "tournament.join":         { capability: null, control: "TOURNAMENTS" },
  "tournament.withdraw":     { capability: null, control: "TOURNAMENTS" },
  "tournament.read":         { capability: null },   // list/detail/standings/bracket/results -- read-only, public shape
  "global_skill.read":       { capability: null },   // own profile, leaderboards, per-game ratings
  "notification.read":       { capability: null, selfOnly: true },
  "player.daily_challenge.read": { capability: null, selfOnly: true },
  "player.recommendation.read":  { capability: null, selfOnly: true },
  "player.referral.read":        { capability: null, selfOnly: true, control: "REFERRALS" },
  "player.referral.code.read":   { capability: null, control: "REFERRALS" },
  "player.consent.read":         { capability: null, selfOnly: true },
  "player.consent.accept":       { capability: null, selfOnly: true },
  "legal.policies.read":         { capability: null },
  "support.config.read":         { capability: null },
  "payment.webhook":             { capability: null },
  "payment.local_transfer.report": { capability: null },
  "payment.local_withdrawal.device_complete": { capability: null },

  // --- Read surfaces ---------------------------------------------------------
  "admin.user.read":         { capability: "user.read" },
  "admin.wallet.read":       { capability: "wallet.read" },
  "admin.ledger.read":       { capability: "ledger.read" },
  "admin.duel.read":         { capability: "duel.read" },
  "admin.risk.read":         { capability: "risk.read" },
  "admin.fairplay.read":     { capability: "fairplay.read" },
  "admin.analytics.read":    { capability: "analytics.read" },
  "admin.audit.read":        { capability: "audit.read" },
  "admin.reconciliation.read": { capability: "reconciliation.read" },
  // The Admin Payment & Stablecoin Control Center. Reading a rail's
  // configuration, its live health, and whether a global switch is on is
  // the same sensitivity tier as reconciliation.read/audit.read (aggregate
  // operational visibility, no individual user data) -- granted to the same
  // roles. control.read is deliberately its OWN capability, not folded into
  // admin.control.toggle's existing "control.toggle": a role that can only
  // SEE whether deposits are paused must not thereby gain the ability to
  // pause them.
  "admin.rail.read":    { capability: "rail.read" },
  "admin.control.read": { capability: "control.read" },

  // --- Money -----------------------------------------------------------------
  "admin.withdrawal.review":  { capability: "withdrawal.review" },
  "admin.withdrawal.approve": { capability: "withdrawal.approve", stepUp: true, fourEyes: true },
  // A deliberate, explicit exception to four-eyes for operators running with
  // a single admin, where a SECOND distinct decider structurally cannot
  // exist -- true four-eyes review (admin.withdrawal.approve above) remains
  // available the moment a second admin account does. Same capability, same
  // step-up requirement, no approval_request precondition. This is a real
  // reduction in the control (one compromised admin credential is enough),
  // accepted knowingly rather than worked around silently -- see the
  // review-threshold split in payments.mjs's own reviewThresholdMinor.
  "admin.withdrawal.approve_solo": { capability: "withdrawal.approve", stepUp: true },
  "admin.withdrawal.reject":  { capability: "withdrawal.review", stepUp: true },
  "admin.adjustment.create":  { capability: "adjustment.create", stepUp: true, fourEyes: true },
  "admin.economy.change":     { capability: "economy.manage", stepUp: true, fourEyes: true },
  // Enabling/disabling/pausing a rail, or editing its limits, is
  // reversible, does not itself move a single unit of money (it only ever
  // gates FUTURE deposit/withdrawal creation -- see rail_enabled_for() and
  // payments.mjs's own railOperationAllowed()), and never touches history,
  // an existing balance, or an in-flight operation's own state machine.
  // That places it at economy.manage's tier -- step-up, no four-eyes --
  // rather than withdrawal.approve's: turning USDT/TRC20 off is the same
  // shape of decision as changing the platform's rake, not the same shape
  // as releasing a specific payout.
  "admin.rail.manage": { capability: "rail.manage", stepUp: true },

  // --- Local EGP rails (Vodafone Cash / InstaPay, 0062) -----------------------
  // Setting the EGP/USD rate and editing which phone numbers accept deposits
  // are the same tier as admin.rail.manage above: reversible, audited, and
  // they only ever gate FUTURE deposits/conversions, never moving money
  // themselves. Viewing the deposit queue or rejecting a bogus intent is
  // investigative, not financial -- the same withdrawal.review tier used
  // for triaging a payout queue before anything is released. Crediting a
  // deposit (observeAndCredit) is different in kind from those: there is no
  // chain to verify it against, so it is an admin's own attestation that
  // real money arrived, posted straight to the ledger -- exactly the shape
  // admin.adjustment.create already exists for (a human manually crediting a
  // balance), so it is gated the same way: step-up, four-eyes, with the same
  // solo escape hatch admin.withdrawal.approve_solo established for an
  // operator with no second admin to pair with. Completing a local
  // withdrawal is the outbound mirror -- a real debit out of custody on the
  // admin's own word that they sent the cash -- so it gets the identical
  // tier as admin.withdrawal.approve/approve_solo.
  "admin.local_rail.read":    { capability: "rail.read" },
  "admin.local_rail.manage":  { capability: "rail.manage", stepUp: true },
  "admin.local_deposit.read": { capability: "wallet.read" },
  "admin.local_deposit.reject": { capability: "withdrawal.review" },
  "admin.local_deposit.credit": { capability: "adjustment.create", stepUp: true, fourEyes: true },
  "admin.local_deposit.credit_solo": { capability: "adjustment.create", stepUp: true },
  "admin.local_withdrawal.complete": { capability: "withdrawal.approve", stepUp: true, fourEyes: true },
  "admin.local_withdrawal.complete_solo": { capability: "withdrawal.approve", stepUp: true },

  // --- Trust & safety --------------------------------------------------------
  "admin.risk.decide":       { capability: "risk.decide", stepUp: true },
  "admin.fairplay.decide":   { capability: "fairplay.decide", stepUp: true },
  "admin.referral.read":     { capability: "referral.read" },
  "admin.referral.decide":   { capability: "referral.decide", stepUp: true },
  // Resolving a reconciliation case (marking it RESOLVED or FALSE_POSITIVE)
  // is a reviewed judgment call, the same tier as risk.decide/fairplay.decide
  // -- step-up, no four-eyes, because closing the case does not itself move
  // money. The one reconciliation action that DOES move money potential --
  // the automatic solvency-breach withdrawal halt -- is not admin-triggered
  // at all (see reconciliation's `runSolvency()`), so it needs no action here.
  "admin.reconciliation.decide": { capability: "reconciliation.decide", stepUp: true },
  "admin.fairplay.appeal":   { capability: "fairplay.appeal" },
  "admin.duel.void":         { capability: "duel.void", stepUp: true, fourEyes: true },
  "admin.user.restrict":     { capability: "user.restrict", stepUp: true },
  "admin.user.close":        { capability: "user.close", stepUp: true, fourEyes: true },
  "admin.content.moderate":  { capability: "content.moderate" },
  "admin.support.respond":   { capability: "support.respond" },
  "admin.support.config.update": { capability: "support.respond", stepUp: true },
  "admin.policy.manage":     { capability: "control.toggle", stepUp: true },
  // Toggling a game's live/cash/tournament state is a platform-wide switch on
  // real money, and confiscation empties a player's entire balance. Both are
  // step-up actions for the same reason every other money-touching admin
  // action is: a stolen admin session must not be enough on its own. The web
  // client prompts for the password once and retries automatically (see
  // apps/web/src/lib/api.ts), so this costs the operator one prompt, not a
  // broken button.
  "admin.game.manage":       { capability: "control.toggle", stepUp: true },
  "admin.user.confiscate":   { capability: "user.restrict", stepUp: true },
  "admin.settings.read":     { capability: "control.read" },
  "admin.settings.manage":   { capability: "economy.manage" },

  // --- The admin plane itself ------------------------------------------------
  "admin.role.grant":        { capability: "role.manage", stepUp: true, fourEyes: true },
  "admin.role.revoke":       { capability: "role.manage", stepUp: true },
  "admin.control.toggle":    { capability: "control.toggle", stepUp: true },
  "admin.control.global":    { capability: "control.global", stepUp: true },
  // Managing the CUSTOM role/permission system (db/migrations/0015) --
  // separate from admin.role.grant/revoke above, which govern the fixed,
  // hardcoded SUPER_ADMIN/FINANCE_ADMIN/... grid. This capability lets an
  // operator create a role and decide which of the (currently non-financial)
  // permission codes it holds; it does not and cannot reach anything already
  // gated by a capability above, since no permission code in that table
  // shadows one of these. Restricted to SUPER_ADMIN alone, with no
  // exceptions, so the surface that assigns privileges cannot itself be
  // widened by anyone it hasn't already been widened to.
  "admin.rbac.manage":       { capability: "rbac.manage", stepUp: true },

  // --- Tournaments -------------------------------------------------------------
  // Orchestration (create/open/start/advance) is reversible and audited but
  // moves no money, so it gets step-up without four-eyes -- the same tier as
  // admin.risk.decide. Settlement actually pays prize money out of a shared
  // pool, which is exactly the class of action four-eyes exists for.
  "admin.tournament.manage":  { capability: "tournament.manage", stepUp: true },
  "admin.tournament.settle":  { capability: "tournament.manage", stepUp: true, fourEyes: true },

  // --- Support tickets (Slice 8) ----------------------------------------------
  // TICKET_VIEW/REPLY/ASSIGN/ESCALATE/CLOSE are `permission` rows granted
  // through the CUSTOM RBAC layer (rbac.mjs / db/migrations/0015), not
  // through ROLE_CAPABILITIES above -- identify() merges an admin's
  // effectivePermissions() into the same actor.capabilities Set this
  // function already reads, so nothing below (or in authorize() itself)
  // changes to make these real. See EXTERNALLY_GRANTED_CAPABILITIES.
  // Every ticket operation maps to exactly one of the five declared
  // permissions:
  //   TICKET_VIEW     - queue, search, ticket detail, message history
  //   TICKET_REPLY     - a customer-visible reply, an internal note, and
  //                       routine in-progress status moves (triage, pick
  //                       up, wait-for-user) that happen while working a
  //                       ticket, none of which are final
  //   TICKET_ASSIGN    - assign or reassign
  //   TICKET_ESCALATE  - hand off to another team
  //   TICKET_CLOSE     - resolve, close, or reopen -- the ticket's final states
  "admin.ticket.view":     { capability: "TICKET_VIEW" },
  "admin.ticket.reply":    { capability: "TICKET_REPLY" },
  "admin.ticket.assign":   { capability: "TICKET_ASSIGN" },
  "admin.ticket.escalate": { capability: "TICKET_ESCALATE" },
  "admin.ticket.close":    { capability: "TICKET_CLOSE" },

  // --- Support tickets, customer side -----------------------------------------
  // A ticket is addressed by its own id, not by the owning player's id, so
  // `resource.ownerId` (which authorize() compares directly to actor.id)
  // cannot express "this ticket belongs to this player" the way
  // `owner: ({actor}) => actor.id` does for /v1/me/* routes below. Ownership
  // of a SPECIFIC ticket is therefore enforced the same way
  // player.content.report enforces its own business rules: inside the
  // service (ticket.mjs's own `AND player_id = $2` on every read/write),
  // not through the selfOnly flag.
  "player.ticket.create":  { capability: null },
  "player.ticket.list":    { capability: null, selfOnly: true },
  "player.ticket.read":    { capability: null },
  "player.ticket.message": { capability: null },

  // --- Chat (Slice 9) ----------------------------------------------------------
  // Same disjoint-namespace pattern as Slice 8: CHAT_VIEW/DELETE/MUTE/
  // REPORT_REVIEW are custom-RBAC permission codes (migration 0015/0023),
  // granted only through a real role, never through ROLE_CAPABILITIES.
  // CHAT_MODERATE also exists in the permission catalog but is deliberately
  // not wired to any action here -- it is a convenience bundle an operator
  // MAY grant a role alongside the granular codes below; nothing in this
  // codebase's own "no inheritance" policy would honour it as a superset
  // even if referenced, so it stays unreferenced rather than imply a
  // hierarchy that does not exist.
  "admin.chat.view":          { capability: "CHAT_VIEW" },
  "admin.chat.delete":        { capability: "CHAT_DELETE" },
  "admin.chat.mute":          { capability: "CHAT_MUTE" },
  "admin.chat.report_review": { capability: "CHAT_REPORT_REVIEW" },

  // Match chat is addressed by duel id, not player id -- exactly the same
  // reasoning as player.ticket.read/message above: participation is
  // verified inside channels.mjs's canAccessChannel() against the REAL
  // duel row, never through resource.ownerId or a client-supplied claim.
  //
  // Sending has no action here at all: exactly like a duel INTENT, a chat
  // send goes over the authenticated websocket and is authorized INLINE by
  // the gateway (channels.canAccessChannel() + moderation.isMuted()), never
  // through this REST policy grid -- gateway.mjs never called authorize()
  // for duel moves either, and chat deliberately stays consistent with
  // that, not a second, parallel authorization model for the same socket.
  "player.chat.global.read":    { capability: null },
  "player.chat.match.read":     { capability: null },
  "player.chat.spectator.read": { capability: null },
  "player.chat.block":          { capability: null, selfOnly: true },
  "player.chat.report":         { capability: null },
  "player.members.read":        { capability: null },
  "player.friends.read":        { capability: null },
  "player.friends.write":       { capability: null },
  "player.chat.direct.read":    { capability: null },
  "player.chat.direct.write":   { capability: null },
};

/**
 * Capabilities granted exclusively through the custom RBAC layer
 * (packages/authz/src/rbac.mjs), never through ROLE_CAPABILITIES -- see
 * that file's own header on why the two grant paths are deliberately kept
 * disjoint. orphanedCapabilities() below treats these as legitimately
 * granted so the CI guard does not flag a ticket action as pointing at a
 * capability "nobody can ever hold": someone can, just not through a role
 * in ROLE_CAPABILITIES.
 */
export const EXTERNALLY_GRANTED_CAPABILITIES = Object.freeze([
  "TICKET_VIEW", "TICKET_REPLY", "TICKET_ASSIGN", "TICKET_ESCALATE", "TICKET_CLOSE",
  "CHAT_VIEW", "CHAT_DELETE", "CHAT_MUTE", "CHAT_REPORT_REVIEW",
]);

/**
 * Role -> capabilities. Flat, explicit, no inheritance.
 *
 * Note what is NOT here:
 *   - No role holds both `withdrawal.approve` and `withdrawal.review` plus the
 *     ability to self-approve; four-eyes covers that, but the matrix is also
 *     written so SUPPORT can never touch money at all.
 *   - ANALYST and READ_ONLY hold no capability that changes anything.
 *   - Only SUPER_ADMIN can pull the global emergency switch.
 */
export const ROLE_CAPABILITIES = {
  SUPER_ADMIN: [
    "user.read", "user.restrict", "user.close",
    "wallet.read", "ledger.read", "duel.read", "duel.void",
    "withdrawal.review", "withdrawal.approve",
    "adjustment.create", "economy.manage",
    "rail.read", "rail.manage", "control.read",
    "risk.read", "risk.decide",
    "fairplay.read", "fairplay.decide", "fairplay.appeal",
    "content.moderate", "support.respond",
    "analytics.read", "audit.read",
    "role.manage", "control.toggle", "control.global",
    "tournament.manage",
    "reconciliation.read", "reconciliation.decide",
    "rbac.manage",
    "referral.read", "referral.decide",
  ],
  ADMIN: [
    "user.read", "user.restrict",
    "wallet.read", "ledger.read", "duel.read",
    "rail.read", "control.read",
    "risk.read", "fairplay.read",
    "content.moderate", "support.respond",
    "analytics.read", "audit.read",
    "control.toggle",
    "tournament.manage",
    "reconciliation.read",
    "referral.read",
  ],
  FINANCE_ADMIN: [
    "user.read", "wallet.read", "ledger.read",
    "withdrawal.review", "withdrawal.approve",
    "adjustment.create", "economy.manage",
    "rail.read", "rail.manage", "control.read",
    "analytics.read", "audit.read",
    "reconciliation.read", "reconciliation.decide",
    "referral.read", "referral.decide",
  ],
  RISK_ADMIN: [
    "user.read", "user.restrict",
    "wallet.read", "ledger.read", "duel.read",
    "rail.read", "control.read",
    "risk.read", "risk.decide",
    "fairplay.read",
    "withdrawal.review",              // may hold a payout, may NOT release one
    "analytics.read", "audit.read",
    "reconciliation.read",            // sees the same cases finance decides; does not close them
    "referral.read", "referral.decide",
  ],
  ANTI_CHEAT_MODERATOR: [
    "user.read", "duel.read",
    "fairplay.read", "fairplay.decide",
    "duel.void",
    "analytics.read",
  ],
  CONTENT_MODERATOR: [
    "user.read", "content.moderate",
  ],
  SUPPORT: [
    "user.read", "duel.read", "support.respond",
    // Deliberately NOT wallet.read: a support agent can see that a withdrawal
    // exists through the ticket, and does not need the balance to answer it.
  ],
  ANALYST: [
    "analytics.read", "duel.read", "reconciliation.read", "rail.read", "control.read",
  ],
  READ_ONLY: [
    "user.read", "duel.read", "analytics.read", "audit.read", "reconciliation.read",
    "rail.read", "control.read",
  ],
};

export const ALL_CAPABILITIES = [
  ...new Set(Object.values(ROLE_CAPABILITIES).flat()),
].sort();

export const capabilitiesFor = (roles = []) => {
  const set = new Set();
  for (const role of roles) for (const c of ROLE_CAPABILITIES[role] ?? []) set.add(c);
  return set;
};

/**
 * The single authorisation entry point.
 *
 * @param {object} req
 * @param {object} req.actor      { type: 'PLAYER'|'ADMIN'|'SYSTEM', id, roles?, mfaEnrolled?, stepUpFor? }
 * @param {string} req.action     a key of ACTIONS
 * @param {object} [req.resource] { ownerId? }
 * @param {object} [req.controls] { KEY: boolean } current emergency switches
 * @param {object} [req.approval] { approvedBy } an existing four-eyes approval
 * @returns {{decision:string, reason:string, action:string}}
 */
export function authorize({ actor, action, resource = {}, controls = {}, approval = null }) {
  const spec = ACTIONS[action];

  // Deny-by-default. An undeclared action is a bug, and it fails closed.
  if (!spec) {
    return deny(action, "UNDECLARED_ACTION",
      "the action is not declared in the policy, so nobody may perform it");
  }

  if (!actor || !actor.type) {
    return deny(action, "NO_ACTOR", "no actor supplied");
  }

  // A control switch gates everyone, including admins. Turning off withdrawals
  // must actually turn off withdrawals.
  if (spec.control) {
    const on = controls[spec.control];
    if (on !== true) {
      return deny(action, "CONTROL_DISABLED", `${spec.control} is currently disabled`);
    }
  }

  if (actor.type === "SYSTEM") {
    // Automation runs deterministic work only. Anything needing a human
    // decision (four-eyes, step-up) is out of reach by construction.
    if (spec.fourEyes || spec.stepUp) {
      return deny(action, "HUMAN_REQUIRED",
        "this action requires a human decision and cannot be automated");
    }
    return allow(action, "system actor, no human decision required");
  }

  if (actor.type === "PLAYER") {
    if (actor.disabled) {
      return deny(action, "ACCOUNT_DISABLED", "this player account is disabled");
    }
    if (spec.capability) {
      return deny(action, "ADMIN_ONLY", "this action requires an admin capability");
    }
    if (spec.selfOnly && resource.ownerId && resource.ownerId !== actor.id) {
      // The IDOR guard. Object-level, and it runs before anything else can
      // read the resource.
      return deny(action, "NOT_OWNER", "a player may only act on their own resources");
    }
    if (spec.stepUp && actor.stepUpFor !== action) {
      return { decision: Decision.REQUIRE_STEP_UP, reason: "STEP_UP_REQUIRED", action };
    }
    return allow(action, "player acting within their own scope");
  }

  if (actor.type !== "ADMIN") {
    return deny(action, "UNKNOWN_ACTOR_TYPE", `unknown actor type: ${actor.type}`);
  }

  // --- Admin -----------------------------------------------------------------

  // An admin without hardware MFA holds no privileges at all. This is checked
  // before capabilities so a mis-enrolled account cannot act even if a grant
  // exists.
  if (actor.mfaEnrolled !== true) {
    return deny(action, "MFA_REQUIRED", "admin accounts must have MFA enrolled");
  }
  if (actor.disabled) {
    return deny(action, "ACCOUNT_DISABLED", "this admin account is disabled");
  }

  if (!spec.capability) {
    // A player-scoped action performed by an admin is still bound by ownership:
    // an admin cannot withdraw from someone else's wallet by virtue of being an
    // admin. Money moves through admin.* actions, with four-eyes, or not at all.
    if (spec.selfOnly && resource.ownerId && resource.ownerId !== actor.id) {
      return deny(action, "NOT_OWNER",
        "admins have no implicit access to a player's own-scope actions");
    }
    return allow(action, "unrestricted action");
  }

  const caps = actor.capabilities ?? capabilitiesFor(actor.roles);
  if (!caps.has(spec.capability)) {
    return deny(action, "MISSING_CAPABILITY", `requires ${spec.capability}`);
  }

  if (spec.stepUp && actor.stepUpFor !== action) {
    return { decision: Decision.REQUIRE_STEP_UP, reason: "STEP_UP_REQUIRED", action };
  }

  if (spec.fourEyes) {
    if (!approval) {
      return { decision: Decision.REQUIRE_APPROVAL, reason: "SECOND_ADMIN_REQUIRED", action };
    }
    if (approval.approvedBy === actor.id) {
      // The rule that has no exceptions. Seniority does not create one.
      return deny(action, "SELF_APPROVAL",
        "the approver must be a different admin from the requester");
    }
    if (approval.action !== action) {
      return deny(action, "APPROVAL_MISMATCH", "the approval is for a different action");
    }
  }

  return allow(action, `capability ${spec.capability} held`);
}

const allow = (action, reason) => ({ decision: Decision.ALLOW, reason, action });
const deny = (action, reason, detail) => ({ decision: Decision.DENY, reason, detail, action });

/**
 * CI guard: every route the application exposes must appear in ACTIONS.
 * Called from a test, so shipping an undeclared endpoint fails the build rather
 * than silently defaulting to something.
 */
export function undeclaredActions(routeActions) {
  return routeActions.filter((a) => !(a in ACTIONS));
}

/** CI guard: no capability may be referenced by an action but granted to nobody. */
export function orphanedCapabilities() {
  const granted = new Set([...ALL_CAPABILITIES, ...EXTERNALLY_GRANTED_CAPABILITIES]);
  const used = new Set(
    Object.values(ACTIONS).map((s) => s.capability).filter(Boolean)
  );
  return {
    usedButNeverGranted: [...used].filter((c) => !granted.has(c)).sort(),
    grantedButNeverUsed: [...granted].filter((c) => !used.has(c)).sort(),
  };
}
