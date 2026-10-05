/**
 * The ticket state machine -- the ONE place a valid transition is
 * decided. No route handler, service method, or UI component ever sets
 * `status` without going through `assertTransition()` first (directive
 * #7: "Do NOT let the client arbitrarily set status. Define valid
 * transitions.").
 *
 * OPEN --------> TRIAGED --------> ASSIGNED --------> IN_PROGRESS
 *   \               \                  |                  |  \   \
 *    \               \                 v                  |   \   v
 *     `--------------->`-----------> (back to TRIAGED    |    \ WAITING_FOR_USER --> IN_PROGRESS
 *                                     for re-triage)      |     \
 *                                                          v      v
 *                                                    ESCALATED  RESOLVED --> CLOSED
 *                                                       |  \                   ^
 *                                                       v   `--> ASSIGNED      |
 *                                                  IN_PROGRESS                 |
 *                                                                              |
 *  RESOLVED --> OPEN (reopened -- see reopen() below)  ------------------------'  (CLOSED is terminal)
 */
export const TICKET_STATUSES = Object.freeze([
  "OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "ESCALATED", "RESOLVED", "CLOSED",
]);

const TRANSITIONS = Object.freeze({
  OPEN: ["TRIAGED", "RESOLVED"],
  TRIAGED: ["ASSIGNED", "RESOLVED"],
  ASSIGNED: ["IN_PROGRESS", "TRIAGED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "ESCALATED", "RESOLVED"],
  WAITING_FOR_USER: ["IN_PROGRESS"],
  ESCALATED: ["IN_PROGRESS", "ASSIGNED"],
  RESOLVED: ["CLOSED", "OPEN"], // OPEN = reopened; see reopen()'s own policy below
  CLOSED: [], // terminal -- nothing reopens a CLOSED ticket
});

export function isValidStatus(status) {
  return TICKET_STATUSES.includes(status);
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitionsFrom(status) {
  return TRANSITIONS[status] ?? [];
}

/**
 * The explicit reopen policy directive #7 asks for, spelled out as code
 * rather than left implicit in the transition table above: staff may
 * reopen a RESOLVED ticket at any time (an explicit "Reopen" action); a
 * CUSTOMER reopens their own ticket only by sending a new message while
 * it is RESOLVED (never CLOSED -- that transition does not exist in
 * TRANSITIONS at all, so `canTransition("CLOSED", "OPEN")` is false and
 * always will be).
 */
export function canReopen(status) {
  return status === "RESOLVED";
}
