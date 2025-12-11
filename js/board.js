// PEÇAS
const pieceSymbols = {
  // brancas
  pw: "img/pieces/pawn-w.svg",
  rw: "img/pieces/rook-w.svg",
  nw: "img/pieces/knight-w.svg",
  bw: "img/pieces/bishop-w.svg",
  qw: "img/pieces/queen-w.svg",
  kw: "img/pieces/king-w.svg",

  // pretas
  pb: "img/pieces/pawn-b.svg",
  rb: "img/pieces/rook-b.svg",
  nb: "img/pieces/knight-b.svg",
  bb: "img/pieces/bishop-b.svg",
  qb: "img/pieces/queen-b.svg",
  kb: "img/pieces/king-b.svg",
};

let board = [];          // 8x8 array de null ou {type,color}
let selected = null;     // {r,c}
let legal = [];          // movimentos legais da peça selecionada
let turn = "w";
let history = [];        // histórico para undo
let kingMoved = { w: false, b: false };
let rookMoved = {
  w: { a: false, h: false },
  b: { a: false, h: false },
};
let enPassantTarget = null; // {r,c}
let lastMove = null;        // { from:{r,c}, to:{r,c} }
let gameOver = false;

// relógio (5 min por lado, ajusta à vontade)
let clock = {
  w: 300,
  b: 300,
};
let clockInterval = null;

// elementos do DOM
const boardEl = document.getElementById("board");
const turnEl = document.getElementById("turn");
const statusEl = document.getElementById("status");
const fenEl = document.getElementById("fen");
const resetBtn = document.getElementById("reset");
const undoBtn = document.getElementById("undo");

const clockWEl = document.getElementById("clock-w");
const clockBEl = document.getElementById("clock-b");
const drawBtn = document.getElementById("draw");
const backMenuBtn = document.getElementById("back-menu");

// UTILIDADES BÁSICAS
function coordToAlgebraic(r, c) {
  return String.fromCharCode(97 + c) + (8 - r);
}

function algebraicToCoord(s) {
  const c = s.charCodeAt(0) - 97;
  const r = 8 - parseInt(s[1], 10);
  return { r, c };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function clonePiece(p) {
  if (!p) return null;
  return { type: p.type, color: p.color };
}

function cloneBoardState(src) {
  return src.map(row =>
    row.map(p => (p ? { type: p.type, color: p.color } : null))
  );
}

// RELÓGIO
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateClockDisplay() {
  if (clockWEl) clockWEl.textContent = formatTime(clock.w);
  if (clockBEl) clockBEl.textContent = formatTime(clock.b);
}

function startClock(color) {
  clearInterval(clockInterval);
  clockInterval = setInterval(() => {
    if (gameOver) {
      clearInterval(clockInterval);
      return;
    }

    clock[color]--;
    updateClockDisplay();

    if (clock[color] <= 0) {
      clearInterval(clockInterval);
      gameOver = true;
      statusEl.textContent =
        (color === "w" ? "Capa Blanca" : "Capa Pleta") + " perdeu por tempo.";
      showBackToMenu();
    }
  }, 1000);
}

function showBackToMenu() {
  if (backMenuBtn) {
    backMenuBtn.style.display = "inline-block";
  }
}

// XEQUE / ATAQUES / MATE

function isSquareAttackedOnBoard(boardState, r, c, byColor) {
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

function isKingInCheckOnBoard(boardState, color) {
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
  return isSquareAttackedOnBoard(boardState, kr, kc, enemy);
}

function isKingInCheck(color) {
  return isKingInCheckOnBoard(board, color);
}

function wouldLeaveKingInCheck(fromR, fromC, move, color) {
  const temp = cloneBoardState(board);
  const piece = temp[fromR][fromC];
  if (!piece) return false;

  // en passant
  if (move.flags && move.flags.enpassant && move.flags.capture) {
    const cap = move.flags.capture;
    temp[cap.r][cap.c] = null;
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

    // promoção simples também conta como ataque
    if (piece.type === "P" && (move.r === 0 || move.r === 7)) {
      temp[move.r][move.c] = { type: "Q", color: piece.color };
    }
  }

  return isKingInCheckOnBoard(temp, color);
}

function hasAnyLegalMove(color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        const ms = computeMoves(r, c);
        if (ms.length > 0) return true;
      }
    }
  }
  return false;
}

// INICIALIZAÇÃO DO TABULEIRO
function initBoard() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));

  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];

  // pretas
  for (let c = 0; c < 8; c++) board[0][c] = { type: back[c], color: "b" };
  for (let c = 0; c < 8; c++) board[1][c] = { type: "P", color: "b" };

  // brancas
  for (let c = 0; c < 8; c++) board[6][c] = { type: "P", color: "w" };
  for (let c = 0; c < 8; c++) board[7][c] = { type: back[c], color: "w" };

  selected = null;
  lastMove = null;
  legal = [];
  turn = "w";
  history = [];
  kingMoved = { w: false, b: false };
  rookMoved = {
    w: { a: false, h: false },
    b: { a: false, h: false },
  };
  enPassantTarget = null;
  gameOver = false;

  clock = { w: 300, b: 300 }; // reset tempo
  updateClockDisplay();
  clearInterval(clockInterval);
  startClock("w");

  if (backMenuBtn) backMenuBtn.style.display = "none";

  render();
  updateStatus();
}

// RENDER
function render() {
  boardEl.innerHTML = "";

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement("div");
      sq.className = "sq " + ((r + c) % 2 === 0 ? "light" : "dark");
      sq.dataset.r = r;
      sq.dataset.c = c;

      // casa selecionada
      if (selected && selected.r === r && selected.c === c) {
        sq.classList.add("sel");
      }

      // movimentos (normal vs captura)
      const move = legal.find((m) => m.r === r && m.c === c);
      if (move) {
        if (move.flags && (move.flags.capture || move.flags.enpassant)) {
          sq.classList.add("move-capture");
        } else {
          sq.classList.add("move");
        }
      }

      // peça nessa casa
      const p = board[r][c];
      if (p) {
        const key = p.type.toLowerCase() + p.color;
        const img = document.createElement("img");
        img.src = pieceSymbols[key];
        img.className = "piece-img";

        // pop suave no destino do último movimento
        if (
          lastMove &&
          lastMove.to.r === r &&
          lastMove.to.c === c
        ) {
          img.classList.add("piece-moved");
        }

        sq.appendChild(img);
      }

      sq.addEventListener("click", onSquareClick);
      boardEl.appendChild(sq);
    }
  }

  turnEl.textContent = turn === "w" ? "Capa Blanca" : "Capa Pleta";
  fenEl.textContent = generateFEN();
}

// CLIQUES
async function onSquareClick(e) {
  if (gameOver) return;

  const r = +this.dataset.r;
  const c = +this.dataset.c;
  const p = board[r][c];

  if (selected) {
    const move = legal.find((m) => m.r === r && m.c === c);
    if (move) {
      await makeMove(selected, { r, c }, move.flags || {});
      selected = null;
      legal = [];
      render();
      return;
    }
  }

  if (p && p.color === turn) {
    selected = { r, c };
    legal = computeMoves(r, c);
  } else {
    selected = null;
    legal = [];
  }

  render();
}

// MOVIMENTOS
function computeMoves(r, c) {
  const p = board[r][c];
  if (!p) return [];

  const moves = [];
  const dir = p.color === "w" ? -1 : 1;
  const enemy = p.color === "w" ? "b" : "w";

  if (p.type === "P") {
    const front = r + dir;
    if (inBounds(front, c) && !board[front][c]) {
      moves.push({ r: front, c, flags: { pawnMove: true } });

      const startRow = p.color === "w" ? 6 : 1;
      const doubleRow = r + 2 * dir;
      if (r === startRow && !board[doubleRow][c]) {
        moves.push({ r: doubleRow, c, flags: { pawnDouble: true } });
      }
    }

    // capturas
    for (const dc of [-1, 1]) {
      const cr = r + dir;
      const cc = c + dc;

      if (
        inBounds(cr, cc) &&
        board[cr][cc] &&
        board[cr][cc].color === enemy
      ) {
        moves.push({ r: cr, c: cc, flags: { capture: true } });
      }

      // en passant
      if (
        enPassantTarget &&
        enPassantTarget.r === r + dir &&
        enPassantTarget.c === c + dc
      ) {
        moves.push({
          r: r + dir,
          c: c + dc,
          flags: { enpassant: true, capture: { r, c: c + dc } },
        });
      }
    }
  } else if (p.type === "N") {
     const deltas = [
    [-2, -1], [-2, 1],
    [-1, -2], [-1, 2],
    [1, -2],  [1, 2],
    [2, -1],  [2, 1],
  ];

  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;

    const target = board[nr][nc];

    if (!target) {
      // casa vazia
      moves.push({ r: nr, c: nc });
    } else if (target.color !== p.color) {
      // captura
      moves.push({ r: nr, c: nc, flags: { capture: true } });
    }
  }
  } else if (p.type === "B" || p.type === "R" || p.type === "Q") {
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
        if (!board[nr][nc]) {
          moves.push({ r: nr, c: nc });
        } else {
          if (board[nr][nc].color !== p.color) {
            moves.push({ r: nr, c: nc, flags: { capture: true } });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (p.type === "K") {
    // movimentos normais do rei (1 casa em qualquer direção)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;

      const target = board[nr][nc];

      if (!target) {
        moves.push({ r: nr, c: nc });
      } else if (target.color !== p.color) {
        moves.push({ r: nr, c: nc, flags: { capture: true } });
      }
    }
  }

  // roque com verificação de casas atacadas
  if (!kingMoved[p.color]) {
    const row = p.color === "w" ? 7 : 0;
    const enemy = p.color === "w" ? "b" : "w";

    // o rei não pode estar em xeque na casa inicial
    if (!isKingInCheck(p.color)) {
      // roque pequeno (lado do rei)
      if (
        !rookMoved[p.color].h &&
        board[row][5] === null &&
        board[row][6] === null &&
        board[row][7] &&
        board[row][7].type === "R" &&
        board[row][7].color === p.color &&
        !isSquareAttackedOnBoard(board, row, 4, enemy) && // casa inicial (e1 / e8)
        !isSquareAttackedOnBoard(board, row, 5, enemy) && // casa de passagem (f1 / f8)
        !isSquareAttackedOnBoard(board, row, 6, enemy)    // casa final (g1 / g8)
      ) {
        moves.push({ r: row, c: 6, flags: { castling: "king" } });
      }

      // roque grande (lado da dama)
      if (
        !rookMoved[p.color].a &&
        board[row][1] === null &&
        board[row][2] === null &&
        board[row][3] === null &&
        board[row][0] &&
        board[row][0].type === "R" &&
        board[row][0].color === p.color &&
        !isSquareAttackedOnBoard(board, row, 4, enemy) && // casa inicial (e1 / e8)
        !isSquareAttackedOnBoard(board, row, 3, enemy) && // casa de passagem (d1 / d8)
        !isSquareAttackedOnBoard(board, row, 2, enemy)    // casa final (c1 / c8)
      ) {
        moves.push({ r: row, c: 2, flags: { castling: "queen" } });
      }
    }
  }
  }

  // filtra movimentos que deixam o próprio rei em xeque
  return moves.filter(m => !wouldLeaveKingInCheck(r, c, m, p.color));
}

async function slidePiece(from, to) {
  const boardRect = boardEl.getBoundingClientRect();

  const fromSq = document.querySelector(`.sq[data-r="${from.r}"][data-c="${from.c}"]`);
  const toSq   = document.querySelector(`.sq[data-r="${to.r}"][data-c="${to.c}"]`);

  if (!fromSq || !toSq) return;

  const img = fromSq.querySelector("img");
  if (!img) return;

  // posições relativas À BOARD (não ao ecrã!)
  const fromRect = fromSq.getBoundingClientRect();
  const toRect   = toSq.getBoundingClientRect();

  const dx = (toRect.left - fromRect.left);
  const dy = (toRect.top  - fromRect.top);

  // animação
  img.style.transition = "transform 0.18s ease-out";
  img.style.transform  = `translate(${dx}px, ${dy}px)`;

  await new Promise(resolve => {
    img.addEventListener("transitionend", resolve, { once: true });
  });

  // reset
  img.style.transform = "";
  img.style.transition = "";
}

// MOVIMENTO + ANIMAÇÕES
async function makeMove(from, to, flags = {}) {
  const p = board[from.r][from.c];
  const dest = board[to.r][to.c];

  // guardar último movimento (para efeitos de .piece-moved)
  lastMove = {
    from: { r: from.r, c: from.c },
    to: { r: to.r, c: to.c },
  };

  // salvar snapshot para undo
  history.push({
    from,
    to,
    movePiece: clonePiece(p),
    captured: dest ? clonePiece(dest) : null,
    flags: JSON.parse(JSON.stringify(flags)),
    kingMoved: JSON.parse(JSON.stringify(kingMoved)),
    rookMoved: JSON.parse(JSON.stringify(rookMoved)),
    enPassantTarget: enPassantTarget
      ? { r: enPassantTarget.r, c: enPassantTarget.c }
      : null,
  });

  // 1) animação da peça capturada (se existir)
  if (flags.enpassant) {
    const cap = flags.capture; // { r, c } da peça capturada
    const sqDom = document.querySelector(
    `.sq[data-r="${cap.r}"][data-c="${cap.c}"]`
  );

    const img = sqDom && sqDom.querySelector("img");
    if (img) {
      img.classList.add("captured-anim");
      await new Promise((resolve) =>
        img.addEventListener("animationend", resolve, { once: true })
      );
    }
    // en passant remove peão na casa cap (no estado lógico)
    board[cap.r][cap.c] = null;
  } else if (dest) {
    // captura normal
    const sqDom = document.querySelector(
      `.sq[data-r="${to.r}"][data-c="${to.c}"]`
    );

    const img = sqDom && sqDom.querySelector("img");
    if (img) {
      img.classList.add("captured-anim");
      await new Promise((resolve) =>
        img.addEventListener("animationend", resolve, { once: true })
      );
    }
    // o dest vai ser substituído pelo atacante depois
  }

  // 2) animação de deslize da peça que se move
  await slidePiece(from, to);

  // 3) aplicar movimento ao estado lógico (board, flags, etc.)

  // roque
  if (flags.castling) {
    const color = p.color;
    const row = color === "w" ? 7 : 0;

    if (flags.castling === "king") {
      // rei: e -> g (4 -> 6), torre: h -> f (7 -> 5)
      board[row][6] = p;
      board[from.r][from.c] = null;
      board[row][5] = board[row][7];
      board[row][7] = null;
    } else {
      // rei: e -> c (4 -> 2), torre: a -> d (0 -> 3)
      board[row][2] = p;
      board[from.r][from.c] = null;
      board[row][3] = board[row][0];
      board[row][0] = null;
    }

    kingMoved[p.color] = true;
    rookMoved[p.color].a = true;
    rookMoved[p.color].h = true;
    enPassantTarget = null;
  } else {
    // movimento normal
    board[to.r][to.c] = p;
    board[from.r][from.c] = null;

    // duplo de peão -> marca en passant
    if (flags.pawnDouble) {
      enPassantTarget = { r: (from.r + to.r) / 2, c: from.c };
    } else {
      enPassantTarget = null;
    }

    // promoção automática para dama
    if (p.type === "P" && (to.r === 0 || to.r === 7)) {
      p.type = "Q";
    }

    // flags de rei/torre
    if (p.type === "K") kingMoved[p.color] = true;
    if (p.type === "R") {
      if (from.c === 0) rookMoved[p.color].a = true;
      if (from.c === 7) rookMoved[p.color].h = true;
    }
  }

  // 4) muda a vez, atualiza relógio e status
  turn = turn === "w" ? "b" : "w";
  startClock(turn);
  updateStatus();
}

// UNDO
function undo() {
  if (history.length === 0 || gameOver) return;

  const last = history.pop();
  const {
    from,
    to,
    movePiece,
    captured,
    flags,
    kingMoved: km,
    rookMoved: rm,
    enPassantTarget: ep,
  } = last;

  enPassantTarget = ep;
  lastMove = null;

  if (flags.castling) {
    const color = movePiece.color;
    const row = color === "w" ? 7 : 0;

    board[from.r][from.c] = movePiece;
    board[to.r][to.c] = null;

    if (flags.castling === "king") {
      board[row][7] = board[row][5];
      board[row][5] = null;
    } else {
      board[row][0] = board[row][3];
      board[row][3] = null;
    }
  } else if (flags.enpassant) {
    const cap = flags.capture;
    board[cap.r][cap.c] = captured;
    board[to.r][to.c] = null;
    board[from.r][from.c] = movePiece;
  } else {
    board[from.r][from.c] = movePiece;
    board[to.r][to.c] = captured;
  }

  kingMoved = km;
  rookMoved = rm;
  turn = movePiece.color;

  render();
  updateStatus();
}

// STATUS & FEN
function updateStatus() {
  const colorToMove = turn;
  const inCheck = isKingInCheck(colorToMove);
  const hasMove = hasAnyLegalMove(colorToMove);

  if (inCheck && !hasMove) {
    // xeque-mate
    const winner = colorToMove === "w" ? "Capa Pleta" : "Capa Blanca";
    statusEl.textContent = `Xeque-mate! ${winner} venceu.`;
    gameOver = true;
    clearInterval(clockInterval);
    showBackToMenu();
  } else if (!inCheck && !hasMove) {
    // afogamento
    statusEl.textContent = "Empate por afogamento.";
    gameOver = true;
    clearInterval(clockInterval);
    showBackToMenu();
  } else if (inCheck) {
    statusEl.textContent = "Xeque!";
  } else {
    statusEl.textContent = "Clique numa peça para ver movimentos.";
  }
}

function generateFEN() {
  let fen = "";

  for (let r = 0; r < 8; r++) {
    let empty = 0;

    for (let c = 0; c < 8; c++) {
      const p = board[r][c];

      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        fen += p.color === "w" ? p.type : p.type.toLowerCase();
      }
    }

    if (empty > 0) fen += empty;
    if (r < 7) fen += "/";
  }

  fen += " " + (turn === "w" ? "w" : "b");

  // roque
  let cast = "";
  if (!kingMoved.w) {
    if (!rookMoved.w.h) cast += "K";
    if (!rookMoved.w.a) cast += "Q";
  }
  if (!kingMoved.b) {
    if (!rookMoved.b.h) cast += "k";
    if (!rookMoved.b.a) cast += "q";
  }
  if (cast === "") cast = "-";
  fen += " " + cast;

  // en passant
  fen +=
    " " +
    (enPassantTarget
      ? coordToAlgebraic(enPassantTarget.r, enPassantTarget.c)
      : "-");

  return fen;
}

// BOTÕES
resetBtn.addEventListener("click", () => {
  clearInterval(clockInterval);
  initBoard();
});

undoBtn.addEventListener("click", () => {
  undo();
});

if (drawBtn) {
  drawBtn.addEventListener("click", () => {
    if (gameOver) return;
    gameOver = true;
    clearInterval(clockInterval);
    statusEl.textContent = "Empate por acordo.";
    showBackToMenu();
  });
}

if (backMenuBtn) {
  backMenuBtn.addEventListener("click", () => {
    // aqui decides o que é "menu"
    // window.location.href = "menu.html";
    window.location.href = "index.html";
  });
  backMenuBtn.style.display = "none";
}

// inicia o jogo
initBoard();
