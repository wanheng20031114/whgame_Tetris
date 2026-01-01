/**
 * mainSingle.js - 单人模式客户端入口
 * 
 * 负责处理单人游戏界面、本地游戏逻辑、分数显示等
 * 无需 Socket 通信，纯本地运行
 */

import { TetrisGame, CONSTANTS } from './game/tetris.js';

// ========== 全局状态 ==========
const appState = {
    game: null,           // 游戏实例
    gameStartTime: null,  // 游戏开始时间
    timerInterval: null,  // 计时器间隔
    user: null            // 当前登录用户
};

// ========== DOM 元素引用 ==========
const elements = {
    gameBoard: document.getElementById('game-board'),
    nextPiece: document.getElementById('next-piece'),
    scoreDisplay: document.getElementById('score-display'),
    speedDisplay: document.getElementById('speed-display'),
    timeDisplay: document.getElementById('time-display'),
    gameOverOverlay: document.getElementById('game-over-overlay'),
    finalScoreValue: document.getElementById('final-score-value'),
    newHighScore: document.getElementById('new-high-score'),
    leaderboardList: document.getElementById('leaderboard-list'),
    backBtn: document.getElementById('back-btn'),
    restartBtn: document.getElementById('restart-btn'),
    backToLobbyBtn: document.getElementById('back-to-lobby-btn')
};

// ========== 初始化 ==========
function init() {
    console.log('单人模式初始化...');

    // 从 localStorage 获取用户信息
    const userJson = localStorage.getItem('tetris_user');
    if (userJson) {
        appState.user = JSON.parse(userJson);
        console.log('用户:', appState.user.username);
    }

    // 绑定事件
    setupEventListeners();

    // 开始游戏
    startGame();
}

// ========== 事件监听器设置 ==========
function setupEventListeners() {
    // 返回大厅按钮
    elements.backBtn.addEventListener('click', () => {
        if (appState.game) {
            appState.game.gameOver = true;
            appState.game.soundManager.stopBGM();
        }
        stopTimer();
        window.location.href = '/';
    });

    // 再玩一次按钮
    elements.restartBtn.addEventListener('click', () => {
        elements.gameOverOverlay.classList.add('hidden');
        startGame();
    });

    // 返回大厅按钮 (游戏结束覆盖层)
    elements.backToLobbyBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    // 键盘控制
    document.addEventListener('keydown', handleKeydown);
}

// ========== 游戏控制 ==========

/**
 * 开始新游戏
 */
function startGame() {
    console.log('开始新游戏');

    // 清理旧游戏
    if (appState.game) {
        appState.game.gameOver = true;
        appState.game.soundManager.stopBGM();
    }
    stopTimer();

    // 生成随机种子
    const seed = Math.floor(Math.random() * 1000000);

    // 创建新游戏实例
    appState.game = new TetrisGame(elements.gameBoard, false, seed);

    // 绑定回调
    // 1. 分数变动
    appState.game.onScore = (score) => {
        elements.scoreDisplay.textContent = score;
    };

    // 2. 棋盘更新 (用于更新速度显示)
    appState.game.onBoardUpdate = () => {
        updateSpeedDisplay();
    };

    // 3. 下一个方块预览
    const nextPieceCtx = elements.nextPiece.getContext('2d');
    appState.game.onNextPiece = (piece) => {
        if (!piece) return;

        // 清空预览画布
        nextPieceCtx.fillStyle = '#000';
        nextPieceCtx.fillRect(0, 0, elements.nextPiece.width, elements.nextPiece.height);

        // 居中计算
        const blockSize = 25;
        const offsetX = (elements.nextPiece.width - piece[0].length * blockSize) / 2;
        const offsetY = (elements.nextPiece.height - piece.length * blockSize) / 2;

        // 绘制下一个方块
        piece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0 && CONSTANTS && CONSTANTS.COLORS) {
                    nextPieceCtx.fillStyle = CONSTANTS.COLORS[value];
                    nextPieceCtx.fillRect(
                        offsetX + x * blockSize,
                        offsetY + y * blockSize,
                        blockSize - 1,
                        blockSize - 1
                    );
                }
            });
        });
    };

    // 4. 游戏结束
    appState.game.onGameOver = () => {
        console.log('游戏结束，分数:', appState.game.score);
        appState.game.soundManager.stopBGM();
        stopTimer();
        showGameOver();
        saveScore(appState.game.score);
    };

    // 重置显示
    elements.scoreDisplay.textContent = '0';
    elements.speedDisplay.textContent = '500ms';
    elements.timeDisplay.textContent = '00:00';

    // 记录开始时间
    appState.gameStartTime = Date.now();

    // 启动计时器
    startTimer();

    // 播放背景音乐
    appState.game.soundManager.playBGM();

    // 启动游戏
    appState.game.start();
}

/**
 * 更新速度显示
 */
function updateSpeedDisplay() {
    if (appState.game) {
        const speed = Math.round(appState.game.dropInterval);
        elements.speedDisplay.textContent = speed + 'ms';
    }
}

/**
 * 启动计时器
 */
function startTimer() {
    appState.timerInterval = setInterval(() => {
        if (!appState.gameStartTime) return;

        const elapsed = Date.now() - appState.gameStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;

        elements.timeDisplay.textContent =
            String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

        // 同时更新速度显示
        updateSpeedDisplay();
    }, 100);
}

/**
 * 停止计时器
 */
function stopTimer() {
    if (appState.timerInterval) {
        clearInterval(appState.timerInterval);
        appState.timerInterval = null;
    }
}

/**
 * 显示游戏结束界面
 */
function showGameOver() {
    elements.finalScoreValue.textContent = appState.game.score;
    elements.newHighScore.classList.add('hidden'); // 隐藏新纪录提示
    elements.gameOverOverlay.classList.remove('hidden');
    loadLeaderboard(); // 加载排行榜
}

/**
 * 保存分数到服务器
 * @param {number} score - 游戏分数
 */
async function saveScore(score) {
    // 如果用户未登录，不保存分数
    if (!appState.user) {
        console.log('用户未登录，分数不保存');
        return;
    }

    try {
        const response = await fetch('/api/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: appState.user.id,
                score: score
            })
        });

        const data = await response.json();
        if (data.success) {
            console.log('分数保存成功');
            // 如果是新纪录，显示提示
            if (data.newHighScore) {
                elements.newHighScore.classList.remove('hidden');
            }
            // 重新加载排行榜以显示最新数据
            loadLeaderboard();
        } else {
            console.error('分数保存失败:', data.error);
        }
    } catch (error) {
        console.error('网络错误，分数保存失败:', error);
    }
}

/**
 * 加载排行榜
 */
async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();

        if (data.success && data.leaderboard) {
            renderLeaderboard(data.leaderboard);
        } else {
            elements.leaderboardList.innerHTML = '<li class="error">加载失败</li>';
        }
    } catch (error) {
        console.error('加载排行榜失败:', error);
        elements.leaderboardList.innerHTML = '<li class="error">网络错误</li>';
    }
}

/**
 * 渲染排行榜
 * @param {Array} leaderboard - 排行榜数据
 */
function renderLeaderboard(leaderboard) {
    if (leaderboard.length === 0) {
        elements.leaderboardList.innerHTML = '<li class="empty">暂无记录</li>';
        return;
    }

    const currentUsername = appState.user ? appState.user.username : null;

    elements.leaderboardList.innerHTML = leaderboard.map((entry, index) => {
        const rank = index + 1;
        const isCurrentUser = entry.username === currentUsername;
        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
        const userClass = isCurrentUser ? 'current-user' : '';

        return `
            <li class="${rankClass} ${userClass}">
                <span class="rank">${rank}</span>
                <span class="username">${entry.username}</span>
                <span class="score">${entry.score}</span>
            </li>
        `;
    }).join('');
}

// ========== 键盘控制 ==========
function handleKeydown(event) {
    // 如果游戏未开始或已结束，忽略输入
    if (!appState.game || appState.game.gameOver) return;

    switch (event.code) {
        case 'KeyA':
        case 'ArrowLeft':
            appState.game.move(-1);
            break;
        case 'KeyD':
        case 'ArrowRight':
            appState.game.move(1);
            break;
        case 'KeyS':
        case 'ArrowDown':
            appState.game.drop();
            break;
        case 'KeyW':
        case 'ArrowUp':
            appState.game.rotate(1);
            break;
        case 'Space':
            appState.game.hardDrop();
            break;
    }
}

// ========== 启动 ==========
init();
