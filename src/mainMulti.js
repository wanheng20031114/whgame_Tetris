/**
 * mainMulti.js - 3-21人多人俄罗斯方块客户端入口
 * 
 * 负责处理多人游戏界面、Socket通信、对手视图渲染等
 */

import io from 'socket.io-client';
import { TetrisGame, CONSTANTS } from './game/tetris.js';

// 初始化 Socket 连接
const socket = io('/', {
    autoConnect: false
});

/**
 * 全局应用状态
 */
const appState = {
    user: null,               // 当前登录用户信息
    roomId: null,             // 当前房间ID
    isHost: false,            // 是否为房主
    currentView: 'waiting',   // 当前视图: 'waiting' | 'game'
    localGame: null,          // 本地游戏实例
    opponents: new Map(),     // 对手信息 Map<socketId, {game, element, ...}>
    isSpectating: false,      // 是否处于观战状态
    myRank: null              // 自己的排名
};

// ========== DOM 元素引用 ==========
const views = {
    waiting: document.getElementById('waiting-view'),
    game: document.getElementById('game-view')
};

const display = {
    roomId: document.getElementById('room-id-display'),
    playerCount: document.getElementById('player-count-display'),
    waitingPlayersList: document.getElementById('waiting-players-list'),
    opponentsGrid: document.getElementById('opponents-grid'),
    aliveCount: document.getElementById('alive-count'),
    localScore: document.getElementById('local-score'),
    localRank: document.getElementById('local-rank'),
    gameStatus: document.getElementById('game-status')
};

const buttons = {
    startGame: document.getElementById('start-game-btn'),
    leaveWaiting: document.getElementById('leave-waiting-btn'),
    restartGame: document.getElementById('restart-game-btn'),
    leaveGame: document.getElementById('leave-game-btn')
};

const chatElements = {
    waitingMessages: document.getElementById('waiting-chat-messages'),
    waitingInput: document.getElementById('waiting-chat-input'),
    waitingSendBtn: document.getElementById('waiting-chat-send-btn'),
    gameMessages: document.getElementById('game-chat-messages'),
    gameInput: document.getElementById('game-chat-input'),
    gameSendBtn: document.getElementById('game-chat-send-btn')
};

// ========== 视图切换 ==========
function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    appState.currentView = viewName;
}

// ========== 初始化 ==========
function init() {
    // 从 URL 参数获取房间信息
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const action = params.get('action'); // 'create' 或 'join'
    const maxPlayers = parseInt(params.get('max')) || 3;

    // 从 localStorage 获取用户信息
    const userStr = localStorage.getItem('tetris_user');
    if (!userStr) {
        alert('请先登录！');
        window.location.href = '/';
        return;
    }

    appState.user = JSON.parse(userStr);

    // 配置 Socket 认证
    socket.auth = {
        userId: appState.user.id,
        username: appState.user.username
    };

    socket.connect();

    // 根据 action 执行操作
    socket.on('connect', () => {
        console.log('Connected to server');
        if (action === 'create') {
            socket.emit('create_multi_room', maxPlayers);
        } else if (action === 'join' && roomId) {
            socket.emit('join_multi_room', roomId);
        }
    });

    setupEventListeners();
    setupSocketHandlers();

    // 初始状态：禁用重新开始按钮（后续根据房主状态更新）
    buttons.restartGame.disabled = true;
}

// ========== 事件监听器设置 ==========
function setupEventListeners() {
    // 开始游戏按钮
    buttons.startGame.addEventListener('click', () => {
        socket.emit('start_multi_game');
    });

    // 离开房间按钮（等待界面）
    buttons.leaveWaiting.addEventListener('click', () => {
        socket.emit('leave_multi_room');
        window.location.href = '/';
    });

    // 离开房间按钮（游戏界面）
    buttons.leaveGame.addEventListener('click', () => {
        socket.emit('leave_multi_room');
        window.location.href = '/';
    });

    // 重新开始按钮
    buttons.restartGame.addEventListener('click', () => {
        socket.emit('restart_multi_game');
    });

    // 聊天发送（等待界面）
    chatElements.waitingSendBtn.addEventListener('click', () => sendChat('waiting'));
    chatElements.waitingInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat('waiting');
    });

    // 聊天发送（游戏界面）
    chatElements.gameSendBtn.addEventListener('click', () => sendChat('game'));
    chatElements.gameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat('game');
    });

    // 键盘控制
    document.addEventListener('keydown', handleKeydown);
}

// ========== 聊天功能 ==========
function sendChat(view) {
    const input = view === 'waiting' ? chatElements.waitingInput : chatElements.gameInput;
    const text = input.value.trim();
    if (text) {
        socket.emit('multi_chat_message', text);
        input.value = '';
        input.focus();
    }
}

function addChatMessage(msg, view = 'both') {
    const createMsgDiv = () => {
        const div = document.createElement('div');
        if (msg.type === 'system') {
            div.className = 'chat-msg system';
            div.textContent = msg.text;
        } else if (msg.type === 'attack') {
            div.className = 'chat-msg attack';
            div.textContent = msg.text;
        } else {
            div.className = 'chat-msg user';
            div.innerHTML = `<span>${msg.username}:</span> ${msg.text}`;
        }
        return div;
    };

    if (view === 'waiting' || view === 'both') {
        const div = createMsgDiv();
        chatElements.waitingMessages.appendChild(div);
        chatElements.waitingMessages.scrollTop = chatElements.waitingMessages.scrollHeight;
    }

    if (view === 'game' || view === 'both') {
        const div = createMsgDiv();
        chatElements.gameMessages.appendChild(div);
        chatElements.gameMessages.scrollTop = chatElements.gameMessages.scrollHeight;
    }
}

// ========== Socket 事件处理 ==========
function setupSocketHandlers() {
    // 房间创建成功
    socket.on('multi_room_created', (data) => {
        appState.roomId = data.roomId;
        appState.isHost = data.isHost;
        display.roomId.textContent = `房间: ${data.roomId}`;
        display.playerCount.textContent = `玩家: 1/${data.maxPlayers}`;
        buttons.startGame.disabled = true; // 至少2人才能开始
        updateHostUI();
    });

    // 加入房间成功
    socket.on('multi_room_joined', (data) => {
        appState.roomId = data.roomId;
        appState.isHost = data.isHost;
        display.roomId.textContent = `房间: ${data.roomId}`;
        updateHostUI();
    });

    // 玩家列表更新
    socket.on('multi_player_list', (players) => {
        updateWaitingPlayersList(players);
    });

    // 房主变更
    socket.on('multi_host_changed', (data) => {
        appState.isHost = (socket.id === data.newHostId);
        updateHostUI();
        addChatMessage({ type: 'system', text: `👑 ${data.newHostName} 成为新房主` });
    });

    // 游戏准备就绪
    socket.on('multi_game_ready', (data) => {
        startGame(data);
    });

    // 游戏动作（来自其他玩家）
    socket.on('multi_game_action', (data) => {
        handleOpponentAction(data);
    });

    // 收到垃圾行攻击
    socket.on('multi_receive_garbage', (data) => {
        if (appState.localGame && !appState.localGame.gameOver) {
            appState.localGame.addGarbage(data.lines);
        }
    });

    // 攻击事件（用于UI显示）
    socket.on('multi_attack_event', (data) => {
        addChatMessage({
            type: 'attack',
            text: `⚔️ ${data.from} 攻击了 ${data.to} (${data.lines}行)`
        }, 'game');

        // 高亮被攻击的对手卡片
        highlightOpponent(data.to);
    });

    // 玩家淘汰
    socket.on('multi_player_eliminated', (data) => {
        handlePlayerEliminated(data);
    });

    // 游戏结束
    socket.on('multi_game_finished', (data) => {
        handleGameFinished(data);
    });

    // 游戏重置
    socket.on('multi_game_reset', () => {
        resetToWaiting();
    });

    // 聊天消息
    socket.on('chat_message', (msg) => {
        const view = appState.currentView === 'waiting' ? 'waiting' : 'game';
        addChatMessage(msg, view);
    });

    // 错误处理
    socket.on('room_error', (msg) => {
        alert(msg);
    });
}

// ========== UI 更新函数 ==========
function updateHostUI() {
    if (appState.isHost) {
        buttons.startGame.style.display = '';
        // 房主可以重新开始（游戏结束后）
    } else {
        buttons.startGame.style.display = 'none';
        // 非房主始终禁用重新开始按钮
        buttons.restartGame.disabled = true;
    }

    // 更新本地玩家名称显示
    const localNameEl = document.getElementById('local-player-name');
    if (localNameEl) {
        const username = appState.user ? appState.user.username : '你';
        localNameEl.textContent = appState.isHost ? `${username} 👑` : username;
    }
}

function updateWaitingPlayersList(players) {
    display.waitingPlayersList.innerHTML = '';
    let maxPlayers = 3;

    players.forEach(player => {
        const li = document.createElement('li');
        // 房主名字后面加皇冠标识
        li.textContent = player.username;
        if (player.isHost) {
            li.classList.add('host');
        }
        if (player.socketId === socket.id) {
            li.style.fontWeight = 'bold';
            // 同时更新自己的房主状态
            appState.isHost = player.isHost;
        }
        display.waitingPlayersList.appendChild(li);
    });

    // 更新房主UI
    updateHostUI();

    // 更新人数和开始按钮状态
    const count = players.length;
    display.playerCount.textContent = `玩家: ${count}/?`;
    buttons.startGame.disabled = count < 2;
}

// ========== 游戏逻辑 ==========
function startGame(data) {
    switchView('game');
    appState.isSpectating = false;
    appState.myRank = null;

    // 清空对手区域
    display.opponentsGrid.innerHTML = '';
    appState.opponents.clear();

    // 重置状态栏
    display.gameStatus.classList.add('hidden');
    display.localRank.textContent = '';
    // 非房主的重新开始按钮始终禁用
    buttons.restartGame.disabled = !appState.isHost || true; // 游戏进行中都禁用

    // 更新本地玩家名称显示（带房主标识）
    updateHostUI();

    // 创建对手视图
    data.players.forEach(player => {
        if (player.socketId !== socket.id) {
            createOpponentCard(player);
        }
    });

    updateAliveCount(data.players.filter(p => p.alive).length);

    // 初始化本地游戏
    const localCanvas = document.getElementById('local-board');
    if (appState.localGame) {
        appState.localGame.gameOver = true;
        if (appState.localGame.soundManager) {
            appState.localGame.soundManager.stopBGM();
        }
    }

    appState.localGame = new TetrisGame(localCanvas, false, data.seed);
    appState.localGame.soundManager.playBGM();

    // 绑定回调
    let lastSentScore = 0;
    appState.localGame.onScore = (score) => {
        display.localScore.textContent = score;
        socket.emit('multi_game_action', { type: 'score', value: score });

        // 攻击逻辑
        const attackThreshold = 200;
        const attacks = Math.floor(score / attackThreshold) - Math.floor(lastSentScore / attackThreshold);
        if (attacks > 0) {
            socket.emit('multi_game_action', { type: 'garbage', value: attacks });
        }
        lastSentScore = score;
    };

    appState.localGame.onBoardUpdate = (board) => {
        socket.emit('multi_game_action', { type: 'board', value: board });
    };

    // 下一个方块预览
    const nextPieceCanvas = document.getElementById('next-piece');
    const nextPieceCtx = nextPieceCanvas.getContext('2d');
    appState.localGame.onNextPiece = (piece) => {
        if (!piece) return;
        nextPieceCtx.fillStyle = '#000';
        nextPieceCtx.fillRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);

        const blockSize = 25;
        const offsetX = (nextPieceCanvas.width - piece[0].length * blockSize) / 2;
        const offsetY = (nextPieceCanvas.height - piece.length * blockSize) / 2;

        piece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0 && CONSTANTS.COLORS) {
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

    appState.localGame.onGameOver = () => {
        socket.emit('multi_game_action', { type: 'game_over' });
        appState.localGame.soundManager.stopBGM();
    };

    appState.localGame.start();
}

function createOpponentCard(player) {
    const card = document.createElement('div');
    card.className = 'opponent-card';
    card.id = `opponent-${player.socketId}`;

    // 对手名称（房主加皇冠）
    const displayName = player.username;

    card.innerHTML = `
        <div class="opponent-name">${displayName}</div>
        <div class="opponent-canvas-wrapper">
            <canvas width="90" height="180"></canvas>
            <div class="opponent-rank-overlay hidden"></div>
        </div>
        <div class="opponent-score">0分</div>
    `;

    display.opponentsGrid.appendChild(card);

    // 创建缩小版游戏实例（仅用于渲染）
    const canvas = card.querySelector('canvas');
    const miniGame = new TetrisGame(canvas, true, 1, 9); // 9px方块大小

    appState.opponents.set(player.socketId, {
        element: card,
        game: miniGame,
        username: player.username,
        score: 0,
        alive: true
    });
}

function handleOpponentAction(data) {
    const opponent = appState.opponents.get(data.socketId);
    if (!opponent) return;

    if (data.type === 'board') {
        opponent.game.setBoardState(data.value);
    } else if (data.type === 'score') {
        opponent.score = data.value;
        const scoreEl = opponent.element.querySelector('.opponent-score');
        if (scoreEl) scoreEl.textContent = `${data.value}分`;
    }
}

function handlePlayerEliminated(data) {
    // 检查是否是自己
    if (data.socketId === socket.id) {
        appState.isSpectating = true;
        appState.myRank = data.rank;
        display.localRank.textContent = `#${data.rank}`;
        display.localRank.classList.add('eliminated');

        display.gameStatus.textContent = `你被淘汰了！排名 #${data.rank}`;
        display.gameStatus.className = 'status-bar spectating';
        display.gameStatus.classList.remove('hidden');

        // 在棋盘上绘制名次（只绘制数字，不绘制#）
        drawRankOnBoard(data.rank, false);
    } else {
        // 更新对手卡片
        const opponent = appState.opponents.get(data.socketId);
        if (opponent) {
            opponent.alive = false;
            opponent.element.classList.add('eliminated');

            const overlay = opponent.element.querySelector('.opponent-rank-overlay');
            if (overlay) {
                overlay.textContent = `#${data.rank}`;
                overlay.classList.remove('hidden');
            }
        }
    }

    // 更新存活人数
    let aliveCount = 0;
    if (appState.localGame && !appState.localGame.gameOver) aliveCount++;
    appState.opponents.forEach(opp => {
        if (opp.alive) aliveCount++;
    });
    updateAliveCount(aliveCount);

    addChatMessage({
        type: 'system',
        text: `💀 ${data.username} 被淘汰 (${data.reason === 'left' ? '离开' : '触顶'}) - 排名 #${data.rank}`
    }, 'game');
}

function handleGameFinished(data) {
    if (appState.localGame && appState.localGame.soundManager) {
        appState.localGame.soundManager.stopBGM();
    }

    const winner = data.rankings[0];
    const isWinner = winner.socketId === socket.id;

    // 先停止游戏循环，再绘制名次
    if (appState.localGame) {
        appState.localGame.gameOver = true;
    }

    if (isWinner) {
        display.localRank.textContent = '#1 🏆';
        display.localRank.classList.remove('eliminated');
        display.localRank.classList.add('winner');
        display.gameStatus.textContent = '🎉 恭喜你获得冠军！';
        display.gameStatus.className = 'status-bar win';
        // 延迟一帧后绘制金色的1，确保游戏循环已停止
        setTimeout(() => drawRankOnBoard(1, true), 50);
    } else if (!appState.myRank) {
        // 如果还没被淘汰但游戏结束了（说明是第2名）
        appState.myRank = 2;
        display.localRank.textContent = '#2';
        display.gameStatus.textContent = '游戏结束 - 第2名';
        display.gameStatus.className = 'status-bar lose';
        setTimeout(() => drawRankOnBoard(2, false), 50);
    }
    display.gameStatus.classList.remove('hidden');

    // 游戏结束后所有玩家都可以点击重新开始
    buttons.restartGame.disabled = false;
}

function resetToWaiting() {
    switchView('waiting');
    appState.isSpectating = false;
    appState.myRank = null;
    display.localRank.textContent = '';
    display.localRank.className = 'player-rank';
    display.gameStatus.classList.add('hidden');
    buttons.restartGame.disabled = true;

    if (appState.localGame) {
        appState.localGame.gameOver = true;
        if (appState.localGame.soundManager) {
            appState.localGame.soundManager.stopBGM();
        }
    }

    // 清空对手
    appState.opponents.clear();
    display.opponentsGrid.innerHTML = '';
}

function updateAliveCount(count) {
    display.aliveCount.textContent = `(${count} 存活)`;
}

function highlightOpponent(username) {
    appState.opponents.forEach(opp => {
        if (opp.username === username) {
            opp.element.classList.add('attacking');
            setTimeout(() => {
                opp.element.classList.remove('attacking');
            }, 300);
        }
    });
}

// ========== 名次渲染 ==========
// 数字点阵 (5宽 x 7高)
const DIGIT_PATTERNS = {
    '0': [
        [1, 1, 1],
        [1, 0, 1],
        [1, 0, 1],
        [1, 0, 1],
        [1, 1, 1]
    ],
    '1': [
        [0, 1, 0],
        [1, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
        [1, 1, 1]
    ],
    '2': [
        [1, 1, 1],
        [0, 0, 1],
        [1, 1, 1],
        [1, 0, 0],
        [1, 1, 1]
    ],
    '3': [
        [1, 1, 1],
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 1],
        [1, 1, 1]
    ],
    '4': [
        [1, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 0, 1],
        [0, 0, 1]
    ],
    '5': [
        [1, 1, 1],
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 1],
        [1, 1, 1]
    ],
    '6': [
        [1, 1, 1],
        [1, 0, 0],
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1]
    ],
    '7': [
        [1, 1, 1],
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1]
    ],
    '8': [
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1]
    ],
    '9': [
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 0, 1],
        [1, 1, 1]
    ],
    '#': [
        [1, 0, 1],
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1],
        [1, 0, 1]
    ]
};

/**
 * 在棋盘上绘制名次数字
 * @param {number} rank - 名次
 * @param {boolean} isWinner - 是否是冠军（金色）
 */
function drawRankOnBoard(rank, isWinner = false) {
    const canvas = document.getElementById('local-board');
    const ctx = canvas.getContext('2d');

    // 半透明覆盖层
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 只绘制数字（不绘制#）
    const text = rank.toString();
    const blockSize = 30; // 稍微大一点

    // 计算总宽度
    let totalWidth = 0;
    for (const char of text) {
        const pattern = DIGIT_PATTERNS[char];
        if (pattern) {
            totalWidth += pattern[0].length * blockSize + blockSize; // 字符宽度 + 间距
        }
    }
    totalWidth -= blockSize; // 移除最后一个间距

    const startX = (canvas.width - totalWidth) / 2;
    const startY = (canvas.height - 5 * blockSize) / 2;

    // 冠军用金色，其他用灰色
    const blockColor = isWinner ? '#FFD700' : '#888';

    let offsetX = startX;
    for (const char of text) {
        const pattern = DIGIT_PATTERNS[char];
        if (pattern) {
            pattern.forEach((row, y) => {
                row.forEach((val, x) => {
                    if (val) {
                        ctx.fillStyle = blockColor;
                        ctx.fillRect(
                            offsetX + x * blockSize,
                            startY + y * blockSize,
                            blockSize - 2,
                            blockSize - 2
                        );
                    }
                });
            });
            offsetX += (pattern[0].length + 1) * blockSize;
        }
    }
}

// ========== 键盘控制 ==========
function handleKeydown(event) {
    if (appState.currentView !== 'game' ||
        appState.isSpectating ||
        !appState.localGame ||
        appState.localGame.gameOver) {
        return;
    }

    // 检查是否在输入框中
    if (document.activeElement === chatElements.gameInput) {
        return;
    }

    switch (event.code) {
        case 'KeyA':
        case 'ArrowLeft':
            appState.localGame.move(-1);
            break;
        case 'KeyD':
        case 'ArrowRight':
            appState.localGame.move(1);
            break;
        case 'KeyS':
        case 'ArrowDown':
            appState.localGame.drop();
            break;
        case 'KeyW':
        case 'ArrowUp':
            appState.localGame.rotate(1);
            break;
        case 'Space':
            appState.localGame.hardDrop();
            break;
    }
}

// ========== 启动 ==========
init();
