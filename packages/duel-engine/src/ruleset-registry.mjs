/**
 * Nizalo Authoritative Ruleset Registry
 *
 * Single source of truth across both backend execution and frontend presentation.
 * Every game and variant registers its authoritative rules document here.
 * Marketing copy is strictly derived from this document to guarantee:
 * marketing description === actual engine rules.
 */

export const RulesetRegistry = {
  // 1. CHESS
  chess: {
    game: "chess",
    defaultVariant: "standard",
    variants: {
      standard: {
        variant: "standard",
        name: "Standard FIDE",
        nameAr: "شطرنج كلاسيكي معتمد",
        version: "FIDE-2023",
        source: "FIDE (Fédération Internationale des Échecs) Laws of Chess",
        effectiveDate: "2023-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8",
          dimensions: [8, 8],
          setupDescription: "Standard 32 pieces, White on ranks 1-2, Black on ranks 7-8",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_3_2", "blitz_5_3", "rapid_10_0", "classical_15_10"],
        },
        rulesDocument: {
          overview: "FIDE standard chess played on an 8x8 board. The objective is to checkmate the opponent's king.",
          setup: "16 White pieces and 16 Black pieces arranged according to standard international FIDE initial setup.",
          legalMoves: "Pawns advance forward, capture diagonally, option of initial double-step; Knights move in L-shape; Bishops diagonally; Rooks horizontally/vertically; Queen combines Rook and Bishop; King moves 1 square in any direction. Special moves include Castling (kingside/queenside, valid only if king and rook have not moved, squares between are clear, and king does not move through or into check), En Passant (capturing an enemy pawn that just made a double-step), and Promotion (pawn reaching 8th rank must promote to Queen, Rook, Bishop, or Knight).",
          winConditions: ["Checkmate (opponent king is under attack and has no legal move to escape)", "Resignation", "Opponent timeout on clock (provided player has mating material)"],
          drawConditions: [
            "Stalemate (player has no legal moves and king is not in check)",
            "Threefold repetition (exact same board position, turn, castling, and en passant rights repeated 3 times)",
            "50-move rule (50 consecutive moves by each side with no pawn advance and no piece capture)",
            "Insufficient material (King vs King, King + Bishop vs King, King + Knight vs King, King + Bishop vs King + Bishop on same-colored squares)",
            "Mutual draw agreement",
          ],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero random number generation or luck mechanics.",
          fairPlay: "Moves validated strictly server-side. Zero external engine assistance permitted.",
        },
      },
      blitz: {
        variant: "blitz",
        name: "FIDE Blitz (3m + 2s)",
        nameAr: "شطرنج خاطف 3+2",
        version: "FIDE-2023-BLITZ",
        source: "FIDE Handbook Appendix B: Blitz Rules",
        effectiveDate: "2023-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8",
          dimensions: [8, 8],
          setupDescription: "Standard 32 pieces, White on ranks 1-2, Black on ranks 7-8",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "blitz_3_2",
          allowedProfiles: ["blitz_3_2", "blitz_5_0"],
        },
        rulesDocument: {
          overview: "Fast-paced FIDE Blitz chess rules where speed and tactical intuition are paramount.",
          setup: "Standard FIDE board and piece configuration.",
          legalMoves: "Standard FIDE move rules apply. Strict clock management.",
          winConditions: ["Checkmate", "Resignation", "Timeout with sufficient mating material"],
          drawConditions: ["Stalemate", "Threefold repetition", "50-move rule", "Insufficient material", "Mutual draw agreement"],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill.",
          fairPlay: "Strict move latency monitoring and behavioral anti-cheat.",
        },
      },
    },
  },

  // 2. DOMINOES
  dominoes: {
    game: "dominoes",
    defaultVariant: "traditional_block",
    variants: {
      traditional_block: {
        variant: "traditional_block",
        name: "Traditional Block Dominoes",
        nameAr: "دومينو السحب التقليدي (بلوك)",
        version: "NIZALO-DOMINOES-BLOCK-v1",
        source: "International Domino Federation (FID) Block Standard",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "open-chain",
          setupDescription: "Double-six set of 28 tiles. 7 tiles dealt to each player in 2p duel; 14 tiles out of play.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "Classic two-player double-six block dominoes. No drawing from boneyard; tiles must match open ends.",
          setup: "28 bones (0-0 to 6-6). Each player is dealt 7 tiles. The remaining 14 tiles remain undealt and out of play.",
          legalMoves: "Opening player is determined by the highest double in hand (6-6 leads, or 5-5, etc.). If no player holds a double, the heaviest single tile leads. Subsequent moves must match the exposed pip count on either open end of the board chain.",
          passRule: "If a player has no tile in hand that matches either open end, they MUST pass. Passing when a legal move is in hand is illegal and rejected by the engine.",
          winConditions: [
            "Domino Out: First player to empty their hand of tiles wins immediately, scoring the sum of all pips in the opponent's hand.",
            "Blocked Game: When both players pass consecutively and no further move is possible, the player with the LOWER total pip count in hand wins, scoring the difference between the two hands.",
          ],
          drawConditions: ["Blocked game where both players hold an exactly equal total pip count."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "The initial tile shuffle and deal is generated from a cryptographically secure server seed with verifiable hash commitment.",
          fairPlay: "All tile matching and pip calculations evaluated authoritatively server-side.",
        },
      },
      all_fives: {
        variant: "all_fives",
        name: "American All-Fives (Muggins)",
        nameAr: "دومينو أمريكي (أول فايفز)",
        version: "NIZALO-DOMINOES-ALL-FIVES-v1",
        source: "World Domino Championship All-Fives / Muggins Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "open-chain-spinner",
          setupDescription: "Double-six set of 28 tiles. 7 tiles dealt; remaining 14 form the boneyard.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "American All-Fives dominoes where points are scored during play whenever the exposed open ends sum to a multiple of 5 (5, 10, 15, 20).",
          setup: "28 bones. 7 tiles dealt per player in 2-player mode. Remaining tiles constitute the boneyard.",
          legalMoves: "Highest double leads. Players match open ends. If a player cannot make a legal play, they must draw from the boneyard until a playable tile is acquired or the boneyard contains 2 tiles remaining.",
          scoring: "Whenever a played tile causes the exposed ends of the board to sum to a multiple of 5, the player scores that exact total immediately. On domino-out or block, the winner scores the opponent's pip total rounded to the nearest multiple of 5.",
          winConditions: ["First player to reach the target score (typically 100 or 150 points) across rounds, or highest score in single match."],
          drawConditions: ["Equal scores at round limit when mutually agreed."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "Shuffle and boneyard draws are generated via auditable cryptographic seed commitment.",
          fairPlay: "Server automatically calculates all open end combinations, multi-branch spinner sums, and pip roundings.",
        },
      },
    },
  },

  // 3. LUDO ROYALE
  ludo: {
    game: "ludo",
    defaultVariant: "classic_1v1",
    variants: {
      classic_1v1: {
        variant: "classic_1v1",
        name: "Ludo Royale 1v1",
        nameAr: "لودو رويال مبارزة 1 ضد 1",
        version: "NIZALO-LUDO-1V1-v1",
        source: "International Ludo Federation Standard Cross Track Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "cross-track",
          setupDescription: "Cross board with 52 perimeter track tiles, 8 safe squares, and 4 home columns.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_5_0", "rapid_10_0", "rapid_15_0"],
        },
        rulesDocument: {
          overview: "Competitive 1v1 Ludo on a cross-shaped circuit with dice rolling, capturing, safe zones, and home run.",
          setup: "Each player has 4 tokens in their respective yard. Players sit at opposite ends (offset 26 tiles).",
          legalMoves: "A roll of 6 is required to enter a token onto the track at the starting square. Tokens move clockwise by the rolled dice count (1-6). Rolling a 6 grants a bonus consecutive turn (maximum 3 consecutive sixes before turn forfeit).",
          capturesAndSafety: "Landing on an opposing player's token on a non-safe square captures it and sends it back to the owner's yard. Star tiles and starting tiles are safe squares where tokens cannot be captured.",
          homeRules: "Tokens travel 51 track spaces before entering their colored 5-space home stretch. Tokens can only reach the final Home triangle with an EXACT roll.",
          winConditions: ["First player to bring all 4 tokens into the Home triangle wins immediately."],
          drawConditions: ["None. A game always concludes with a decisive winner."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "RNG-BASED GAME: Dice outcomes are generated using a cryptographically auditable PRNG seed committed at match start. Not a zero-RNG game.",
          fairPlay: "Dice rolls and token movement bounds are enforced 100% server-side.",
        },
      },
      classic_4p: {
        variant: "classic_4p",
        name: "Ludo Royale 4-Player",
        nameAr: "لودو رويال 4 لاعبين",
        version: "NIZALO-LUDO-4P-v1",
        source: "International Ludo Federation 4-Player Championship Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "cross-track",
          setupDescription: "Full 4-quadrant cross board with Red, Green, Yellow, Blue home bases.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_15_0",
          allowedProfiles: ["rapid_15_0", "rapid_20_0"],
        },
        rulesDocument: {
          overview: "4-player free-for-all Ludo. 4 tokens each, standard turn rotation clockwise.",
          setup: "4 players in seats 0, 1, 2, 3 with starting squares at relative offsets 0, 13, 26, 39.",
          legalMoves: "Same move, capture, safe squares, and exact finish rules as 1v1.",
          winConditions: ["First player to bear all 4 tokens home wins 1st place. Subsequent placements ranked by finish order."],
          drawConditions: ["None."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "RNG-BASED GAME: Verifiable PRNG dice seed.",
          fairPlay: "Multiplayer turn timers, disconnect grace period, and strict anti-collusion monitoring.",
        },
      },
    },
  },

  // 4. BACKGAMMON
  backgammon: {
    game: "backgammon",
    defaultVariant: "standard_tavla",
    variants: {
      standard_tavla: {
        variant: "standard_tavla",
        name: "Classic Backgammon (Tavla)",
        nameAr: "طاولة الزهر الكلاسيكية",
        version: "NIZALO-BACKGAMMON-TAVLA-v1",
        source: "World Backgammon Federation (WBF) Tournament Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "points-24",
          setupDescription: "24 triangular points. 15 checkers per side (2 on 24, 5 on 13, 3 on 8, 5 on 6 mirrored).",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["rapid_5_0", "rapid_10_0", "classical_15_0"],
        },
        rulesDocument: {
          overview: "WBF tournament standard backgammon. Roll dice, advance checkers, hit opposing blots, and bear off.",
          setup: "15 checkers per player positioned on the 24-point board in standard layout. Seat 0 moves counter-clockwise (24->1); Seat 1 moves clockwise (1->24).",
          legalMoves: "A turn consists of 2 dice rolls (or 4 identical moves if doubles are rolled). Checkers on the bar MUST enter into the opponent's home board before any other checker may move. Landing on a single opposing checker ('blot') hits it to the bar. Points with 2 or more enemy checkers are blocked.",
          forcedMoveLogic: "Players must play both numbers of a roll if possible (or all four of a double). If only one number can be played, the larger number must be played.",
          bearingOff: "Once all 15 checkers are inside the player's home board, they may be borne off. A checker can be borne off if the die roll exactly matches its distance to the edge, or with an overage die if no checkers remain on higher points.",
          winConditions: [
            "Single Win: First player to bear off all 15 checkers (1x stake).",
            "Gammon: Winner bears off all 15 checkers before opponent bears off any checker (2x stake).",
            "Backgammon: Winner bears off all checkers while loser has borne off none and still has a checker on the bar or in the winner's home board (3x stake).",
          ],
          drawConditions: ["None. Backgammon is mathematically decisive."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "RNG-BASED GAME: All dice pairs are rolled authoritatively server-side via cryptographic seeds. Auditable dice roll history.",
          fairPlay: "Forced move logic and legal bearing off are computed and validated exclusively on the server.",
        },
      },
    },
  },

  // 5. SPEED MATH
  speed_math: {
    game: "speed_math",
    defaultVariant: "arithmetic_race",
    variants: {
      arithmetic_race: {
        variant: "arithmetic_race",
        name: "Arithmetic Sprint (60s)",
        nameAr: "سباق الرياضيات السريعة (60 ثانية)",
        version: "NIZALO-SPEED-MATH-v1",
        source: "Nizalo Pure Mental Calculation Standard",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "equation-panel",
          setupDescription: "Shared 60-second simultaneous race. Synchronized problem sequence generated from seed.",
        },
        turnModel: "SIMULTANEOUS",
        timeControls: {
          defaultProfile: "shared_60s",
          allowedProfiles: ["shared_30s", "shared_60s", "shared_90s"],
        },
        rulesDocument: {
          overview: "Simultaneous 1v1 mental arithmetic race. Both players receive the exact same problems at the exact same instant.",
          setup: "Synchronized match countdown with a shared 60-second timer. Identical problem stack generated deterministically from the match seed.",
          legalMoves: "Players submit numerical answers via numeric keypad or keyboard. Server checks correctness instantaneously.",
          scoring: "Each correct answer awards 100 base points plus time speed bonuses. Streak multipliers: 3 correct in a row awards 1.2x multiplier; 5+ in a row awards 1.5x multiplier. Incorrect answers reset streaks and deduct 50 points.",
          winConditions: ["Player with the highest total score at the expiration of the 60-second clock wins."],
          drawConditions: ["Equal scores at clock expiry. Tie-break resolved by lowest average response time among correct submissions."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "Problem sequence generated from match seed; 100% identical for both contenders.",
          fairPlay: "Anti-bot telemetry enforces millisecond-level input timing; submissions faster than human sensory threshold (< 120ms) are flagged and rejected.",
        },
      },
    },
  },

  // 6. XO (TIC-TAC-TOE)
  xo: {
    game: "xo",
    defaultVariant: "standard_3x3",
    variants: {
      standard_3x3: {
        variant: "standard_3x3",
        name: "Classic Tic-Tac-Toe (3x3)",
        nameAr: "إكس أو الكلاسيكية (3x3)",
        version: "NIZALO-XO-STANDARD-v1",
        source: "Standard International Combinatorial Game Theory Specification",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: false, // Solved game policy: Free to play only
        tournamentEligible: false,
        boardDefinition: {
          type: "grid-3x3",
          dimensions: [3, 3],
          setupDescription: "9 empty squares on a 3x3 grid. Player 1 is X, Player 2 is O.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "blitz_1_0",
          allowedProfiles: ["bullet_30s", "blitz_1_0"],
        },
        rulesDocument: {
          overview: "Standard 3x3 Tic-Tac-Toe. Perfect play under standard rules leads to a draw. Reserved for free training.",
          setup: "Empty 3x3 grid. Seat 0 plays X and moves first. Seat 1 plays O.",
          legalMoves: "A player places their mark on any unoccupied cell (0 to 8).",
          winConditions: ["Three of the player's marks in a horizontal, vertical, or diagonal line."],
          drawConditions: ["All 9 cells filled without either player achieving 3 in a line (Cat's Game)."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic zero luck. Solved game.",
          fairPlay: "Exhaustive state space validation (765 essentially unique positions) prevents any illegal states.",
        },
      },
    },
  },

  // 7. CONNECT FOUR
  connect_four: {
    game: "connect_four",
    defaultVariant: "standard_7x6",
    variants: {
      standard_7x6: {
        variant: "standard_7x6",
        name: "Standard Connect Four (7x6)",
        nameAr: "أربعة على التوالي (7x6)",
        version: "NIZALO-CONNECT-FOUR-v1",
        source: "Milton Bradley / Hasbro Official Tournament Specification",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: false, // Solved game policy: Free to play only
        tournamentEligible: false,
        boardDefinition: {
          type: "grid-7x6-gravity",
          dimensions: [7, 6],
          setupDescription: "Vertical grid of 7 columns and 6 rows.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "blitz_3_0",
          allowedProfiles: ["blitz_1_0", "blitz_3_0", "rapid_5_0"],
        },
        rulesDocument: {
          overview: "Official standard 7x6 vertical Connect Four. Drop colored discs into columns under gravity to connect 4 in a line.",
          setup: "7 columns, 6 rows. Red moves first (Seat 0), Yellow second (Seat 1).",
          legalMoves: "Discs are dropped into any of the 7 columns that has not yet reached its maximum capacity of 6 discs. The disc falls by gravity to the lowest unoccupied slot in that column.",
          winConditions: ["First player to form a continuous line of 4 discs horizontally, vertically, or diagonally wins immediately."],
          drawConditions: ["All 42 slots filled without a 4-in-a-row combination."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic combinatorial game. Zero luck.",
          fairPlay: "Column bounds and gravity mechanics are computed authoritatively on the server.",
        },
      },
    },
  },

  // 8. CHECKERS
  checkers: {
    game: "checkers",
    defaultVariant: "american_standard",
    variants: {
      american_standard: {
        variant: "american_standard",
        name: "American Checkers / English Draughts",
        nameAr: "الداما الأمريكية / الإنجليزية (8x8)",
        version: "WCDF-AMERICAN-v1",
        source: "World Checkers / Draughts Federation (WCDF) Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8-dark-cells",
          dimensions: [8, 8],
          setupDescription: "8x8 checkerboard. 12 pieces per side positioned on dark squares in ranks 1-3 and 6-8.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["blitz_3_2", "rapid_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "WCDF American Checkers / English Draughts. Mandatory jump captures, multi-jumping, and king crowning.",
          setup: "Played on the 32 dark squares of an 8x8 board. Dark pieces (Seat 0) move first, Light pieces (Seat 1) move second.",
          legalMoves: "Uncrowned pieces move diagonally forward 1 step to an adjacent unoccupied dark square. When an opponent piece is diagonally adjacent and the square immediately beyond is vacant, jumping is MANDATORY. If multiple jumps are available, the player may choose which jump sequence to initiate, but MUST complete all consecutive jumps in that chain. Reaching the opponent's back rank crowns a piece as a King, ending that turn. Kings can move and jump both forwards and backwards.",
          winConditions: ["Capture all opponent pieces", "Leave opponent with zero legal moves", "Resignation", "Opponent clock timeout"],
          drawConditions: ["40 consecutive moves by each side with no capture and no king promotion", "Threefold position repetition", "Mutual draw agreement"],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          fairPlay: "Mandatory capture enforcement is validated strictly server-side.",
        },
      },
    },
  },

  // 9. REVERSI / OTHELLO
  reversi: {
    game: "reversi",
    defaultVariant: "standard_othello",
    variants: {
      standard_othello: {
        variant: "standard_othello",
        name: "World Othello Federation Standard (8x8)",
        nameAr: "ريفيرسي / أوثيلو الدولية (8x8)",
        version: "WOF-OTHELLO-v1",
        source: "World Othello Federation (WOF) Official Tournament Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8",
          dimensions: [8, 8],
          setupDescription: "8x8 board with center 4 squares occupied: d4=White, e4=Black, d5=Black, e5=White.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["rapid_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "WOF official Reversi/Othello. Trap and outflank opponent discs between your own to flip them.",
          setup: "8x8 board. Black (Seat 0) moves first. White (Seat 1) moves second.",
          legalMoves: "A legal move consists of placing a disc on an empty square such that at least one continuous line of opponent discs (in any orthogonal or diagonal direction) is trapped between the newly placed disc and another disc of the moving player's color. All trapped discs are flipped.",
          forcedPass: "If a player has no legal move available, they MUST pass their turn. If neither player can make a legal move (or board is full), the game ends immediately.",
          winConditions: ["Player with the greater number of discs of their color on the board at game end wins."],
          drawConditions: ["Exact tie in disc counts at game end (e.g. 32-32)."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          fairPlay: "Outflanking lines and multi-directional flips are processed atomically on the server.",
        },
      },
    },
  },

  // 10. GOMOKU
  gomoku: {
    game: "gomoku",
    defaultVariant: "standard_freestyle",
    variants: {
      standard_freestyle: {
        variant: "standard_freestyle",
        name: "International Gomoku (Freestyle)",
        nameAr: "جوموكو الحرة (خمسة أو أكثر)",
        version: "RIF-GOMOKU-FREESTYLE-v1",
        source: "Renju International Federation (RIF) Gomoku Division",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-15x15",
          dimensions: [15, 15],
          setupDescription: "15x15 grid of 225 intersection points. Center point is H8.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["blitz_3_0", "rapid_5_0"],
        },
        rulesDocument: {
          overview: "Renju International Federation standard Freestyle Gomoku. First player to place an unbroken line of 5 or more stones wins.",
          setup: "Empty 15x15 grid. Black (Seat 0) plays first at center intersection H8. White (Seat 1) plays second.",
          legalMoves: "Stones are placed alternately on any unoccupied intersection of the 15x15 grid. Once placed, stones are never moved or captured.",
          winConditions: ["First player to form an unbroken horizontal, vertical, or diagonal chain of 5 or more stones wins immediately."],
          drawConditions: ["All 225 intersections filled without either player achieving 5 in a row."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          fairPlay: "Line detection across all 4 axes is verified strictly on the server.",
        },
      },
      rif_tournament: {
        variant: "rif_tournament",
        name: "RIF Tournament Gomoku (Exact 5)",
        nameAr: "جوموكو بطولات RIF (خمسة بالضبط)",
        version: "RIF-GOMOKU-EXACT5-v1",
        source: "Renju International Federation (RIF) Tournament Rules",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-15x15",
          dimensions: [15, 15],
          setupDescription: "15x15 grid of 225 intersection points. Mandatory opening at H8 (112).",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["rapid_5_0", "classical_10_0"],
        },
        rulesDocument: {
          overview: "Official RIF tournament Gomoku with strict center opening and exact-five winning condition (overlines do not count as wins).",
          setup: "Empty 15x15 grid. Black must place first stone at H8 (cell 112).",
          legalMoves: "Stones are placed alternately on any unoccupied intersection. First move must be H8.",
          winConditions: ["First player to form an unbroken chain of EXACTLY five stones wins. Overlines (6+ stones) do NOT award a win."],
          drawConditions: ["All 225 intersections filled without either player achieving an exact 5."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          fairPlay: "Strict center opening and exact-five overline validation enforced server-side.",
        },
      },
    },
  },

  // 11. SEEGA
  seega: {
    game: "seega",
    defaultVariant: "traditional_bedouin_5x5",
    variants: {
      traditional_bedouin_5x5: {
        variant: "traditional_bedouin_5x5",
        name: "Traditional Bedouin Seega (5x5)",
        nameAr: "السيجة البدوية التقليدية (5x5)",
        version: "NIZALO-SEEGA-BEDOUIN-v1",
        source: "Historical Egyptian & North African Bedouin Mancala/Board Game Archives (Lane, 1836; Bell, 1960)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-5x5",
          dimensions: [5, 5],
          setupDescription: "5x5 grid of 25 squares. Center square (al-wasat) remains empty in phase 1.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["rapid_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "Traditional historical Arabic tactical board game played in two distinct phases: Drop Phase followed by Custodial Capture Movement.",
          setup: "5x5 board. Each player has 12 stones. Phase 1: Players alternate placing 2 stones at a time on empty squares, leaving the central square ('al-wasat') vacant until all 24 stones are placed.",
          legalMoves: "Phase 1: Place 2 stones on empty squares (except center). Phase 2: Slide orthogonally into an adjacent vacant square. Custodial capture removes enemy stone flanked on opposite sides. Center square (al-wasat) provides sanctuary.",
          movementAndCapture: "Phase 2: Pieces slide orthogonally (up, down, left, right) one square into an adjacent vacant square. Custodial capture: If a player's move brackets an opponent's stone between two of their own stones along a straight line, the trapped enemy stone is captured and removed. If a move results in a capture, the mover continues their turn with the SAME piece if another capture can be executed.",
          sanctuaryRule: "The central square (al-wasat) confers sanctuary: a piece occupying the center square cannot be captured by flanking.",
          winConditions: ["Capture all opponent stones", "Block the opponent so they have no legal moves remaining", "Resignation", "Clock timeout"],
          drawConditions: ["Threefold repetition of board position", "Both players reduced to equal stones with no further captures possible"],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          fairPlay: "Two-phase game state transitions and multi-capture sequences enforced authoritatively on the server.",
        },
      },
    },
  },
};

/**
 * Helper to retrieve an authoritative ruleset for a game and variant.
 */
export function getRuleset(gameId, variantId = null) {
  const normalizedGame = gameId.replace(/-/g, "_");
  const entry = RulesetRegistry[normalizedGame] || RulesetRegistry[gameId];
  if (!entry) throw new Error(`Unknown game in RulesetRegistry: '${gameId}'`);

  const variantKey = variantId || entry.defaultVariant;
  const variant = entry.variants[variantKey] || entry.variants[entry.defaultVariant];
  if (!variant) throw new Error(`Unknown variant '${variantId}' for game '${gameId}'`);

  return {
    game: entry.game,
    ...variant,
  };
}

/**
 * Returns all rulesets in a flat list for discovery and auditing.
 */
export function listAllRulesets() {
  const result = [];
  for (const [gameKey, gameEntry] of Object.entries(RulesetRegistry)) {
    for (const [variantKey, variant] of Object.entries(gameEntry.variants)) {
      result.push({
        game: gameEntry.game,
        ...variant,
      });
    }
  }
  return result;
}
