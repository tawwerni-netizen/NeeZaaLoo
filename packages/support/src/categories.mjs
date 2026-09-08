/**
 * Ticket categories -- configuration-driven, per directive #2/#3: nothing
 * about "which category needs which extra fields" or "which category
 * starts at a higher priority" is scattered through route handlers or
 * React components. Both the dynamic customer form and the backend's own
 * validation read from this ONE table.
 */
export const TICKET_CATEGORIES = Object.freeze([
  "ACCOUNT", "LOGIN", "PASSWORD", "DEPOSIT_PENDING", "WITHDRAWAL_PENDING", "WITHDRAWAL_FAILED",
  "MISSING_FUNDS", "MATCH_PROBLEM", "TOURNAMENT_PROBLEM", "ANTI_CHEAT", "TECHNICAL", "ABUSE_REPORT", "OTHER",
]);

/**
 * Per category: which internal entity (if any) a ticket in this category
 * is expected to reference, and which extra form fields the customer
 * fills in themselves (never data the platform already knows -- directive
 * #3's "do not ask for data the platform already knows": amount/asset/
 * status for a KNOWN deposit or withdrawal are pulled from the real row
 * via `referenceId`, not re-typed by the customer; the customer only ever
 * supplies the id/description).
 */
export const CATEGORY_CONFIG = Object.freeze({
  ACCOUNT: { referenceType: null, fields: [] },
  LOGIN: { referenceType: null, fields: [] },
  PASSWORD: { referenceType: null, fields: [] },
  DEPOSIT_PENDING: { referenceType: "DEPOSIT", fields: ["referenceId"] },
  WITHDRAWAL_PENDING: { referenceType: "WITHDRAWAL", fields: ["referenceId"] },
  WITHDRAWAL_FAILED: { referenceType: "WITHDRAWAL", fields: ["referenceId"] },
  MISSING_FUNDS: { referenceType: null, fields: [] },
  MATCH_PROBLEM: { referenceType: "DUEL", fields: ["referenceId"] },
  TOURNAMENT_PROBLEM: { referenceType: "TOURNAMENT_PAIRING", fields: ["referenceId"] },
  ANTI_CHEAT: { referenceType: "DUEL", fields: ["referenceId"] },
  TECHNICAL: { referenceType: null, fields: [] },
  ABUSE_REPORT: { referenceType: null, fields: [] },
  OTHER: { referenceType: null, fields: [] },
});

// Directive #8: a small, fixed set of categories that start at an elevated
// priority automatically -- never user-selectable (a customer cannot mark
// their own ticket CRITICAL; see ticket.mjs's createTicket, which never
// reads a client-supplied priority at all). Finer sub-reason detection
// (a duplicate charge vs. a simple pending deposit) is real future
// refinement, not something to fake with fragile keyword-matching now.
const AUTO_PRIORITY = Object.freeze({
  MISSING_FUNDS: "CRITICAL",
  WITHDRAWAL_FAILED: "HIGH",
  ANTI_CHEAT: "HIGH",
});

export function isValidCategory(category) {
  return TICKET_CATEGORIES.includes(category);
}

export function configFor(category) {
  return CATEGORY_CONFIG[category] ?? null;
}

export function defaultPriorityFor(category) {
  return AUTO_PRIORITY[category] ?? "NORMAL";
}
