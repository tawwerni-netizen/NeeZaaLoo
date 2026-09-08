/**
 * Server-authoritative chess rules.
 *
 * 0x88 board representation. Pure functions over an explicit state object —
 * no module-level mutable state, no clock, no I/O. The engine decides what is
 * legal and what the result is; it knows nothing about players, money, or time.
 *
 * Correctness is verified by perft against published node counts. A move
 * generator that passes perft to depth 4 on six distinct positions has almost
 * certainly got castling, en passant, promotion, pins and discovered check
 * right; one that has not been perft-tested almost certainly has not.
 */

// --- Pieces: sign carries colour, magnitude carries type ---------------------
export const EMPTY = 0;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const WHITE = 1, BLACK = -1;

// --- Castling rights bitmask -------------------------------------------------
export const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8;

// --- Move flags --------------------------------------------------------------
const F_NORMAL = 0, F_DOUBLE_PUSH = 1, F_EP = 2, F_CASTLE = 3;

// --- 0x88 geometry -----------------------------------------------------------
// Index 0 = a1, 7 = h1, 112 = a8, 119 = h8. Off-board iff (sq & 0x88).
const onBoard = (sq) => (sq & 0x88) === 0;
const rankOf = (sq) => sq >> 4;
const fileOf = (sq) => sq & 7;

const KNIGHT_DIRS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_DIRS = [15, 17, -15, -17];
const ROOK_DIRS = [16, -16, 1, -1];
const KING_DIRS = [16, -16, 1, -1, 15, 17, -15, -17];

const A1 = 0, E1 = 4, H1 = 7, A8 = 112, E8 = 116, H8 = 119;

// --- Move encoding: from | to<<7 | promo<<14 | flag<<17 ----------------------
const encode = (from, to, promo = 0, flag = F_NORMAL) =>
  from | (to << 7) | (promo << 14) | (flag << 17);
export const moveFrom = (m) => m & 0x7f;
export const moveTo = (m) => (m >> 7) & 0x7f;
export const movePromo = (m) => (m >> 14) & 0x7;
export const moveFlag = (m) => (m >> 17) & 0x7;

// --- Algebraic conversion ----------------------------------------------------
const FILES = "abcdefgh";
export const squareToAlgebraic = (sq) => FILES[fileOf(sq)] + (rankOf(sq) + 1);
export const algebraicToSquare = (s) =>
  FILES.indexOf(s[0]) + ((s.charCodeAt(1) - 49) << 4);

const PROMO_CHAR = { [KNIGHT]: "n", [BISHOP]: "b", [ROOK]: "r", [QUEEN]: "q" };
const CHAR_PROMO = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

/** Long algebraic (UCI) form: e2e4, e7e8q. The wire and replay format. */
export function moveToUci(m) {
  const p = movePromo(m);
  return squareToAlgebraic(moveFrom(m)) + squareToAlgebraic(moveTo(m)) + (p ? PROMO_CHAR[p] : "");
}

// --- FEN ---------------------------------------------------------------------
const FEN_PIECE = {
  p: -PAWN, n: -KNIGHT, b: -BISHOP, r: -ROOK, q: -QUEEN, k: -KING,
  P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING,
};
const PIECE_FEN = { 1: "P", 2: "N", 3: "B", 4: "R", 5: "Q", 6: "K" };

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function parseFen(fen) {
  const [placement, side, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Int8Array(128);

  // FEN lists ranks 8 down to 1; the board indexes rank 1 as 0.
  const rows = placement.split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= "1" && ch <= "8") { f += Number(ch); continue; }
      board[(7 - r) * 16 + f] = FEN_PIECE[ch];
      f++;
    }
  }

  let rights = 0;
  if (castling.includes("K")) rights |= CASTLE_WK;
  if (castling.includes("Q")) rights |= CASTLE_WQ;
  if (castling.includes("k")) rights |= CASTLE_BK;
  if (castling.includes("q")) rights |= CASTLE_BQ;

  return {
    board,
    turn: side === "w" ? WHITE : BLACK,
    castling: rights,
    ep: ep && ep !== "-" ? algebraicToSquare(ep) : -1,
    halfmove: Number(half ?? 0),
    fullmove: Number(full ?? 1),
    stack: [],
  };
}

export function toFen(s) {
  let placement = "";
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 16 + f];
      if (p === EMPTY) { empty++; continue; }
      if (empty) { placement += empty; empty = 0; }
      const ch = PIECE_FEN[Math.abs(p)];
      placement += p > 0 ? ch : ch.toLowerCase();
    }
    if (empty) placement += empty;
    if (r > 0) placement += "/";
  }
  let c = "";
  if (s.castling & CASTLE_WK) c += "K";
  if (s.castling & CASTLE_WQ) c += "Q";
  if (s.castling & CASTLE_BK) c += "k";
  if (s.castling & CASTLE_BQ) c += "q";
  return [
    placement,
    s.turn === WHITE ? "w" : "b",
    c || "-",
    s.ep >= 0 ? squareToAlgebraic(s.ep) : "-",
    s.halfmove,
    s.fullmove,
  ].join(" ");
}

/** Position identity for repetition: board + side + castling + ep. Not the clocks. */
export function positionKey(s) {
  let k = "";
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) k += String.fromCharCode(65 + s.board[r * 16 + f] + 6);
  return k + "|" + s.turn + "|" + s.castling + "|" + s.ep;
}

// --- Attack detection --------------------------------------------------------

/** Is `sq` attacked by any piece of colour `by`? */
export function isAttacked(s, sq, by) {
  const b = s.board;

  // Pawns: a pawn on `from` attacks diagonally forward. Look backwards from sq.
  const pawnDirs = by === WHITE ? [-15, -17] : [15, 17];
  for (const d of pawnDirs) {
    const from = sq + d;
    if (onBoard(from) && b[from] === by * PAWN) return true;
  }

  for (const d of KNIGHT_DIRS) {
    const from = sq + d;
    if (onBoard(from) && b[from] === by * KNIGHT) return true;
  }

  for (const d of KING_DIRS) {
    const from = sq + d;
    if (onBoard(from) && b[from] === by * KING) return true;
  }

  for (const d of BISHOP_DIRS) {
    let t = sq + d;
    while (onBoard(t)) {
      const p = b[t];
      if (p !== EMPTY) {
        if (p === by * BISHOP || p === by * QUEEN) return true;
        break;
      }
      t += d;
    }
  }

  for (const d of ROOK_DIRS) {
    let t = sq + d;
    while (onBoard(t)) {
      const p = b[t];
      if (p !== EMPTY) {
        if (p === by * ROOK || p === by * QUEEN) return true;
        break;
      }
      t += d;
    }
  }

  return false;
}

export function findKing(s, colour) {
  for (let sq = 0; sq < 128; sq++) {
    if (onBoard(sq) && s.board[sq] === colour * KING) return sq;
  }
  return -1;
}

export const isInCheck = (s, colour = s.turn) =>
  isAttacked(s, findKing(s, colour), -colour);

// --- Move generation ---------------------------------------------------------

/** Pseudo-legal moves: geometry and occupancy only, king safety not yet applied. */
export function generatePseudoMoves(s) {
  const b = s.board, us = s.turn, them = -us;
  const moves = [];

  for (let from = 0; from < 128; from++) {
    if (!onBoard(from)) continue;
    const piece = b[from];
    if (piece === EMPTY || Math.sign(piece) !== us) continue;
    const type = Math.abs(piece);

    if (type === PAWN) {
      const fwd = us === WHITE ? 16 : -16;
      const startRank = us === WHITE ? 1 : 6;
      const promoRank = us === WHITE ? 7 : 0;

      const one = from + fwd;
      if (onBoard(one) && b[one] === EMPTY) {
        if (rankOf(one) === promoRank) {
          for (const p of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push(encode(from, one, p));
        } else {
          moves.push(encode(from, one));
          const two = from + fwd * 2;
          if (rankOf(from) === startRank && b[two] === EMPTY) {
            moves.push(encode(from, two, 0, F_DOUBLE_PUSH));
          }
        }
      }

      for (const d of us === WHITE ? [15, 17] : [-15, -17]) {
        const to = from + d;
        if (!onBoard(to)) continue;
        const target = b[to];
        if (target !== EMPTY && Math.sign(target) === them) {
          if (rankOf(to) === promoRank) {
            for (const p of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push(encode(from, to, p));
          } else {
            moves.push(encode(from, to));
          }
        } else if (to === s.ep && target === EMPTY) {
          moves.push(encode(from, to, 0, F_EP));
        }
      }
      continue;
    }

    if (type === KNIGHT || type === KING) {
      for (const d of type === KNIGHT ? KNIGHT_DIRS : KING_DIRS) {
        const to = from + d;
        if (!onBoard(to)) continue;
        const target = b[to];
        if (target === EMPTY || Math.sign(target) === them) moves.push(encode(from, to));
      }
      continue;
    }

    const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_DIRS;
    for (const d of dirs) {
      let to = from + d;
      while (onBoard(to)) {
        const target = b[to];
        if (target === EMPTY) { moves.push(encode(from, to)); to += d; continue; }
        if (Math.sign(target) === them) moves.push(encode(from, to));
        break;
      }
    }
  }

  // Castling. The king may not start in, pass through, or land on an attacked
  // square; the squares between must be empty.
  const kingSq = us === WHITE ? E1 : E8;
  if (b[kingSq] === us * KING && !isAttacked(s, kingSq, them)) {
    const kSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const qSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    const rookK = us === WHITE ? H1 : H8;
    const rookQ = us === WHITE ? A1 : A8;

    if ((s.castling & kSide) && b[rookK] === us * ROOK &&
        b[kingSq + 1] === EMPTY && b[kingSq + 2] === EMPTY &&
        !isAttacked(s, kingSq + 1, them) && !isAttacked(s, kingSq + 2, them)) {
      moves.push(encode(kingSq, kingSq + 2, 0, F_CASTLE));
    }
    if ((s.castling & qSide) && b[rookQ] === us * ROOK &&
        b[kingSq - 1] === EMPTY && b[kingSq - 2] === EMPTY && b[kingSq - 3] === EMPTY &&
        !isAttacked(s, kingSq - 1, them) && !isAttacked(s, kingSq - 2, them)) {
      moves.push(encode(kingSq, kingSq - 2, 0, F_CASTLE));
    }
  }

  return moves;
}

/** Fully legal moves: pseudo-legal, minus anything that leaves our king attacked. */
export function generateMoves(s) {
  const out = [];
  for (const m of generatePseudoMoves(s)) {
    makeMove(s, m);
    if (!isAttacked(s, findKing(s, -s.turn), s.turn)) out.push(m);
    unmakeMove(s);
  }
  return out;
}

// --- Make / unmake -----------------------------------------------------------

// Castling rights are cleared when a king or rook leaves, or a rook is captured
// on its home square. This table encodes both directions at once.
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[A1] = 15 & ~CASTLE_WQ;
CASTLE_MASK[E1] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[H1] = 15 & ~CASTLE_WK;
CASTLE_MASK[A8] = 15 & ~CASTLE_BQ;
CASTLE_MASK[E8] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[H8] = 15 & ~CASTLE_BK;

export function makeMove(s, m) {
  const from = moveFrom(m), to = moveTo(m), promo = movePromo(m), flag = moveFlag(m);
  const b = s.board;
  const piece = b[from];
  const us = s.turn;

  let captured = b[to];
  let capturedSq = to;
  if (flag === F_EP) {
    capturedSq = us === WHITE ? to - 16 : to + 16;
    captured = b[capturedSq];
  }

  s.stack.push({
    move: m, captured, capturedSq,
    castling: s.castling, ep: s.ep, halfmove: s.halfmove, fullmove: s.fullmove,
  });

  if (flag === F_EP) b[capturedSq] = EMPTY;
  b[to] = promo ? us * promo : piece;
  b[from] = EMPTY;

  if (flag === F_CASTLE) {
    if (to > from) { b[to - 1] = b[to + 1]; b[to + 1] = EMPTY; }   // king side
    else { b[to + 1] = b[to - 2]; b[to - 2] = EMPTY; }             // queen side
  }

  s.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
  s.ep = flag === F_DOUBLE_PUSH ? (us === WHITE ? from + 16 : from - 16) : -1;
  s.halfmove = (Math.abs(piece) === PAWN || captured !== EMPTY) ? 0 : s.halfmove + 1;
  if (us === BLACK) s.fullmove++;
  s.turn = -us;
}

export function unmakeMove(s) {
  const u = s.stack.pop();
  const m = u.move;
  const from = moveFrom(m), to = moveTo(m), promo = movePromo(m), flag = moveFlag(m);
  const b = s.board;

  s.turn = -s.turn;
  const us = s.turn;

  if (flag === F_CASTLE) {
    if (to > from) { b[to + 1] = b[to - 1]; b[to - 1] = EMPTY; }
    else { b[to - 2] = b[to + 1]; b[to + 1] = EMPTY; }
  }

  b[from] = promo ? us * PAWN : b[to];
  b[to] = EMPTY;
  if (u.captured !== EMPTY) b[u.capturedSq] = u.captured;

  s.castling = u.castling;
  s.ep = u.ep;
  s.halfmove = u.halfmove;
  s.fullmove = u.fullmove;
}

// --- Termination -------------------------------------------------------------

/**
 * FIDE insufficient material: K vs K, K+B vs K, K+N vs K, and K+B vs K+B with
 * both bishops on the same colour square. Anything else can, in principle, mate.
 */
export function hasInsufficientMaterial(s) {
  const minors = [];
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) continue;
    const p = s.board[sq];
    if (p === EMPTY) continue;
    const t = Math.abs(p);
    if (t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    minors.push({ type: t, colour: Math.sign(p), light: (fileOf(sq) + rankOf(sq)) % 2 === 1 });
  }
  if (minors.length === 0) return true;                       // K vs K
  if (minors.length === 1) return true;                       // K+minor vs K
  if (minors.length === 2) {
    const [a, b] = minors;
    if (a.type === BISHOP && b.type === BISHOP && a.colour !== b.colour && a.light === b.light) {
      return true;                                            // K+B vs K+B, same colour squares
    }
  }
  return false;
}

export const TERMINATION = {
  CHECKMATE: "CHECKMATE",
  STALEMATE: "STALEMATE",
  FIFTY_MOVE: "FIFTY_MOVE",
  THREEFOLD: "THREEFOLD_REPETITION",
  INSUFFICIENT_MATERIAL: "INSUFFICIENT_MATERIAL",
};

/**
 * Adjudicate the position. `history` is the list of position keys reached so
 * far, INCLUDING the current one — repetition counts positions, not moves.
 *
 * Checkmate and stalemate are checked first: a position with no legal moves is
 * terminal regardless of the fifty-move counter.
 */
export function adjudicate(s, history = []) {
  const legal = generateMoves(s);

  if (legal.length === 0) {
    return isInCheck(s)
      ? { over: true, result: s.turn === WHITE ? "0-1" : "1-0", reason: TERMINATION.CHECKMATE }
      : { over: true, result: "1/2-1/2", reason: TERMINATION.STALEMATE };
  }
  if (hasInsufficientMaterial(s)) {
    return { over: true, result: "1/2-1/2", reason: TERMINATION.INSUFFICIENT_MATERIAL };
  }
  if (s.halfmove >= 100) {
    return { over: true, result: "1/2-1/2", reason: TERMINATION.FIFTY_MOVE };
  }
  if (history.length) {
    const key = history[history.length - 1];
    let n = 0;
    for (const h of history) if (h === key) n++;
    if (n >= 3) return { over: true, result: "1/2-1/2", reason: TERMINATION.THREEFOLD };
  }
  return { over: false, result: null, reason: null };
}

// --- Perft -------------------------------------------------------------------

/** Leaf-node count to `depth`. The standard correctness probe for a move generator. */
export function perft(s, depth) {
  if (depth === 0) return 1;
  const moves = generateMoves(s);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    makeMove(s, m);
    n += perft(s, depth - 1);
    unmakeMove(s);
  }
  return n;
}

/** Per-move breakdown, for bisecting a perft mismatch down to the offending move. */
export function perftDivide(s, depth) {
  const out = {};
  for (const m of generateMoves(s)) {
    makeMove(s, m);
    out[moveToUci(m)] = perft(s, depth - 1);
    unmakeMove(s);
  }
  return out;
}

// --- Applying a move by UCI (the server's entry point) -----------------------

/** Resolve a UCI string against the legal move list. Returns null if not legal. */
export function findLegalMove(s, uci) {
  const from = algebraicToSquare(uci.slice(0, 2));
  const to = algebraicToSquare(uci.slice(2, 4));
  const promo = uci.length > 4 ? CHAR_PROMO[uci[4]] : 0;
  for (const m of generateMoves(s)) {
    if (moveFrom(m) === from && moveTo(m) === to && (!promo || movePromo(m) === promo)) {
      // A promotion move must name its piece; refuse an ambiguous e7e8.
      if (movePromo(m) && !promo) continue;
      return m;
    }
  }
  return null;
}
