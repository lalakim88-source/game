(() => {
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;

  const COLORS = {
    I: "#2fd3c5",
    O: "#f0c75e",
    T: "#6eb5ff",
    S: "#5dd39e",
    Z: "#ff6b6b",
    J: "#5b8cff",
    L: "#ff9f43",
  };

  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  };

  const TYPES = Object.keys(SHAPES);
  const LINE_SCORES = [0, 100, 300, 500, 800];

  const boardCanvas = document.getElementById("board");
  const nextCanvas = document.getElementById("next");
  const boardCtx = boardCanvas.getContext("2d");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMsg = document.getElementById("overlay-msg");
  const startBtn = document.getElementById("start-btn");

  let grid;
  let bag = [];
  let current;
  let next;
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropMs = 1000;
  let dropAcc = 0;
  let lastTs = 0;
  let running = false;
  let paused = false;
  let gameOver = false;
  let animId = 0;

  function createGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextType() {
    if (bag.length === 0) bag = shuffle([...TYPES]);
    return bag.pop();
  }

  function spawnPiece(type) {
    const matrix = SHAPES[type].map((row) => [...row]);
    return {
      type,
      matrix,
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: 0,
    };
  }

  function collide(piece, ox = 0, oy = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        const nx = piece.x + x + ox;
        const ny = piece.y + y + oy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotate(matrix) {
    const size = matrix.length;
    const rotated = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        rotated[x][size - 1 - y] = matrix[y][x];
      }
    }
    return rotated;
  }

  function tryRotate() {
    if (current.type === "O") return;
    const rotated = rotate(current.matrix);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collide(current, kick, 0, rotated)) {
        current.matrix = rotated;
        current.x += kick;
        return;
      }
    }
  }

  function hardDrop() {
    let dist = 0;
    while (!collide(current, 0, dist + 1)) dist += 1;
    current.y += dist;
    score += dist * 2;
    lockPiece();
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (grid[y].every((cell) => cell)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }
    if (!cleared) return;
    score += LINE_SCORES[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropMs = Math.max(100, 1000 - (level - 1) * 80);
    updateHud();
  }

  function lockPiece() {
    for (let y = 0; y < current.matrix.length; y += 1) {
      for (let x = 0; x < current.matrix[y].length; x += 1) {
        if (!current.matrix[y][x]) continue;
        const gy = current.y + y;
        const gx = current.x + x;
        if (gy < 0) {
          endGame();
          return;
        }
        grid[gy][gx] = current.type;
      }
    }
    clearLines();
    current = next;
    next = spawnPiece(nextType());
    if (collide(current)) {
      endGame();
      return;
    }
    updateHud();
    drawNext();
  }

  function ghostY() {
    let dist = 0;
    while (!collide(current, 0, dist + 1)) dist += 1;
    return current.y + dist;
  }

  function drawCell(ctx, x, y, color, alpha = 1, size = BLOCK) {
    const px = x * size;
    const py = y * size;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(px + 2, py + 2, size - 4, Math.max(2, size * 0.18));
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(px + 2, py + size - 6, size - 4, 3);
    ctx.globalAlpha = 1;
  }

  function drawBoard() {
    boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const type = grid[y][x];
        if (type) drawCell(boardCtx, x, y, COLORS[type]);
      }
    }

    if (!current || gameOver) return;

    const gy = ghostY();
    for (let y = 0; y < current.matrix.length; y += 1) {
      for (let x = 0; x < current.matrix[y].length; x += 1) {
        if (!current.matrix[y][x]) continue;
        drawCell(boardCtx, current.x + x, gy + y, COLORS[current.type], 0.22);
      }
    }

    for (let y = 0; y < current.matrix.length; y += 1) {
      for (let x = 0; x < current.matrix[y].length; x += 1) {
        if (!current.matrix[y][x]) continue;
        const py = current.y + y;
        if (py < 0) continue;
        drawCell(boardCtx, current.x + x, py, COLORS[current.type]);
      }
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!next) return;
    const matrix = next.matrix;
    const size = 24;
    const w = matrix[0].length * size;
    const h = matrix.length * size;
    const ox = (nextCanvas.width - w) / 2;
    const oy = (nextCanvas.height - h) / 2;

    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        const px = ox + x * size;
        const py = oy + y * size;
        nextCtx.fillStyle = COLORS[next.type];
        nextCtx.fillRect(px + 1, py + 1, size - 2, size - 2);
        nextCtx.fillStyle = "rgba(255,255,255,0.22)";
        nextCtx.fillRect(px + 2, py + 2, size - 4, 4);
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
    linesEl.textContent = String(lines);
  }

  function showOverlay(title, msg, btnText) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    startBtn.textContent = btnText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function endGame() {
    running = false;
    gameOver = true;
    cancelAnimationFrame(animId);
    drawBoard();
    showOverlay("GAME OVER", `점수 ${score}`, "다시 시작");
  }

  function resetGame() {
    grid = createGrid();
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    dropMs = 1000;
    dropAcc = 0;
    paused = false;
    gameOver = false;
    current = spawnPiece(nextType());
    next = spawnPiece(nextType());
    updateHud();
    drawNext();
    drawBoard();
  }

  function startGame() {
    resetGame();
    running = true;
    hideOverlay();
    lastTs = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    if (paused) {
      showOverlay("PAUSED", "P 또는 버튼으로 재개", "재개");
    } else {
      hideOverlay();
      lastTs = performance.now();
      animId = requestAnimationFrame(loop);
    }
  }

  function softDrop() {
    if (collide(current, 0, 1)) {
      lockPiece();
    } else {
      current.y += 1;
      score += 1;
      updateHud();
    }
    dropAcc = 0;
  }

  function loop(ts) {
    if (!running || paused) return;
    const dt = ts - lastTs;
    lastTs = ts;
    dropAcc += dt;

    while (dropAcc >= dropMs) {
      dropAcc -= dropMs;
      if (collide(current, 0, 1)) {
        lockPiece();
        break;
      } else {
        current.y += 1;
      }
    }

    drawBoard();
    if (running && !paused) animId = requestAnimationFrame(loop);
  }

  function onKey(e) {
    const key = e.key;

    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      if (!running || gameOver) {
        startGame();
        return;
      }
      if (paused) return;
      hardDrop();
      drawBoard();
      return;
    }

    if (key === "p" || key === "P") {
      e.preventDefault();
      if (!running && !gameOver) {
        startGame();
        return;
      }
      togglePause();
      return;
    }

    if (!running || paused || gameOver) return;

    if (key === "ArrowLeft") {
      e.preventDefault();
      if (!collide(current, -1, 0)) current.x -= 1;
    } else if (key === "ArrowRight") {
      e.preventDefault();
      if (!collide(current, 1, 0)) current.x += 1;
    } else if (key === "ArrowDown") {
      e.preventDefault();
      softDrop();
    } else if (key === "ArrowUp" || key === "x" || key === "X") {
      e.preventDefault();
      tryRotate();
    }

    drawBoard();
  }

  startBtn.addEventListener("click", () => {
    if (paused) {
      togglePause();
      return;
    }
    startGame();
  });

  document.addEventListener("keydown", onKey);

  grid = createGrid();
  drawBoard();
  showOverlay("TETRIS", "스페이스로 시작", "시작");
})();
