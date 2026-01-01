/**
 * mainSingle.js - 单人模式客户端入口
 * 
 * 负责处理单人游戏界面、本地游戏逻辑、分数显示等
 * 无需 Socket 通信，纯本地运行
 */

import { TetrisGame, CONSTANTS } from './game/tetris.js';
import { cleanupGame, createGame } from './utils/gameManager.js';
import { renderLeaderboard as renderLeaderboardUtil } from './utils/renderUtils.js';
import { createKeyboardHandler } from './utils/keyboardHandler.js';

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
    // 5个预览方块画布
    nextPieces: [
        document.getElementById('next-piece-0'),
        document.getElementById('next-piece-1'),
        document.getElementById('next-piece-2'),
        document.getElementById('next-piece-3'),
        document.getElementById('next-piece-4')
    ],
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

    // 键盘控制（使用公共模块）
    const keyHandler = createKeyboardHandler(() => appState.game);
    document.addEventListener('keydown', keyHandler);
}

// ========== 游戏控制 ==========

/**
 * 开始新游戏
 */
function startGame() {
    console.log('开始新游戏');

    // 清理旧游戏（使用公共模块）
    cleanupGame(appState.game);
    stopTimer();

    // 生成随机种子
    const seed = Math.floor(Math.random() * 1000000);

    // 创建新游戏实例（使用公共模块）
    appState.game = createGame(elements.gameBoard, seed, {
        onScore: (score) => {
            elements.scoreDisplay.textContent = score;
        },
        onBoardUpdate: () => {
            updateSpeedDisplay();
        },
        onGameOver: () => {
            console.log('游戏结束，分数:', appState.game.score);
            appState.game.soundManager.stopBGM();
            stopTimer();
            showGameOver();
            saveScore(appState.game.score);
        },
        enableNextPiecesPreview: true,
        playBGM: true
    });

    // 重置显示
    elements.scoreDisplay.textContent = '0';
    elements.speedDisplay.textContent = '500ms';
    elements.timeDisplay.textContent = '00:00';

    // 记录开始时间
    appState.gameStartTime = Date.now();

    // 启动计时器
    startTimer();

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
 * 渲染排行榜（使用公共模块）
 * @param {Array} leaderboard - 排行榜数据
 */
function renderLeaderboard(leaderboard) {
    const currentUsername = appState.user ? appState.user.username : null;
    renderLeaderboardUtil(elements.leaderboardList, leaderboard, currentUsername);
}

// ========== 启动 ==========
init();
