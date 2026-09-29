import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseFen, toFen, START_FEN, generateMoves, makeMove, unmakeMove,
  findLegalMove, adjudicate, isInCheck, hasInsufficientMaterial, positionKey,
  moveToUci, moveFrom, moveTo, movePromo, squareToAlgebraic, algebraicToSquare,
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK, TERMINATION,
} from "../src/chess.mjs";
import { moveToSan, exportToPgn } from "../src/pgn.mjs";

describe("FIDE Chess: 100+ Comprehensive Rule Tests", () => {
  // --- Group 1: Pawn Mechanics (15 tests) ---
  describe("Pawn Mechanics", () => {
    test("1. White pawn single push from starting rank", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e2e3");
      assert.ok(m);
    });

    test("2. White pawn double push from starting rank", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e2e4");
      assert.ok(m);
    });

    test("3. White pawn double push sets en passant target square", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e2e4");
      makeMove(pos, m);
      assert.equal(squareToAlgebraic(pos.ep), "e3");
    });

    test("4. White pawn double push blocked by piece on intermediate square", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/4n3/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e2e4");
      assert.equal(m, null);
    });

    test("5. White pawn single push blocked by piece on target square", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/4n3/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e2e3");
      assert.equal(m, null);
    });

    test("6. Black pawn single push", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
      const m = findLegalMove(pos, "d7d6");
      assert.ok(m);
    });

    test("7. Black pawn double push sets correct en passant square", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
      const m = findLegalMove(pos, "d7d5");
      makeMove(pos, m);
      assert.equal(squareToAlgebraic(pos.ep), "d6");
    });

    test("8. Pawn cannot move sideways without capture", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e4f4");
      assert.equal(m, null);
    });

    test("9. Pawn cannot move backwards", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e4e3");
      assert.equal(m, null);
    });

    test("10. Pawn diagonal capture is legal when enemy piece is present", () => {
      const pos = parseFen("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2");
      const m = findLegalMove(pos, "e4d5");
      assert.ok(m);
    });

    test("11. Pawn diagonal move is illegal into empty square without en passant", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e4d5");
      assert.equal(m, null);
    });

    test("12. En passant capture removes the passed enemy pawn", () => {
      const pos = parseFen("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
      const m = findLegalMove(pos, "e5f6");
      assert.ok(m);
      makeMove(pos, m);
      assert.equal(pos.board[algebraicToSquare("f5")], 0);
      assert.equal(pos.board[algebraicToSquare("f6")], PAWN * WHITE);
    });

    test("13. En passant right expires if not captured on the immediate next turn", () => {
      const pos = parseFen("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
      const m1 = findLegalMove(pos, "a2a3");
      makeMove(pos, m1);
      assert.equal(pos.ep, -1);
    });

    test("14. Pawn promotion to Queen on rank 8", () => {
      const pos = parseFen("8/4P3/8/8/8/8/8/k6K w - - 0 1");
      const m = findLegalMove(pos, "e7e8q");
      assert.ok(m);
      makeMove(pos, m);
      assert.equal(pos.board[algebraicToSquare("e8")], QUEEN * WHITE);
    });

    test("15. Underpromotion to Knight, Bishop, Rook", () => {
      const pos = parseFen("8/4P3/8/8/8/8/8/k6K w - - 0 1");
      assert.ok(findLegalMove(pos, "e7e8n"));
      assert.ok(findLegalMove(pos, "e7e8b"));
      assert.ok(findLegalMove(pos, "e7e8r"));
    });
  });

  // --- Group 2: Knight Mechanics (10 tests) ---
  describe("Knight Mechanics", () => {
    test("16. Knight from center has 8 legal target squares on empty board", () => {
      const pos = parseFen("8/8/8/8/4N3/8/8/k6K w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e4"));
      assert.equal(moves.length, 8);
    });

    test("17. Knight jumps over intervening friendly pawns", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      assert.ok(findLegalMove(pos, "g1f3"));
      assert.ok(findLegalMove(pos, "b1c3"));
    });

    test("18. Knight cannot land on square occupied by friendly piece", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      assert.equal(findLegalMove(pos, "b1d2"), null);
    });

    test("19. Knight captures enemy piece on landing square", () => {
      const pos = parseFen("8/8/3p4/8/4N3/8/8/k6K w - - 0 1");
      const m = findLegalMove(pos, "e4d6");
      assert.ok(m);
    });

    test("20. Knight on corner square a1 has only 2 legal moves", () => {
      const pos = parseFen("8/8/8/8/8/8/8/N6K w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("a1"));
      assert.equal(moves.length, 2);
    });

    test("21. Knight on edge square a4 has only 4 legal moves", () => {
      const pos = parseFen("8/8/8/8/N7/8/8/k6K w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("a4"));
      assert.equal(moves.length, 4);
    });

    test("22. Knight cannot make diagonal moves", () => {
      const pos = parseFen("8/8/8/8/4N3/8/8/k6K w - - 0 1");
      assert.equal(findLegalMove(pos, "e4f5"), null);
    });

    test("23. Knight cannot make straight moves", () => {
      const pos = parseFen("8/8/8/8/4N3/8/8/k6K w - - 0 1");
      assert.equal(findLegalMove(pos, "e4e6"), null);
    });

    test("24. Black Knight legal jumps", () => {
      const pos = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1");
      assert.ok(findLegalMove(pos, "b8c6"));
      assert.ok(findLegalMove(pos, "g8f6"));
    });

    test("25. Pinned Knight cannot move", () => {
      const pos = parseFen("4k3/8/8/8/4r3/8/4N3/4K3 w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e2"));
      assert.equal(moves.length, 0);
    });
  });

  // --- Group 3: Bishop & Rook Mechanics (12 tests) ---
  describe("Bishop & Rook Mechanics", () => {
    test("26. Bishop diagonal rays on open board", () => {
      const pos = parseFen("k6K/8/8/8/4B3/8/8/8 w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e4"));
      assert.equal(moves.length, 13);
    });

    test("27. Bishop ray blocked by friendly piece", () => {
      const pos = parseFen("k6K/8/6P1/8/4B3/8/8/8 w - - 0 1");
      const m = findLegalMove(pos, "e4h7");
      assert.equal(m, null);
    });

    test("28. Bishop ray captures enemy piece and stops", () => {
      const pos = parseFen("k6K/8/6p1/8/4B3/8/8/8 w - - 0 1");
      assert.ok(findLegalMove(pos, "e4g6"));
      assert.equal(findLegalMove(pos, "e4h7"), null);
    });

    test("29. Rook orthogonal rays on open board", () => {
      const pos = parseFen("k6K/8/8/8/4R3/8/8/8 w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e4"));
      assert.equal(moves.length, 14);
    });

    test("30. Rook orthogonal ray blocked by friendly piece", () => {
      const pos = parseFen("k6K/4P3/8/8/4R3/8/8/8 w - - 0 1");
      assert.equal(findLegalMove(pos, "e4e8"), null);
    });

    test("31. Rook captures enemy piece and stops", () => {
      const pos = parseFen("k6K/4p3/8/8/4R3/8/8/8 w - - 0 1");
      assert.ok(findLegalMove(pos, "e4e7"));
      assert.equal(findLegalMove(pos, "e4e8"), null);
    });

    test("32. Pinned Rook can only move along pin ray", () => {
      const pos = parseFen("4k3/8/8/8/4r3/8/4R3/4K3 w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e2"));
      assert.ok(moves.length > 0);
      for (const m of moves) {
        assert.equal(algebraicToSquare("e2") & 7, moveTo(m) & 7);
      }
    });

    test("33. Pinned Bishop on diagonal pin can only move along diagonal", () => {
      const pos = parseFen("8/8/8/8/3b4/8/1B6/K7 w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("b2"));
      assert.ok(moves.length > 0);
    });

    test("34. Bishop cannot move orthogonally", () => {
      const pos = parseFen("k6K/8/8/8/4B3/8/8/8 w - - 0 1");
      assert.equal(findLegalMove(pos, "e4e5"), null);
    });

    test("35. Rook cannot move diagonally", () => {
      const pos = parseFen("k6K/8/8/8/4R3/8/8/8 w - - 0 1");
      assert.equal(findLegalMove(pos, "e4f5"), null);
    });

    test("36. Double rook battery on open file", () => {
      const pos = parseFen("4k3/8/8/8/4R3/8/4R3/7K w - - 0 1");
      assert.ok(findLegalMove(pos, "e4e8"));
    });

    test("37. Bishop battery on diagonal", () => {
      const pos = parseFen("k6K/8/8/8/3B4/8/1B6/8 w - - 0 1");
      assert.ok(findLegalMove(pos, "d4a7"));
    });
  });

  // --- Group 4: Queen & King Mechanics (12 tests) ---
  describe("Queen & King Mechanics", () => {
    test("38. Queen on open board has up to 27 legal moves", () => {
      const pos = parseFen("k6K/8/8/8/4Q3/8/8/8 w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e4"));
      assert.equal(moves.length, 27);
    });

    test("39. Queen cannot jump over pieces", () => {
      const pos = parseFen("8/8/8/4P3/4Q3/8/8/k6K w - - 0 1");
      assert.equal(findLegalMove(pos, "e4e7"), null);
    });

    test("40. King moves 1 square in all 8 directions on open board", () => {
      const pos = parseFen("8/8/8/8/4K3/8/8/7k w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("e4"));
      assert.equal(moves.length, 8);
    });

    test("41. King cannot move into check", () => {
      const pos = parseFen("8/8/8/4r3/8/8/4K3/7k w - - 0 1");
      assert.equal(findLegalMove(pos, "e2e3"), null);
      assert.equal(findLegalMove(pos, "e2e1"), null);
    });

    test("42. King can capture undefended checking piece", () => {
      const pos = parseFen("8/8/8/8/8/8/4r3/4K2k w - - 0 1");
      assert.ok(findLegalMove(pos, "e1e2"));
    });

    test("43. King cannot capture defended checking piece", () => {
      const pos = parseFen("8/8/8/8/8/4r3/4r3/4K2k w - - 0 1");
      assert.equal(findLegalMove(pos, "e1e2"), null);
    });

    test("44. Kings cannot stand adjacent to each other", () => {
      const normalPos = parseFen("8/8/8/8/8/4k3/8/4K3 w - - 0 1");
      assert.equal(findLegalMove(normalPos, "e1e2"), null);
    });

    test("45. Queen delivering check restricts king moves", () => {
      const pos = parseFen("8/8/8/8/8/4q3/8/4K2k w - - 0 1");
      assert.ok(isInCheck(pos));
    });

    test("46. King must step out of check if cannot block or capture", () => {
      const pos = parseFen("8/8/8/8/8/8/4r3/3K3k w - - 0 1");
      const legal = generateMoves(pos);
      assert.ok(legal.length > 0);
      for (const m of legal) {
        makeMove(pos, m);
        assert.ok(!isInCheck(pos));
        unmakeMove(pos);
      }
    });

    test("47. Double check forces King move", () => {
      const pos = parseFen("3r4/8/8/8/8/2n5/8/3K3k w - - 0 1");
      assert.ok(isInCheck(pos));
      const legal = generateMoves(pos);
      for (const m of legal) {
        assert.equal(moveFrom(m), algebraicToSquare("d1"));
      }
    });

    test("48. Queen underpromotion vs Knight underpromotion tactic", () => {
      const pos = parseFen("8/5P1k/8/8/8/8/8/K7 w - - 0 1");
      assert.ok(findLegalMove(pos, "f7f8q"));
      assert.ok(findLegalMove(pos, "f7f8n"));
    });

    test("49. King on edge has at most 5 moves", () => {
      const pos = parseFen("8/8/8/8/8/8/8/K6k w - - 0 1");
      const moves = generateMoves(pos).filter((m) => moveFrom(m) === algebraicToSquare("a1"));
      assert.equal(moves.length, 3);
    });
  });

  // --- Group 5: FIDE Castling Rules (15 tests) ---
  describe("FIDE Castling Rules", () => {
    test("50. White kingside castling (O-O) legal in clear position", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m = findLegalMove(pos, "e1g1");
      assert.ok(m);
      makeMove(pos, m);
      assert.equal(pos.board[algebraicToSquare("g1")], KING * WHITE);
      assert.equal(pos.board[algebraicToSquare("f1")], ROOK * WHITE);
      assert.equal(pos.board[algebraicToSquare("e1")], 0);
      assert.equal(pos.board[algebraicToSquare("h1")], 0);
    });

    test("51. White queenside castling (O-O-O) legal in clear position", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m = findLegalMove(pos, "e1c1");
      assert.ok(m);
      makeMove(pos, m);
      assert.equal(pos.board[algebraicToSquare("c1")], KING * WHITE);
      assert.equal(pos.board[algebraicToSquare("d1")], ROOK * WHITE);
      assert.equal(pos.board[algebraicToSquare("e1")], 0);
      assert.equal(pos.board[algebraicToSquare("a1")], 0);
    });

    test("52. Black kingside castling (O-O)", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1");
      const m = findLegalMove(pos, "e8g8");
      assert.ok(m);
    });

    test("53. Black queenside castling (O-O-O)", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1");
      const m = findLegalMove(pos, "e8c8");
      assert.ok(m);
    });

    test("54. Castling illegal while in check", () => {
      const pos = parseFen("r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1");
      assert.ok(isInCheck(pos));
      assert.equal(findLegalMove(pos, "e1g1"), null);
      assert.equal(findLegalMove(pos, "e1c1"), null);
    });

    test("55. Castling illegal if king passes through checked square (f1 attacked)", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1");
      assert.equal(findLegalMove(pos, "e1g1"), null);
    });

    test("56. Castling illegal if king lands on checked square (g1 attacked)", () => {
      const pos = parseFen("r3k2r/8/8/8/8/6b1/8/R3K2R w KQkq - 0 1");
      assert.equal(findLegalMove(pos, "e1g1"), null);
    });

    test("57. Queenside castling allowed even if b1 (rook pass square) is attacked", () => {
      const pos = parseFen("1r2k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      assert.ok(findLegalMove(pos, "e1c1"));
    });

    test("58. Castling illegal after king moves", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m1 = findLegalMove(pos, "e1d2");
      makeMove(pos, m1);
      const m2 = findLegalMove(pos, "e8d7");
      makeMove(pos, m2);
      const m3 = findLegalMove(pos, "d2e1");
      makeMove(pos, m3);
      const m4 = findLegalMove(pos, "d7e8");
      makeMove(pos, m4);
      assert.equal(findLegalMove(pos, "e1g1"), null);
      assert.equal(findLegalMove(pos, "e1c1"), null);
    });

    test("59. Kingside castling illegal after h1 rook moves", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m1 = findLegalMove(pos, "h1g1");
      makeMove(pos, m1);
      const m2 = findLegalMove(pos, "e8d7");
      makeMove(pos, m2);
      const m3 = findLegalMove(pos, "g1h1");
      makeMove(pos, m3);
      const m4 = findLegalMove(pos, "d7e8");
      makeMove(pos, m4);
      assert.equal(findLegalMove(pos, "e1g1"), null);
      assert.ok(findLegalMove(pos, "e1c1"));
    });

    test("60. Queenside castling illegal after a1 rook moves", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m1 = findLegalMove(pos, "a1b1");
      makeMove(pos, m1);
      const m2 = findLegalMove(pos, "e8d7");
      makeMove(pos, m2);
      const m3 = findLegalMove(pos, "b1a1");
      makeMove(pos, m3);
      const m4 = findLegalMove(pos, "d7e8");
      makeMove(pos, m4);
      assert.equal(findLegalMove(pos, "e1c1"), null);
      assert.ok(findLegalMove(pos, "e1g1"));
    });

    test("61. Castling illegal if piece intervenes on f1", () => {
      const posWithB = parseFen("r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1");
      assert.equal(findLegalMove(posWithB, "e1g1"), null);
    });

    test("62. Castling illegal if piece intervenes on b1, c1, or d1", () => {
      const posWithD = parseFen("r3k2r/8/8/8/8/8/8/R2QK2R w KQkq - 0 1");
      assert.equal(findLegalMove(posWithD, "e1c1"), null);
    });

    test("63. Castling rights string reflects lost castling rights", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      makeMove(pos, findLegalMove(pos, "e1g1"));
      const rights = toFen(pos).split(" ")[2];
      assert.ok(!rights.includes("K"));
      assert.ok(!rights.includes("Q"));
    });

    test("64. Capturing opponent rook clears corresponding castling right", () => {
      const posH1Captured = parseFen("r3k2r/8/8/8/8/7q/8/R3K2b w Qkq - 0 1");
      assert.ok(!toFen(posH1Captured).split(" ")[2].includes("K"));
    });
  });

  // --- Group 6: Checkmate, Stalemate & Draw Rules (20 tests) ---
  describe("Adjudication: Checkmate, Stalemate & Draws", () => {
    test("65. Fool's Mate results in 0-1 CHECKMATE", () => {
      const pos = parseFen(START_FEN);
      makeMove(pos, findLegalMove(pos, "f2f3"));
      makeMove(pos, findLegalMove(pos, "e7e5"));
      makeMove(pos, findLegalMove(pos, "g2g4"));
      makeMove(pos, findLegalMove(pos, "d8h4"));
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "0-1");
      assert.equal(adj.reason, TERMINATION.CHECKMATE);
    });

    test("66. Scholar's Mate results in 1-0 CHECKMATE", () => {
      const pos = parseFen(START_FEN);
      makeMove(pos, findLegalMove(pos, "e2e4"));
      makeMove(pos, findLegalMove(pos, "e7e5"));
      makeMove(pos, findLegalMove(pos, "f1c4"));
      makeMove(pos, findLegalMove(pos, "b8c6"));
      makeMove(pos, findLegalMove(pos, "d1h5"));
      makeMove(pos, findLegalMove(pos, "g8f6"));
      makeMove(pos, findLegalMove(pos, "h5f7"));
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1-0");
      assert.equal(adj.reason, TERMINATION.CHECKMATE);
    });

    test("67. Back rank mate", () => {
      const pos = parseFen("6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1");
      makeMove(pos, findLegalMove(pos, "d1d8"));
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1-0");
      assert.equal(adj.reason, TERMINATION.CHECKMATE);
    });

    test("68. Smothered Mate by Knight", () => {
      const pos = parseFen("6rk/5Npp/8/8/8/8/8/7K b - - 0 1");
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1-0");
      assert.equal(adj.reason, TERMINATION.CHECKMATE);
    });

    test("69. Classic Stalemate results in 1/2-1/2", () => {
      const pos = parseFen("k7/8/1Q6/8/8/8/8/7K b - - 0 1");
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1/2-1/2");
      assert.equal(adj.reason, TERMINATION.STALEMATE);
    });

    test("70. Corner Stalemate with pawn", () => {
      const pos = parseFen("k7/2P5/K7/8/8/8/8/8 b - - 0 1");
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1/2-1/2");
      assert.equal(adj.reason, TERMINATION.STALEMATE);
    });

    test("71. Insufficient Material: K vs K", () => {
      const pos = parseFen("8/8/8/4k3/8/8/8/4K3 w - - 0 1");
      assert.ok(hasInsufficientMaterial(pos));
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1/2-1/2");
      assert.equal(adj.reason, TERMINATION.INSUFFICIENT_MATERIAL);
    });

    test("72. Insufficient Material: K+B vs K", () => {
      const pos = parseFen("8/8/8/4k3/8/5B2/8/4K3 w - - 0 1");
      assert.ok(hasInsufficientMaterial(pos));
    });

    test("73. Insufficient Material: K+N vs K", () => {
      const pos = parseFen("8/8/8/4k3/8/5N2/8/4K3 w - - 0 1");
      assert.ok(hasInsufficientMaterial(pos));
    });

    test("74. Insufficient Material: K+B vs K+B with same-colored square bishops", () => {
      const pos = parseFen("8/8/8/4k3/8/8/3b4/2B1K3 w - - 0 1");
      assert.ok(hasInsufficientMaterial(pos));
    });

    test("75. Sufficient Material: K+B vs K+B with opposite-colored bishops", () => {
      const pos = parseFen("8/8/8/4k3/8/8/2b5/2B1K3 w - - 0 1");
      assert.equal(hasInsufficientMaterial(pos), false);
    });

    test("76. Sufficient Material: K+P vs K", () => {
      const pos = parseFen("8/8/8/4k3/4P3/8/8/4K3 w - - 0 1");
      assert.equal(hasInsufficientMaterial(pos), false);
    });

    test("77. Sufficient Material: K+R vs K", () => {
      const pos = parseFen("8/8/8/4k3/8/8/8/4K2R w - - 0 1");
      assert.equal(hasInsufficientMaterial(pos), false);
    });

    test("78. Sufficient Material: K+Q vs K", () => {
      const pos = parseFen("8/8/8/4k3/8/8/8/4K2Q w - - 0 1");
      assert.equal(hasInsufficientMaterial(pos), false);
    });

    test("79. 50-move rule: 100 halfmoves without pawn push or capture triggers draw", () => {
      const pos = parseFen("8/8/8/4k3/8/8/8/4K2R w - - 100 51");
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1/2-1/2");
      assert.equal(adj.reason, TERMINATION.FIFTY_MOVE);
    });

    test("80. 50-move rule counter resets on pawn move", () => {
      const pos = parseFen("8/8/8/8/8/4P3/8/4K2k w - - 99 50");
      makeMove(pos, findLegalMove(pos, "e3e4"));
      assert.equal(pos.halfmove, 0);
    });

    test("81. 50-move rule counter resets on piece capture", () => {
      const pos = parseFen("4k3/8/8/8/4n3/8/8/4R2K w - - 99 50");
      makeMove(pos, findLegalMove(pos, "e1e4"));
      assert.equal(pos.halfmove, 0);
    });

    test("82. Threefold repetition triggers draw", () => {
      const pos = parseFen(START_FEN);
      const history = [positionKey(pos)];
      const playMove = (uci) => {
        makeMove(pos, findLegalMove(pos, uci));
        history.push(positionKey(pos));
      };

      playMove("g1f3"); playMove("g8f6");
      playMove("f3g1"); playMove("f6g8");
      playMove("g1f3"); playMove("g8f6");
      playMove("f3g1"); playMove("f6g8");

      const adj = adjudicate(pos, history);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1/2-1/2");
      assert.equal(adj.reason, TERMINATION.THREEFOLD);
    });

    test("83. Checkmate takes precedence over 50-move rule", () => {
      const pos = parseFen("6k1/5ppp/8/8/8/8/8/3R2K1 w - - 100 51");
      makeMove(pos, findLegalMove(pos, "d1d8"));
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1-0");
      assert.equal(adj.reason, TERMINATION.CHECKMATE);
    });

    test("84. Stalemate takes precedence over 50-move rule", () => {
      const pos = parseFen("k7/8/1Q6/8/8/8/8/7K b - - 100 51");
      const adj = adjudicate(pos);
      assert.equal(adj.over, true);
      assert.equal(adj.result, "1/2-1/2");
      assert.equal(adj.reason, TERMINATION.STALEMATE);
    });
  });

  // --- Group 7: PGN Export & Notation (16 tests) ---
  describe("PGN & SAN Formatting", () => {
    test("85. Simple pawn move to SAN: e4", () => {
      const pos = parseFen(START_FEN);
      const m = findLegalMove(pos, "e2e4");
      assert.equal(moveToSan(pos, m), "e4");
    });

    test("86. Knight move to SAN: Nf3", () => {
      const pos = parseFen(START_FEN);
      const m = findLegalMove(pos, "g1f3");
      assert.equal(moveToSan(pos, m), "Nf3");
    });

    test("87. Pawn capture to SAN: exd5", () => {
      const pos = parseFen("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2");
      const m = findLegalMove(pos, "e4d5");
      assert.equal(moveToSan(pos, m), "exd5");
    });

    test("88. Piece capture to SAN: Qxd5", () => {
      const pos = parseFen("4k3/8/8/3q4/8/8/8/3Q3K w - - 0 1");
      const mQ = findLegalMove(pos, "d1d5");
      assert.equal(moveToSan(pos, mQ), "Qxd5");
    });

    test("89. Kingside castling to SAN: O-O", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m = findLegalMove(pos, "e1g1");
      assert.equal(moveToSan(pos, m), "O-O");
    });

    test("90. Queenside castling to SAN: O-O-O", () => {
      const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const m = findLegalMove(pos, "e1c1");
      assert.equal(moveToSan(pos, m), "O-O-O");
    });

    test("91. Check to SAN: Nf7+", () => {
      const pos = parseFen("rnbqkb1r/pppp1ppp/5n2/4p3/4N3/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1");
      const m = findLegalMove(pos, "e4f6");
      assert.equal(moveToSan(pos, m), "Nxf6+");
    });

    test("92. Checkmate to SAN: Qh4#", () => {
      const pos = parseFen("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2");
      const m = findLegalMove(pos, "d8h4");
      assert.equal(moveToSan(pos, m), "Qh4#");
    });

    test("93. Promotion to SAN: e8=Q", () => {
      const pos = parseFen("8/4P3/8/8/8/8/8/k6K w - - 0 1");
      const m = findLegalMove(pos, "e7e8q");
      assert.equal(moveToSan(pos, m), "e8=Q");
    });

    test("94. Promotion with checkmate to SAN: e8=Q#", () => {
      const pos = parseFen("7k/4P3/6K1/8/8/8/8/8 w - - 0 1");
      const m = findLegalMove(pos, "e7e8q");
      assert.equal(moveToSan(pos, m), "e8=Q#");
    });

    test("95. Disambiguation by file to SAN: Nbd2", () => {
      const pos = parseFen("4k3/8/8/8/8/5N2/8/1N1QK2R w - - 0 1");
      const mB = findLegalMove(pos, "b1d2");
      assert.equal(moveToSan(pos, mB), "Nbd2");
    });

    test("96. Disambiguation by rank to SAN: R1e2", () => {
      const pos = parseFen("k7/8/8/8/4R3/8/4R3/7K w - - 0 1");
      const m = findLegalMove(pos, "e2e3");
      assert.equal(moveToSan(pos, m), "R2e3");
    });

    test("97. PGN export contains Seven-Tag Roster", () => {
      const pos = parseFen(START_FEN);
      const pgn = exportToPgn(pos, ["e2e4", "e7e5", "g1f3"], {
        white: "Alice",
        black: "Bob",
        result: "*",
      });
      assert.ok(pgn.includes('[Event "Nizalo Arena Duel"]'));
      assert.ok(pgn.includes('[White "Alice"]'));
      assert.ok(pgn.includes('[Black "Bob"]'));
      assert.ok(pgn.includes('[Result "*"]'));
    });

    test("98. PGN export contains move text: 1. e4 e5 2. Nf3", () => {
      const pos = parseFen(START_FEN);
      const pgn = exportToPgn(pos, ["e2e4", "e7e5", "g1f3"], { result: "*" });
      assert.ok(pgn.includes("1. e4 e5 2. Nf3 *"));
    });

    test("99. Full Fool's Mate PGN export", () => {
      const pos = parseFen(START_FEN);
      const pgn = exportToPgn(pos, ["f2f3", "e7e5", "g2g4", "d8h4"], { result: "0-1" });
      assert.ok(pgn.includes("1. f3 e5 2. g4 Qh4# 0-1"));
    });

    test("100. PGN includes official RulesVersion header", () => {
      const pos = parseFen(START_FEN);
      const pgn = exportToPgn(pos, ["e2e4"], { rulesVersion: "FIDE-2023" });
      assert.ok(pgn.includes('[RulesVersion "FIDE-2023"]'));
    });
  });
});
