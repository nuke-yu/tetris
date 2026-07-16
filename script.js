// ===== 常量 =====
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;       // 主棋盘格子像素
const PREVIEW_BLOCK = 24;    // 预览区格子像素
const DROP_INTERVAL = 500;   // 毫秒

// ===== 7 种标准方块（灰黑配色）=====
const SHAPES = [
  // I
  { blocks: [[1,1,1,1]], color: '#9e9e9e' },
  // O
  { blocks: [[1,1],[1,1]], color: '#757575' },
  // T
  { blocks: [[0,1,0],[1,1,1]], color: '#616161' },
  // S
  { blocks: [[0,1,1],[1,1,0]], color: '#bdbdbd' },
  // Z
  { blocks: [[1,1,0],[0,1,1]], color: '#424242' },
  // J
  { blocks: [[1,0,0],[1,1,1]], color: '#212121' },
  // L
  { blocks: [[0,0,1],[1,1,1]], color: '#000000' },
];

// ===== DOM 引用 =====
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('preview');
const previewCtx = previewCanvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const finalScoreSpan = document.getElementById('final-score');
const gameOverOverlay = document.getElementById('game-over-overlay');
const restartBtn = document.getElementById('restart-btn');

// ===== 游戏状态 =====
let board = [];              // 二维数组，0=空，字符串=颜色
let currentPiece = null;     // { shape, color, x, y }
let nextPiece = null;
let score = 0;
let gameOver = false;
let dropTimer = null;

// ===== 工具函数 =====
function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece() {
  const idx = Math.floor(Math.random() * SHAPES.length);
  const s = SHAPES[idx];
  return {
    blocks: s.blocks.map(row => [...row]),
    color: s.color,
  };
}

// 生成新方块，置于棋盘顶部中间
function spawnPiece() {
  if (!nextPiece) {
    nextPiece = randomPiece();
  }
  // 当前方块 = 之前准备好的 next
  const piece = {
    blocks: nextPiece.blocks.map(row => [...row]),
    color: nextPiece.color,
    x: Math.floor((COLS - nextPiece.blocks[0].length) / 2),
    y: 0,
  };
  // 准备下一个
  nextPiece = randomPiece();

  // 检查碰撞：生成即碰撞 → game over
  if (collides(piece, board)) {
    gameOver = true;
    showGameOver();
    return null;
  }
  return piece;
}

// ===== 碰撞检测 =====
function collides(piece, board) {
  const { blocks, x, y } = piece;
  for (let r = 0; r < blocks.length; r++) {
    for (let c = 0; c < blocks[r].length; c++) {
      if (!blocks[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by < 0) continue; // 允许在顶部以上
      if (board[by][bx] !== 0) return true;
    }
  }
  return false;
}

// ===== 固定当前方块到棋盘 =====
function lockPiece() {
  if (!currentPiece) return;
  const { blocks, color, x, y } = currentPiece;
  for (let r = 0; r < blocks.length; r++) {
    for (let c = 0; c < blocks[r].length; c++) {
      if (!blocks[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
        board[by][bx] = color;
      }
    }
  }
  clearFullRows();
  // 生成下一个方块
  currentPiece = spawnPiece();
  if (gameOver) {
    draw();
    return;
  }
  draw();
}

// ===== 消除满行 =====
function clearFullRows() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      r++; // 重新检查当前行
    }
  }
  if (cleared > 0) {
    score += cleared * 100;
    updateScore();
  }
}

// ===== 移动 =====
function movePiece(dx, dy) {
  if (!currentPiece || gameOver) return false;
  const moved = {
    ...currentPiece,
    x: currentPiece.x + dx,
    y: currentPiece.y + dy,
  };
  if (!collides(moved, board)) {
    currentPiece = moved;
    draw();
    return true;
  }
  // 如果是向下碰撞（dy>0），固定
  if (dy > 0) {
    lockPiece();
    draw();
  }
  return false;
}

// ===== 旋转 =====
function rotatePiece() {
  if (!currentPiece || gameOver) return;
  const { blocks } = currentPiece;
  // 顺时针旋转
  const rotated = blocks[0].map((_, idx) =>
    blocks.map(row => row[idx]).reverse()
  );
  const rotatedPiece = {
    ...currentPiece,
    blocks: rotated,
  };
  // 踢墙简单处理：尝试左右微调
  if (!collides(rotatedPiece, board)) {
    currentPiece = rotatedPiece;
  } else {
    // 左移一格试试
    const left = { ...rotatedPiece, x: rotatedPiece.x - 1 };
    if (!collides(left, board)) {
      currentPiece = left;
    } else {
      // 右移一格试试
      const right = { ...rotatedPiece, x: rotatedPiece.x + 1 };
      if (!collides(right, board)) {
        currentPiece = right;
      }
    }
  }
  draw();
}

// ===== 一键落底 =====
function hardDrop() {
  if (!currentPiece || gameOver) return;
  while (!collides({ ...currentPiece, y: currentPiece.y + 1 }, board)) {
    currentPiece.y++;
  }
  lockPiece();
  draw();
}

// ===== 绘制 =====
function draw() {
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 绘制网格线
  ctx.strokeStyle = '#bdbdbd';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK_SIZE, 0);
    ctx.lineTo(c * BLOCK_SIZE, ROWS * BLOCK_SIZE);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK_SIZE);
    ctx.lineTo(COLS * BLOCK_SIZE, r * BLOCK_SIZE);
    ctx.stroke();
  }

  // 绘制已固定的方块
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = board[r][c];
      if (color !== 0) {
        ctx.fillStyle = color;
        ctx.fillRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE - 1, 3);
      }
    }
  }

  // 绘制当前方块
  if (currentPiece && !gameOver) {
    const { blocks, color, x, y } = currentPiece;
    ctx.fillStyle = color;
    for (let r = 0; r < blocks.length; r++) {
      for (let c = 0; c < blocks[r].length; c++) {
        if (!blocks[r][c]) continue;
        const px = (x + c) * BLOCK_SIZE;
        const py = (y + r) * BLOCK_SIZE;
        ctx.fillRect(px, py, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(px, py, BLOCK_SIZE - 1, 3);
        ctx.fillStyle = color;
      }
    }
  }

  // 绘制预览
  drawPreview();
}

function drawPreview() {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (!nextPiece) return;
  const { blocks, color } = nextPiece;
  const rows = blocks.length;
  const cols = blocks[0].length;
  const offsetX = (previewCanvas.width - cols * PREVIEW_BLOCK) / 2;
  const offsetY = (previewCanvas.height - rows * PREVIEW_BLOCK) / 2;

  previewCtx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!blocks[r][c]) continue;
      const px = offsetX + c * PREVIEW_BLOCK;
      const py = offsetY + r * PREVIEW_BLOCK;
      previewCtx.fillRect(px, py, PREVIEW_BLOCK - 1, PREVIEW_BLOCK - 1);
    }
  }
}

// ===== 分数更新 =====
function updateScore() {
  scoreDisplay.textContent = score;
}

// ===== Game Over =====
function showGameOver() {
  finalScoreSpan.textContent = score;
  gameOverOverlay.classList.remove('hidden');
  if (dropTimer) {
    clearInterval(dropTimer);
    dropTimer = null;
  }
}

// ===== 重新开始 =====
function resetGame() {
  board = createEmptyBoard();
  score = 0;
  gameOver = false;
  updateScore();
  gameOverOverlay.classList.add('hidden');

  nextPiece = randomPiece();
  currentPiece = spawnPiece();

  if (dropTimer) {
    clearInterval(dropTimer);
  }
  dropTimer = setInterval(() => {
    if (!gameOver && currentPiece) {
      movePiece(0, 1);
    }
  }, DROP_INTERVAL);

  draw();
}

// ===== 键盘事件 =====
function handleKey(e) {
  if (gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':  e.preventDefault(); movePiece(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); movePiece(1, 0); break;
    case 'ArrowDown':  e.preventDefault(); movePiece(0, 1); break;
    case 'ArrowUp':    e.preventDefault(); rotatePiece(); break;
    case 'Space':      e.preventDefault(); hardDrop(); break;
  }
}

// ===== 初始化 =====
function init() {
  document.addEventListener('keydown', handleKey);
  restartBtn.addEventListener('click', resetGame);
  resetGame();
}

init();
