let humanElo = 1400; // Elo Estimado Inicial do Humano (W)
let lastTurn = "w";
const BOT_MOVE_DELAY = 260; // Pequeno delay para simular pensamento
let lastEval = null; // Avaliação do tabuleiro após o último lance do Bot (Perspetiva do Branco)
let boardStateBeforePlayerMove = null; // Guarda o estado do tabuleiro antes do Jogador (W) mover

// Constantes para a Fórmula Estatística de Elo (Usadas apenas para mapeamento de CP em log)
const K_FACTOR = 30; // Mantido, mas não usado na lógica de ajuste de Elo
const C_FACTOR = 250; // Valor padrão para mapear centipeões para probabilidade em análises (Stockfish, etc.)

// Constantes para Classificação de Lances (CP Loss)
const CLASSIFICATION_THRESHOLDS = {
    BEST_THRESHOLD: 5,        
    EXCELLENT_THRESHOLD: 15,  
    GOOD_THRESHOLD: 30,       
    INACCURACY_THRESHOLD: 50, 
    MISTAKE_THRESHOLD: 100,   
    BLUNDER_THRESHOLD: 200,   
};

// Valores de material (Também usados para Move Ordering MVV/LVA)
const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
// Versão simplificada para pontuação de lances (MVV/LVA)
const MOVE_VALUE = { P: 100, N: 300, B: 300, R: 500, Q: 900, K: 0 };


// ********** TABELAS DE PONTUAÇÃO POSICIONAL (PSTs) **********
const PSTs = {
  P: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  N: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  B: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  R: [
    [0, 0, 0, 5, 5, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5], 
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  Q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  K_MIDDLE: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
  K_END: [
    [-50, -30, -30, -30, -30, -30, -30, -50],
    [-30, -10, -10, -10, -10, -10, -10, -30],
    [-30, -10, 0, 0, 0, 0, -10, -30],
    [-30, -10, 0, 5, 5, 0, -10, -30],
    [-30, -10, 0, 5, 5, 0, -10, -30],
    [-30, -10, 0, 0, 0, 0, -10, -30],
    [-30, -10, -10, -10, -10, -10, -10, -30],
    [-50, -30, -30, -30, -30, -30, -30, -50],
  ],
};

function cloneBoard(b) {
  return b.map(row => row.map(p => (p ? { type: p.type, color: p.color } : null)));
}

function flipPst(pst) {
  return pst.slice().reverse();
}

// ********** FUNÇÕES DE UTILIDADE E SIMULAÇÃO DE ESTADO **********

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isSquareAttackedOnState(boardState, r, c, byColor) {
  const enemy = byColor;
  const friend = enemy === "w" ? "b" : "w";

  // peões
  const pawnDir = enemy === "w" ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir;
    const pc = c + dc;
    if (inBounds(pr, pc)) {
      const p = boardState[pr][pc];
      if (p && p.color === enemy && p.type === "P") return true;
    }
  }

  // cavalos
  const knightDeltas = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightDeltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = boardState[nr][nc];
      if (p && p.color === enemy && p.type === "N") return true;
    }
  }

  // bispo/dama (diagonais)
  const bishopDirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of bishopDirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = boardState[nr][nc];
      if (!p) {
        nr += dr;
        nc += dc;
        continue;
      }
      if (p.color === friend) break;
      if (p.color === enemy && (p.type === "B" || p.type === "Q")) return true;
      break;
    }
  }

  // torre/dama (retas)
  const rookDirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of rookDirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = boardState[nr][nc];
      if (!p) {
        nr += dr;
        nc += dc;
        continue;
      }
      if (p.color === friend) break;
      if (p.color === enemy && (p.type === "R" || p.type === "Q")) return true;
      break;
    }
  }

  // rei inimigo (1 casa em volta)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc)) {
        const p = boardState[nr][nc];
        if (p && p.color === enemy && p.type === "K") return true;
      }
    }
  }

  return false;
}

function isKingInCheckOnState(boardState, color) {
  let kr = -1;
  let kc = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (p && p.color === color && p.type === "K") {
        kr = r;
        kc = c;
        break;
      }
    }
  }
  if (kr === -1) return false;
  const enemy = color === "w" ? "b" : "w";
  return isSquareAttackedOnState(boardState, kr, kc, enemy);
}

function _wouldLeaveKingInCheck(boardState, fromR, fromC, move, color, epTarget) {
  const temp = cloneBoard(boardState);
  const piece = temp[fromR][fromC];
  if (!piece) return false;

  // en passant
  if (move.flags && move.flags.enpassant) {
    temp[fromR][move.c] = null;
  }

  // roque
  if (move.flags && move.flags.castling) {
    const row = color === "w" ? 7 : 0;
    temp[fromR][fromC] = null;
    if (move.flags.castling === "king") {
      temp[row][6] = piece;
      temp[row][4] = null;
      temp[row][5] = temp[row][7];
      temp[row][7] = null;
    } else {
      temp[row][2] = piece;
      temp[row][4] = null;
      temp[row][3] = temp[row][0];
      temp[row][0] = null;
    }
  } else {
    // movimento normal
    temp[move.r][move.c] = piece;
    temp[fromR][fromC] = null;

    // promoção
    if (piece.type === "P" && (move.r === 0 || move.r === 7)) {
      temp[move.r][move.c] = { type: "Q", color: piece.color };
    }
  }

  return isKingInCheckOnState(temp, color);
}

function _applyMoveToBoardState(boardState, from, to, flags, km, rm, ep) {
    const nextBoardState = cloneBoard(boardState);
    const nextKm = JSON.parse(JSON.stringify(km));
    const nextRm = JSON.parse(JSON.stringify(rm));
    let nextEp = ep ? { r: ep.r, c: ep.c } : null;

    const p = nextBoardState[from.r][from.c];
    if (!p) return { board: nextBoardState, km: nextKm, rm: nextRm, ep: nextEp };

    // Roque
    if (flags.castling) {
        const color = p.color;
        const row = color === "w" ? 7 : 0;

        if (flags.castling === "king") {
            nextBoardState[row][6] = p;
            nextBoardState[from.r][from.c] = null;
            nextBoardState[row][5] = nextBoardState[row][7];
            nextBoardState[row][7] = null;
        } else {
            nextBoardState[row][2] = p;
            nextBoardState[from.r][from.c] = null;
            nextBoardState[row][3] = nextBoardState[row][0];
            nextBoardState[row][0] = null;
        }

        nextKm[color] = true;
        nextRm[color].a = true;
        nextRm[color].h = true;
        nextEp = null;
    } else {
        // Captura En passant
        if (flags.enpassant) {
            nextBoardState[from.r][to.c] = null; // Remove o peão capturado
        }

        // Movimento normal
        const captured = nextBoardState[to.r][to.c];
        nextBoardState[to.r][to.c] = p;
        nextBoardState[from.r][from.c] = null;

        // Duplo de peão -> marca en passant
        if (flags.pawnDouble) {
            nextEp = { r: (from.r + to.r) / 2, c: from.c };
        } else {
            nextEp = null;
        }

        // Promoção automática para dama
        if (p.type === "P" && (to.r === 0 || to.r === 7)) {
            p.type = "Q";
        }

        // Flags de rei/torre
        if (p.type === "K") nextKm[p.color] = true;
        if (p.type === "R") {
            if (from.c === 0) nextRm[p.color].a = true;
            if (from.c === 7) nextRm[p.color].h = true;
        }

        // Se capturou uma torre, a possibilidade de roque do inimigo desaparece
        if (captured && captured.type === "R") {
            const enemy = captured.color;
            if (to.r === (enemy === 'w' ? 7 : 0)) {
                if (to.c === 0) nextRm[enemy].a = true;
                if (to.c === 7) nextRm[enemy].h = true;
            }
        }
    }

    return { board: nextBoardState, km: nextKm, rm: nextRm, ep: nextEp };
}

function _getMovesForPieceOnState(boardState, r, c, km, rm, epTarget) {
    const p = boardState[r][c];
    if (!p) return [];

    const moves = [];
    const dir = p.color === "w" ? -1 : 1;
    const enemy = p.color === "w" ? "b" : "w";

    // Lógica do Peão
    if (p.type === "P") {
        const front = r + dir;
        if (inBounds(front, c) && !boardState[front][c]) {
            moves.push({ r: front, c, flags: { pawnMove: true } });

            const startRow = p.color === "w" ? 6 : 1;
            const doubleRow = r + 2 * dir;
            if (r === startRow && inBounds(doubleRow, c) && !boardState[doubleRow][c]) {
                moves.push({ r: doubleRow, c, flags: { pawnDouble: true } });
            }
        }

        // capturas
        for (const dc of [-1, 1]) {
            const cr = r + dir;
            const cc = c + dc;
            if (inBounds(cr, cc) && boardState[cr][cc] && boardState[cr][cc].color === enemy) {
                moves.push({ r: cr, c: cc, flags: { capture: true } });
            }

            // en passant
            if (epTarget && epTarget.r === cr && epTarget.c === cc) {
                moves.push({
                    r: cr,
                    c: cc,
                    flags: { enpassant: true },
                });
            }
        }
    }
    // Lógica do Cavalo
    else if (p.type === "N") {
        const deltas = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1],
        ];

        for (const [dr, dc] of deltas) {
            const nr = r + dr;
            const nc = c + dc;
            if (!inBounds(nr, nc)) continue;

            const target = boardState[nr][nc];
            if (!target) {
                moves.push({ r: nr, c: nc });
            } else if (target.color !== p.color) {
                moves.push({ r: nr, c: nc, flags: { capture: true } });
            }
        }
    }
    // Lógica Bispo/Torre/Dama
    else if (p.type === "B" || p.type === "R" || p.type === "Q") {
        const dirs = [];
        if (p.type === "B" || p.type === "Q") {
            dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }
        if (p.type === "R" || p.type === "Q") {
            dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        }

        for (const [dr, dc] of dirs) {
            let nr = r + dr;
            let nc = c + dc;

            while (inBounds(nr, nc)) {
                if (!boardState[nr][nc]) {
                    moves.push({ r: nr, c: nc });
                } else {
                    if (boardState[nr][nc].color !== p.color) {
                        moves.push({ r: nr, c: nc, flags: { capture: true } });
                    }
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }
    }
    // Lógica do Rei
    else if (p.type === "K") {
        // Movimentos normais
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (!inBounds(nr, nc)) continue;

                const target = boardState[nr][nc];
                if (!target) {
                    moves.push({ r: nr, c: nc });
                } else if (target.color !== p.color) {
                    moves.push({ r: nr, c: nc, flags: { capture: true } });
                }
            }
        }

        // Roque (usa km e rm passados como argumento)
        if (!km[p.color]) {
            const row = p.color === "w" ? 7 : 0;
            const enemy = p.color === "w" ? "b" : "w";

            if (!isKingInCheckOnState(boardState, p.color)) {
                // Roque pequeno (lado do rei)
                if (
                    !rm[p.color].h && boardState[row][5] === null && boardState[row][6] === null && boardState[row][7] && boardState[row][7].type === "R" && boardState[row][7].color === p.color &&
                    !isSquareAttackedOnState(boardState, row, 4, enemy) &&
                    !isSquareAttackedOnState(boardState, row, 5, enemy) &&
                    !isSquareAttackedOnState(boardState, row, 6, enemy)
                ) {
                    moves.push({ r: row, c: 6, flags: { castling: "king" } });
                }

                // Roque grande (lado da dama)
                if (
                    !rm[p.color].a && boardState[row][1] === null && boardState[row][2] === null && boardState[row][3] === null && boardState[row][0] && boardState[row][0].type === "R" && boardState[row][0].color === p.color &&
                    !isSquareAttackedOnState(boardState, row, 4, enemy) &&
                    !isSquareAttackedOnState(boardState, row, 3, enemy) &&
                    !isSquareAttackedOnState(boardState, row, 2, enemy)
                ) {
                    moves.push({ r: row, c: 2, flags: { castling: "queen" } });
                }
            }
        }
    }

    // Filtra movimentos que deixam o próprio rei em xeque
    return moves.filter(m => !_wouldLeaveKingInCheck(boardState, r, c, m, p.color, epTarget));
}

// Obtém todos os movimentos legais para uma cor num estado arbitrário
function getLegalMovesOnBoard(playerColor, boardState, km, rm, ep) {
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = boardState[r][c];
            if (p && p.color === playerColor) {
                const moves = _getMovesForPieceOnState(boardState, r, c, km, rm, ep);
                moves.forEach(m => allMoves.push({
                    from: { r, c },
                    to: { r: m.r, c: m.c },
                    flags: m.flags || {}
                }));
            }
        }
    }
    return allMoves;
}

// ********** FUNÇÃO DE AVALIAÇÃO DE TABULEIRO - evalBoard **********
function evalBoard(b) {
  let score = 0;
  let nonPawnMaterial = 0;

  const whitePawnsByFile = Array(8).fill(0);
  const blackPawnsByFile = Array(8).fill(0);

  // 1. CÁLCULO DA FASE E MATERIAL
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;

      const v = VALUES[p.type];
      const sign = p.color === "w" ? 1 : -1;

      score += sign * v;
      if (p.type !== "P" && p.type !== "K") nonPawnMaterial += v;

      if (p.type === "P") {
        if (p.color === "w") whitePawnsByFile[c]++;
        else blackPawnsByFile[c]++;
      }
    }
  }

  const maxNonPawn = 4100;
  let phase = nonPawnMaterial / maxNonPawn;
  if (phase < 0) phase = 0;
  if (phase > 1) phase = 1;

  // 2. CÁLCULO POSICIONAL (PSTs e Heurísticas)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;

      const sign = p.color === "w" ? 1 : -1;
      let pst = null;

      if (p.type === "K") {
        pst = phase > 0.35 ? PSTs.K_MIDDLE : PSTs.K_END;
      } else {
        pst = PSTs[p.type];
      }

      const table = p.color === "w" ? pst : flipPst(pst);
      score += sign * table[r][c];

      // Heurísticas de Peão
      if (p.type === "P") {
        const ownPawns = p.color === "w" ? whitePawnsByFile : blackPawnsByFile;
        // Peão Dobrado
        if (ownPawns[c] > 1) {
          score -= sign * 15;
        }
        // Peão Isolado
        const left = c > 0 ? ownPawns[c - 1] : 0;
        const right = c < 7 ? ownPawns[c + 1] : 0;
        if (ownPawns[c] > 0 && left === 0 && right === 0) {
          score -= sign * 10;
        }
      }

      // Bónus de Torre na 7ª/2ª Fila
      if (p.type === "R") {
          if (p.color === "w" && r === 1) score += 20;
          if (p.color === "b" && r === 6) score -= 20;
      }
    }
  }

  return score;
}

// ********** FUNÇÃO DE QUIESCENCE SEARCH (QS) **********
const QS_MAX_DEPTH = 5; 
const MATE_SCORE = 1000000;

function quiescence(simState, alpha, beta, color, qsDepth) {
  const playerColor = color === 1 ? "w" : "b";

  // Verifica se o jogo acabou
  const movesCheck = getLegalMovesOnBoard(playerColor, simState.board, simState.km, simState.rm, simState.ep);
  if (!movesCheck.length) {
    const isCheck = isKingInCheckOnState(simState.board, playerColor);
    if (isCheck) return -MATE_SCORE + qsDepth; // Mate (preferir mate mais rápido)
    return 0; // Empate
  }

  // 1. Stand-pat: Avalia a posição ATUAL
  let bestScore = color * evalBoard(simState.board);

  alpha = Math.max(alpha, bestScore);
  if (alpha >= beta || qsDepth === 0) return bestScore;

  // 2. Geração de Movimentos TÁTICOS (apenas capturas e promoções)
  const moves = getLegalMovesOnBoard(playerColor, simState.board, simState.km, simState.rm, simState.ep);
  
  const tacticalMoves = moves.filter(m => m.flags.capture || m.flags.enpassant || (m.flags.pawnMove && (m.to.r === 0 || m.to.r === 7)));

  // ** OTIMIZAÇÃO: ORDENAÇÃO DE LANCES TÁTICOS (MVV/LVA)**
  for (const move of tacticalMoves) {
      move.score = scoreMove(move, simState.board);
  }
  tacticalMoves.sort((a, b) => b.score - a.score);


  for (const move of tacticalMoves) {
    const nextSimState = _applyMoveToBoardState(
        simState.board,
        move.from,
        move.to,
        move.flags || {},
        simState.km,
        simState.rm,
        simState.ep
    );
    
    const score = -quiescence(nextSimState, -beta, -alpha, -color, qsDepth - 1);

    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, bestScore);
    if (alpha >= beta) break;
  }

  return bestScore;
}


// ********** ALGORITMO MINIMAX / NEGAMAX COM ALPHA-BETA **********
function negamax(simState, depth, alpha, beta, color) {
  const playerColor = color === 1 ? "w" : "b";

  if (depth === 0) {
    return quiescence(simState, alpha, beta, color, QS_MAX_DEPTH);
  }

  const moves = getLegalMovesOnBoard(playerColor, simState.board, simState.km, simState.rm, simState.ep);

  if (!moves.length) {
    const isCheck = isKingInCheckOnState(simState.board, playerColor);
    if (isCheck) return -MATE_SCORE - depth; 
    return 0; // Empate
  }

  // ** OTIMIZAÇÃO: ORDENAÇÃO DE LANCES (MVV/LVA)**
  for (const move of moves) {
      move.score = scoreMove(move, simState.board);
  }
  // Ordena por score decrescente (melhor lance primeiro)
  moves.sort((a, b) => b.score - a.score);


  let bestScore = -Infinity;

  for (const move of moves) {
    const nextSimState = _applyMoveToBoardState(
        simState.board,
        move.from,
        move.to,
        move.flags || {},
        simState.km,
        simState.rm,
        simState.ep
    );

    const score = -negamax(nextSimState, depth - 1, -beta, -alpha, -color);

    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, bestScore);
    if (alpha >= beta) break;
  }

  return bestScore;
}

// ********** LÓGICA DE PONTUAÇÃO E ORDENAÇÃO DE LANCES (MVV/LVA) **********
/**
 * Atribui uma pontuação ao lance para ordenação (MVV/LVA).
 * Prioriza capturas de maior valor com peças de menor valor.
 * @param {object} move - Objeto de movimento com from/to/flags.
 * @param {Array<Array<object>>} board - Estado do tabuleiro.
 * @returns {number} Pontuação do lance.
 */
function scoreMove(move, board) {
    let score = 0;

    // 1. Pontuação para Promoção (o mais valioso)
    // Se a peça em 'from' for um Peão, e 'to' for a última/primeira linha.
    const movingPiece = board[move.from.r][move.from.c];
    if (movingPiece && movingPiece.type === 'P' && (move.to.r === 0 || move.to.r === 7)) {
        // Promoção para Dama é a mais valiosa. Atribuímos um score alto (e.g., 9000)
        return 9000; 
    }

    // 2. Pontuação para Capturas (MVV/LVA)
    if (move.flags.capture || move.flags.enpassant) {
        let capturedType;
        if (move.flags.enpassant) {
            capturedType = 'P'; // Peão capturado
        } else {
            const capturedPiece = board[move.to.r][move.to.c];
            capturedType = capturedPiece ? capturedPiece.type : null;
        }

        if (capturedType) {
            const attackerType = movingPiece.type;

            // FÓRMULA MVV/LVA: 10 * Valor da Vítima - Valor do Atacante / 10
            // Peão (100) capturando Dama (900): 10*900 - 100/10 = 8990 (Prioridade máxima)
            score = 10 * MOVE_VALUE[capturedType] - MOVE_VALUE[attackerType] / 10;
        }
    } 
    
    // 3. Pontuação para outros lances (baixo)
    // Se não for captura nem promoção, o score é 0.
    return score;
}

// ********** LÓGICA DE CLASSIFICAÇÃO **********

function classifyMove(cpLoss) {
  // A perda de CP nunca deve ser negativa
  cpLoss = Math.max(0, cpLoss); 

  if (cpLoss < CLASSIFICATION_THRESHOLDS.BEST_THRESHOLD) {
    return "Melhor Lance (Best)";
  } else if (cpLoss < CLASSIFICATION_THRESHOLDS.EXCELLENT_THRESHOLD) {
    return "Excelente (Excellent)";
  } else if (cpLoss < CLASSIFICATION_THRESHOLDS.GOOD_THRESHOLD) {
    return "Bom (Good)";
  } else if (cpLoss < CLASSIFICATION_THRESHOLDS.INACCURACY_THRESHOLD) {
    return "Imprecisão (Inaccuracy)";
  } else if (cpLoss < CLASSIFICATION_THRESHOLDS.MISTAKE_THRESHOLD) {
    return "Erro (Mistake)";
  } else if (cpLoss < CLASSIFICATION_THRESHOLDS.BLUNDER_THRESHOLD) {
    return "Erro Grave (Blunder)";
  } else {
    return "Erro Catastrófico (Catastrophic Blunder)";
  }
}

// ********** LÓGICA DE ESCOLHA DE MOVIMENTO **********
function chooseBotMove() {
  if (ChessAPI.getTurn() !== "b") return null;
  const board = ChessAPI.getBoard();

  const km = ChessAPI.getKingMoved();
  const rm = ChessAPI.getRookMoved(); 
  const ep = ChessAPI.getEnPassantTarget();

  const initialState = {
    board: board,
    km: km,
    rm: rm,
    ep: ep
  };

  const searchDepth = 4;
  
  // Usa humanElo no log
  console.log(`[Bot] Elo Estimado do Humano: ${Math.round(humanElo)}. Profundidade de Pesquisa: ${searchDepth} (QS: ${QS_MAX_DEPTH})`);

  let moves = getLegalMovesOnBoard("b", board, km, rm, ep);
  if (!moves.length) return null;
  
  // ** OTIMIZAÇÃO: ORDENAÇÃO DE LANCES ANTES DE INICIAR A PESQUISA **
  for (const move of moves) {
      move.score = scoreMove(move, board);
  }
  moves.sort((a, b) => b.score - a.score);


  const scored = [];

  for (const move of moves) {
    const nextSimState = _applyMoveToBoardState(
        initialState.board,
        move.from,
        move.to,
        move.flags || {},
        initialState.km,
        initialState.rm,
        initialState.ep
    );

    // Score na perspetiva do Branco (1). Bot (Preto) quer minimizar este score.
    const whiteScore = negamax(nextSimState, searchDepth - 1, -Infinity, Infinity, 1); 

    scored.push({ move: move, score: whiteScore });
  }

  // CORREÇÃO: Ordena por score do Branco CRESCENTE (mais baixo = melhor para o Preto)
  scored.sort((a, b) => a.score - b.score);

  // ********** LÓGICA DE SELEÇÃO COM IMPRECISÃO (BASEADA NO ELO DO HUMANO) **********
  const ELO_IMPRECISION_BASE = 1600; 
  const ELO_RANGE = 400; 
  const MAX_IMPRECISION_RANGE = 5; 

  // Se o humanElo for mais alto, reductionFactor é maior, pickRange é menor (Bot joga melhor)
  let reductionFactor = Math.min(1, Math.max(0, (humanElo - ELO_IMPRECISION_BASE) / ELO_RANGE)); 
  let pickRange = Math.max(1, MAX_IMPRECISION_RANGE - Math.round(reductionFactor * (MAX_IMPRECISION_RANGE - 1)));
  
  const finalPickRange = Math.min(scored.length, pickRange);
  let pickIndex = randomInt(0, finalPickRange);

  let pickObj = scored[pickIndex];
  
  console.log(`[Bot] Melhor jogada encontrada (score: ${scored[0].score}).`);
  
  // lastEval armazena o score da jogada IDEAL (Perspetiva do Branco) para o cálculo de Elo/Log.
  lastEval = scored[0].score; 

  if (pickIndex !== 0) {
    console.log(`[Bot] Jogada selecionada (score: ${pickObj.score}). Escolhida por imprecisão de Elo (Range: ${finalPickRange}).`);
  }
  
  return pickObj ? pickObj.move : null;
}

/**
 * Converte um score em centipeões (perspectiva do Branco) para a probabilidade de vitória esperada (0 a 1).
 * @param {number} cpScore - Score em centipeões (positivo = W vantagem, negativo = B vantagem).
 * @returns {number} Probabilidade de vitória para o Branco (W).
 */
function cpToWinProbability(cpScore) {
    // Usamos C_FACTOR = 250 (mais padrão)
    return 1 / (1 + Math.pow(10, -cpScore / C_FACTOR));
}


// ********** LÓGICA DE ADAPTAÇÃO DE ELO E CLASSIFICAÇÃO DE LANCES (W) **********
function updateBotEloAfterPlayerMove() {
  const bNow = ChessAPI.getBoard();
  const eNow = evalBoard(bNow); // Score real APÓS o lance do Jogador (W)

  if (lastEval === null || boardStateBeforePlayerMove === null) {
    lastEval = eNow;
    return;
  }
  
  // 1. CLASSIFICAR O LANCE DO JOGADOR (W)

  const pB = boardStateBeforePlayerMove;
  const playerMoves = getLegalMovesOnBoard("w", pB.board, pB.km, pB.rm, pB.ep);
  let bestPlayerScore = -MATE_SCORE; 

  if (playerMoves.length > 0) {
      for (const move of playerMoves) {
          move.score = scoreMove(move, pB.board);
      }
      playerMoves.sort((a, b) => b.score - a.score);

      for (const move of playerMoves) {
          const nextSimState = _applyMoveToBoardState(
              pB.board,
              move.from,
              move.to,
              move.flags || {},
              pB.km,
              pB.rm,
              pB.ep
          );

          // OTIMIZAÇÃO: Reduzir a profundidade de 4 para 3 para acelerar a análise do lance do jogador (W)
          const score = negamax(nextSimState, 3, -Infinity, Infinity, 1); 
          bestPlayerScore = Math.max(bestPlayerScore, score);
      }
  } 

  const cpLoss = bestPlayerScore - eNow; 
  let classification = "Fim de Jogo ou Sem Lances";
  if (bestPlayerScore > -MATE_SCORE + 100) { 
      classification = classifyMove(cpLoss);
  }

  // ********** 2. CÁLCULO DE ELO CORRIGIDO (HUMAN ELO) COM PENALIDADES SEVERAS **********
  
  let delta = 0; // Ajuste inicial 
  
  // NOVO: Fator de Elo AUMENTADO para maior sensibilidade em cada lance.
  
  // O Elo do HUMANO (W) deve DESCER (delta negativo) se o CP Loss for alto.
  // O Elo do HUMANO (W) deve SUBIR (delta positivo) se o CP Loss for baixo.
  
  // 1. BLUNDER / ERRO CATASTRÓFICO (> 200 CP Loss)
  if (cpLoss > CLASSIFICATION_THRESHOLDS.BLUNDER_THRESHOLD) { 
    delta = -40; // Penalização Severa AUMENTADA
  
  // 2. ERRO GRAVE (100-200 CP Loss)
  } else if (cpLoss > CLASSIFICATION_THRESHOLDS.MISTAKE_THRESHOLD) {
    delta = -20; // Penalização Significativa AUMENTADA
    
  // 3. ERRO (50-100 CP Loss)
  } else if (cpLoss > CLASSIFICATION_THRESHOLDS.INACCURACY_THRESHOLD) {
    delta = -10; // Penalização Moderada AUMENTADA
    
  // 4. IMPRECISÃO (30-50 CP Loss)
  } else if (cpLoss > CLASSIFICATION_THRESHOLDS.GOOD_THRESHOLD) {
    delta = -5; // Penalização Ligeira AUMENTADA
    
  // 5. BOM LANCE (15-30 CP Loss)
  } else if (cpLoss > CLASSIFICATION_THRESHOLDS.EXCELLENT_THRESHOLD) {
    delta = 10; // Pequena Recompensa AUMENTADA
    
  // 6. EXCELENTE LANCE (5-15 CP Loss)
  } else if (cpLoss > CLASSIFICATION_THRESHOLDS.BEST_THRESHOLD) {
    delta = 20; // Boa Recompensa AUMENTADA
    
  // 7. MELHOR LANCE (BEST) (< 5 CP Loss)
  } else { 
    delta = 30; // Grande Recompensa AUMENTADA
  }
  
  delta = Math.round(delta);

  // ********* LOGGING PARA COMPATIBILIDADE *********
  const idealScoreCP = lastEval; 
  const pIdeal = cpToWinProbability(idealScoreCP); 
  const pReal = cpToWinProbability(eNow); 
  const winProbabilityLoss = pIdeal - pReal; 
  // ***********************************************


  humanElo += delta; // Usa a nova variável
  if (humanElo < 600) humanElo = 600;
  if (humanElo > 2800) humanElo = 2800;

  // 3. REGISTO
  console.log(`[Bot] Classificação do lance do Jogador (W): ${classification}. Perda CP: ${cpLoss.toFixed(1)}`);
  console.log(`[Bot] Avaliação do lance do Jogador (CP após o lance): ${eNow}. Score Bot Ideal (CP antes): ${idealScoreCP}`);
  console.log(`[Bot] P_Ideal (W): ${pIdeal.toFixed(3)}. P_Real (W): ${pReal.toFixed(3)}. Perda Prob. W (Log): ${winProbabilityLoss.toFixed(3)}`);
  console.log(`[Bot] Ajuste de Elo (CP Threshold): ${delta}. Novo Elo Estimado do Humano: ${Math.round(humanElo)}`);

  lastEval = eNow;
}

// Funções Utilitárias
function randomInt(a, b) {
  // Retorna um inteiro aleatório entre a (incluído) e b (excluído)
  return a + Math.floor(Math.random() * (b - a));
}

// ********** LOOP PRINCIPAL **********
setInterval(() => {
  if (typeof ChessAPI === "undefined") return;
  const t = ChessAPI.getTurn();

  if (t !== lastTurn) {
    if (t === "b") {
      if (ChessAPI.isGameOver()) {
        lastTurn = t;
        return;
      }

      // EXECUTA ANÁLISE DO LANCE DO JOGADOR ANTES DE O BOT MOVER
      updateBotEloAfterPlayerMove();

      setTimeout(async () => {
        const mv = chooseBotMove();
        if (mv && !ChessAPI.isGameOver()) {
          // A API espera makeMove(from, to, flags)
          await ChessAPI.makeMove(mv.from, mv.to, mv.flags);
        }
      }, BOT_MOVE_DELAY);
    } else if (t === "w") {
      // Quando passa para o turno das Brancas (Jogador)
      
      // CAPTURA O ESTADO DO TABULEIRO ANTES DO JOGADOR (W) MOVER para Classificação
      boardStateBeforePlayerMove = {
          board: ChessAPI.getBoard(),
          km: ChessAPI.getKingMoved(),
          rm: ChessAPI.getRookMoved(),
          ep: ChessAPI.getEnPassantTarget()
      };
      
      const bNow = ChessAPI.getBoard();
      // Avalia a posição logo no início do turno das Brancas para guardar o 'lastEval' correto
      lastEval = evalBoard(bNow);
    }
  }

  lastTurn = t;
}, 120);