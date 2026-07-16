// ===== 常量 =====
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;       // 主棋盘格子像素
const PREVIEW_BLOCK = 24;    // 预览区格子像素
const DROP_INTERVAL = 500;   // 毫秒

// ===== 7 种标准方块（少女粉配色）=====
const SHAPES = [
  // I
  { blocks: [[1,1,1,1]], color: '#f48fb1' },
  // O
  { blocks: [[1,1],[1,1]], color: '#f06292' },
  // T
  { blocks: [[0,1,0],[1,1,1]], color: '#ec407a' },
  // S
  { blocks: [[0,1,1],[1,1,0]], color: '#f8bbd0' },
  // Z
  { blocks: [[1,1,0],[0,1,1]], color: '#e91e63' },
  // J
  { blocks: [[1,0,0],[1,1,1]], color: '#c2185b' },
  // L
  { blocks: [[0,0,1],[1,1,1]], color: '#ad1457' },
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
const dogCanvas = document.getElementById('dog-canvas');
const dogCtx = dogCanvas.getContext('2d');

// ===== 游戏状态 =====
let board = [];              // 二维数组，0=空，字符串=颜色
let currentPiece = null;     // { shape, color, x, y }
let nextPiece = null;
let score = 0;
let gameOver = false;
let dropTimer = null;

// ===== 小狗状态 =====
const dog = {
  y: 0,                // 当前 Y 位置（像素，相对于狗画布）
  targetY: 0,          // 目标 Y 位置
  jumping: false,      // 是否在跳跃
  jumpTimer: 0,        // 跳跃动画计时
  cheering: false,     // 是否在欢呼
  cheerTimer: 0,       // 欢呼动画计时
  blinkTimer: 0,       // 眨眼计时
  isBlinking: false,   // 是否在眨眼
  mouthOpen: false,    // 嘴巴张开（欢呼时）
  tailWag: 0,          // 尾巴摆动相位
};

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
  // 小狗跳跃
  dogJump();
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
    dogCheer(); // 消除行时小狗欢呼
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
  ctx.strokeStyle = '#f8bbd0';
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

  // 绘制小狗
  updateDogFollow();
  drawDog();
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

// ===== 小狗绘制 =====
function drawDog() {
  const w = dogCanvas.width;
  const h = dogCanvas.height;
  dogCtx.clearRect(0, 0, w, h);

  // 更新小狗动画状态
  const now = Date.now();

  // 眨眼
  if (dog.isBlinking) {
    dog.blinkTimer -= 16;
    if (dog.blinkTimer <= 0) {
      dog.isBlinking = false;
      dog.blinkTimer = 2000 + Math.random() * 3000;
    }
  } else {
    dog.blinkTimer -= 16;
    if (dog.blinkTimer <= 0) {
      dog.isBlinking = true;
      dog.blinkTimer = 150;
    }
  }

  // 跳跃动画
  if (dog.jumping) {
    dog.jumpTimer -= 16;
    if (dog.jumpTimer <= 0) {
      dog.jumping = false;
    }
  }

  // 欢呼动画
  if (dog.cheering) {
    dog.cheerTimer -= 16;
    if (dog.cheerTimer <= 0) {
      dog.cheering = false;
      dog.mouthOpen = false;
    }
  }

  // 尾巴摆动
  dog.tailWag = (dog.tailWag + 0.08) % (Math.PI * 2);

  // 平滑跟随目标 Y
  dog.y += (dog.targetY - dog.y) * 0.15;

  // 跳跃偏移
  let jumpOffset = 0;
  if (dog.jumping) {
    const t = dog.jumpTimer / 400; // 0~1
    jumpOffset = -Math.sin(t * Math.PI) * 40; // 跳起高度
  }

  const baseX = 60;
  const baseY = dog.y + jumpOffset;

  // ---- 绘制小狗 ----
  dogCtx.save();

  // 身体（椭圆）
  dogCtx.fillStyle = '#d4a574';
  dogCtx.beginPath();
  dogCtx.ellipse(baseX, baseY + 20, 22, 18, 0, 0, Math.PI * 2);
  dogCtx.fill();
  dogCtx.strokeStyle = '#b8864e';
  dogCtx.lineWidth = 1.5;
  dogCtx.stroke();

  // 肚子（浅色）
  dogCtx.fillStyle = '#f0d5b0';
  dogCtx.beginPath();
  dogCtx.ellipse(baseX, baseY + 24, 14, 12, 0, 0, Math.PI * 2);
  dogCtx.fill();

  // 头（圆形）
  dogCtx.fillStyle = '#d4a574';
  dogCtx.beginPath();
  dogCtx.arc(baseX, baseY - 8, 16, 0, Math.PI * 2);
  dogCtx.fill();
  dogCtx.strokeStyle = '#b8864e';
  dogCtx.lineWidth = 1.5;
  dogCtx.stroke();

  // 耳朵（左）
  dogCtx.fillStyle = '#c49464';
  dogCtx.beginPath();
  dogCtx.ellipse(baseX - 14, baseY - 16, 7, 12, -0.3, 0, Math.PI * 2);
  dogCtx.fill();
  dogCtx.strokeStyle = '#b8864e';
  dogCtx.lineWidth = 1;
  dogCtx.stroke();

  // 耳朵（右）
  dogCtx.beginPath();
  dogCtx.ellipse(baseX + 14, baseY - 16, 7, 12, 0.3, 0, Math.PI * 2);
  dogCtx.fill();
  dogCtx.stroke();

  // 眼睛
  const eyeY = baseY - 11;
  if (dog.isBlinking) {
    // 闭眼 - 一条线
    dogCtx.strokeStyle = '#5a3a1a';
    dogCtx.lineWidth = 2;
    dogCtx.beginPath();
    dogCtx.moveTo(baseX - 6, eyeY);
    dogCtx.lineTo(baseX - 2, eyeY);
    dogCtx.stroke();
    dogCtx.beginPath();
    dogCtx.moveTo(baseX + 2, eyeY);
    dogCtx.lineTo(baseX + 6, eyeY);
    dogCtx.stroke();
  } else {
    // 睁眼
    dogCtx.fillStyle = '#5a3a1a';
    dogCtx.beginPath();
    dogCtx.arc(baseX - 4, eyeY, 3, 0, Math.PI * 2);
    dogCtx.fill();
    dogCtx.beginPath();
    dogCtx.arc(baseX + 4, eyeY, 3, 0, Math.PI * 2);
    dogCtx.fill();
    // 眼睛高光
    dogCtx.fillStyle = '#fff';
    dogCtx.beginPath();
    dogCtx.arc(baseX - 3, eyeY - 1.5, 1.2, 0, Math.PI * 2);
    dogCtx.fill();
    dogCtx.beginPath();
    dogCtx.arc(baseX + 5, eyeY - 1.5, 1.2, 0, Math.PI * 2);
    dogCtx.fill();
  }

  // 鼻子
  dogCtx.fillStyle = '#5a3a1a';
  dogCtx.beginPath();
  dogCtx.ellipse(baseX, baseY - 5, 3, 2.5, 0, 0, Math.PI * 2);
  dogCtx.fill();

  // 嘴巴
  dogCtx.strokeStyle = '#5a3a1a';
  dogCtx.lineWidth = 1.5;
  if (dog.mouthOpen || dog.cheering) {
    // 张嘴（欢呼）
    dogCtx.fillStyle = '#e85d5d';
    dogCtx.beginPath();
    dogCtx.ellipse(baseX, baseY + 1, 4, 3, 0, 0, Math.PI * 2);
    dogCtx.fill();
    dogCtx.stroke();
  } else {
    // 微笑
    dogCtx.beginPath();
    dogCtx.arc(baseX, baseY - 1, 5, 0.1, Math.PI - 0.1);
    dogCtx.stroke();
  }

  // 腮红
  dogCtx.fillStyle = 'rgba(255, 150, 150, 0.4)';
  dogCtx.beginPath();
  dogCtx.ellipse(baseX - 10, baseY - 4, 4, 3, 0, 0, Math.PI * 2);
  dogCtx.fill();
  dogCtx.beginPath();
  dogCtx.ellipse(baseX + 10, baseY - 4, 4, 3, 0, 0, Math.PI * 2);
  dogCtx.fill();

  // 前腿（左）
  dogCtx.fillStyle = '#d4a574';
  dogCtx.fillRect(baseX - 12, baseY + 28, 6, 16);
  dogCtx.strokeStyle = '#b8864e';
  dogCtx.lineWidth = 1;
  dogCtx.strokeRect(baseX - 12, baseY + 28, 6, 16);
  // 前腿（右）
  dogCtx.fillRect(baseX + 6, baseY + 28, 6, 16);
  dogCtx.strokeRect(baseX + 6, baseY + 28, 6, 16);

  // 爪子
  dogCtx.fillStyle = '#f0d5b0';
  dogCtx.beginPath();
  dogCtx.ellipse(baseX - 9, baseY + 44, 4, 3, 0, 0, Math.PI * 2);
  dogCtx.fill();
  dogCtx.beginPath();
  dogCtx.ellipse(baseX + 9, baseY + 44, 4, 3, 0, 0, Math.PI * 2);
  dogCtx.fill();

  // 尾巴（摆动）
  const tailAngle = Math.sin(dog.tailWag) * 0.5;
  dogCtx.strokeStyle = '#c49464';
  dogCtx.lineWidth = 5;
  dogCtx.lineCap = 'round';
  dogCtx.beginPath();
  dogCtx.moveTo(baseX + 20, baseY + 10);
  const tailEndX = baseX + 28 + Math.sin(dog.tailWag) * 8;
  const tailEndY = baseY - 5 + Math.cos(dog.tailWag) * 5;
  dogCtx.quadraticCurveTo(baseX + 26, baseY - 2, tailEndX, tailEndY);
  dogCtx.stroke();

  // 如果欢呼，显示 "加油！" 文字
  if (dog.cheering) {
    dogCtx.fillStyle = '#ec407a';
    dogCtx.font = 'bold 18px "Segoe UI", sans-serif';
    dogCtx.textAlign = 'center';
    dogCtx.fillText('加油!', baseX, baseY - 35);
  }

  dogCtx.restore();
}

// 小狗跟随方块
function updateDogFollow() {
  if (currentPiece && !gameOver) {
    // 方块在棋盘中的 Y 像素位置
    const piecePixelY = currentPiece.y * BLOCK_SIZE;
    // 映射到狗画布（狗画布高度 600，棋盘高度 600）
    dog.targetY = piecePixelY;
  }
}

// 小狗跳跃（方块落底时触发）
function dogJump() {
  dog.jumping = true;
  dog.jumpTimer = 400;
}

// 小狗欢呼（消除行时触发）
function dogCheer() {
  dog.cheering = true;
  dog.cheerTimer = 1200;
  dog.mouthOpen = true;
}

// ===== Game Over =====
function showGameOver() {
  finalScoreSpan.textContent = score;
  gameOverOverlay.classList.remove('hidden');
  if (dropTimer) {
    clearInterval(dropTimer);
    dropTimer = null;
  }
  if (window.dogAnimTimer) {
    clearInterval(window.dogAnimTimer);
    window.dogAnimTimer = null;
  }
}

// ===== 重新开始 =====
function resetGame() {
  board = createEmptyBoard();
  score = 0;
  gameOver = false;
  updateScore();
  gameOverOverlay.classList.add('hidden');

  // 重置小狗
  dog.y = 0;
  dog.targetY = 0;
  dog.jumping = false;
  dog.cheering = false;
  dog.blinkTimer = 2000 + Math.random() * 3000;

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

  // 小狗动画循环（独立刷新，保证尾巴摆动流畅）
  if (window.dogAnimTimer) clearInterval(window.dogAnimTimer);
  window.dogAnimTimer = setInterval(() => {
    drawDog();
  }, 30);

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
