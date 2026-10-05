/**
 * PGN (Portable Game Notation) & SAN (Standard Algebraic Notation) Engine
 *
 * Implements standard FIDE PGN export and replay parsing for chess matches.
 */

import {
  generateMoves, makeMove, unmakeMove, moveFrom, moveTo, movePromo,
  squareToAlgebraic, algebraicToSquare,
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK,
  isInCheck, adjudicate,
} from "./chess.mjs";

const PIECE_SYMBOLS = {
  [KNIGHT]: "N",
  [BISHOP]: "B",
  [ROOK]: "R",
  [QUEEN]: "Q",
  [KING]: "K",
};

/**
 * Converts a legal move into Standard Algebraic Notation (SAN).
 * e.g., e4, exd5, Nf3, Raxd1, e8=Q#, O-O, O-O-O
 */
export function moveToSan(position, move) {
  const from = moveFrom(move);
  const to = moveTo(move);
  const promo = movePromo(move);
  const piece = Math.abs(position.board[from]);
  const isCapture = position.board[to] !== 0 || (piece === PAWN && (from & 7) !== (to & 7));

  // Castling
  if (piece === KING && Math.abs((from & 7) - (to & 7)) === 2) {
    const isKingside = (to & 7) > (from & 7);
    const san = isKingside ? "O-O" : "O-O-O";
    // Check if check or checkmate after move
    makeMove(position, move);
    const inCheck = isInCheck(position);
    const legalAfter = generateMoves(position);
    unmakeMove(position);
    if (inCheck && legalAfter.length === 0) return `${san}#`;
    if (inCheck) return `${san}+`;
    return san;
  }

  let san = "";

  if (piece === PAWN) {
    if (isCapture) {
      san += squareToAlgebraic(from)[0] + "x";
    }
    san += squareToAlgebraic(to);
    if (promo) {
      san += "=" + (PIECE_SYMBOLS[promo] || "Q");
    }
  } else {
    san += PIECE_SYMBOLS[piece];

    // Disambiguation: check if other pieces of the same type could move to the same square
    const legalMoves = generateMoves(position);
    const candidates = legalMoves.filter(
      (m) => moveTo(m) === to && Math.abs(position.board[moveFrom(m)]) === piece && moveFrom(m) !== from
    );

    if (candidates.length > 0) {
      const sameFile = candidates.some((m) => (moveFrom(m) & 7) === (from & 7));
      const sameRank = candidates.some((m) => (moveFrom(m) >> 4) === (from >> 4));

      if (!sameFile) {
        san += squareToAlgebraic(from)[0]; // Disambiguate by file
      } else if (!sameRank) {
        san += squareToAlgebraic(from)[1]; // Disambiguate by rank
      } else {
        san += squareToAlgebraic(from);    // Disambiguate by both
      }
    }

    if (isCapture) san += "x";
    san += squareToAlgebraic(to);
  }

  // Check / Checkmate annotation
  makeMove(position, move);
  const check = isInCheck(position);
  const legalAfter = generateMoves(position);
  unmakeMove(position);

  if (check && legalAfter.length === 0) {
    san += "#";
  } else if (check) {
    san += "+";
  }

  return san;
}

/**
 * Exports a match's move list to full PGN standard text.
 */
export function exportToPgn(initialPosition, movesUci, metadata = {}) {
  const headers = {
    Event: metadata.event || "Nizalo Arena Duel",
    Site: metadata.site || "Nizalo Game Platform",
    Date: metadata.date || new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    Round: metadata.round || "1",
    White: metadata.white || "Player 1",
    Black: metadata.black || "Player 2",
    Result: metadata.result || "*",
    RulesVersion: metadata.rulesVersion || "FIDE-2023",
  };

  let pgn = "";
  for (const [key, value] of Object.entries(headers)) {
    pgn += `[${key} "${value}"]\n`;
  }
  pgn += "\n";

  // Replay moves to generate SAN
  const pos = {
    board: Int8Array.from(initialPosition.board),
    turn: initialPosition.turn,
    castling: initialPosition.castling,
    ep: initialPosition.ep,
    halfmove: initialPosition.halfmove,
    fullmove: initialPosition.fullmove,
    stack: [],
  };

  const sanMoves = [];
  for (let i = 0; i < movesUci.length; i++) {
    const uci = movesUci[i];
    const from = algebraicToSquare(uci.slice(0, 2));
    const to = algebraicToSquare(uci.slice(2, 4));
    const legal = generateMoves(pos);
    const m = legal.find((cand) => moveFrom(cand) === from && moveTo(cand) === to);
    if (!m) break;

    const san = moveToSan(pos, m);
    sanMoves.push(san);
    makeMove(pos, m);
  }

  let moveText = "";
  for (let i = 0; i < sanMoves.length; i++) {
    if (i % 2 === 0) {
      moveText += `${Math.floor(i / 2) + 1}. `;
    }
    moveText += `${sanMoves[i]} `;
  }
  moveText += headers.Result;

  pgn += moveText.trim() + "\n";
  return pgn;
}
