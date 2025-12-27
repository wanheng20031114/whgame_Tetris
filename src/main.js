
import io from 'socket.io-client';
import { TetrisGame, CONSTANTS } from './game/tetris.js';

// 初始化 Socket 连接，设置为不自动连接，等待登录成功手动连接
const socket = io('/', {
    autoConnect: false
});

/**
 * 全局应用状态
 */
const appState = {
    user: null,             // 当前登录用户信息
    currentView: 'login-view', // 当前显示的界面 ID
    localGame: null,        // 本地游戏实例
    remoteGame: null        // 远程游戏（对手）实例
};

// DOM 元素引用缓存
const views = {
    login: document.getElementById('login-view'),
    lobby: document.getElementById('lobby-view'),
    game: document.getElementById('game-view')
};

const inputs = {
    username: document.getElementById('username'),
    password: document.getElementById('password')
};

const buttons = {
    login: document.getElementById('login-btn'),
    register: document.getElementById('register-btn'),
    createRoom: document.getElementById('create-room-btn'),
    leaveRoom: document.getElementById('leave-room-btn')
};

const display = {
    user: document.getElementById('user-display'),
    rooms: document.getElementById('rooms'),
    roomId: document.getElementById('room-id-display')
};

/**
 * 切换界面视图
 * @param {string} viewName - 目标视图的 key (login/lobby/game)
 */
function switchView(viewName) {
    // 隐藏所有视图
    Object.values(views).forEach(el => el.classList.add('hidden'));
    // 显示目标视图
    views[viewName].classList.remove('hidden');
    appState.currentView = viewName;
}

/**
 * 处理用户认证 (登录/注册)
 * @param {string} endpoint - API 路径后缀 ('login' 或 'register')
 */
async function handleAuth(endpoint) {
    const username = inputs.username.value.trim();
    const password = inputs.password.value.trim();

    if (!username || !password) {
        alert('Please enter username and password');
        return;
    }

    try {
        const res = await fetch(`/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            if (endpoint === 'login') {
                // 登录成功
                appState.user = data.user;
                display.user.textContent = `User: ${data.user.username}`;

                // 配置 Socket 认证信息并连接
                socket.auth = { userId: data.user.id, username: data.user.username };
                socket.connect();

                // 跳转大厅
                switchView('lobby');
            } else {
                // 注册成功，提示去登录
                alert('Registration successful! Please login.');
            }
        } else {
            alert(data.error || 'Auth failed');
        }
    } catch (err) {
        console.error(err);
        alert('Network error');
    }
}

// --- DOM 事件监听绑定 ---

buttons.login.addEventListener('click', () => handleAuth('login'));
buttons.register.addEventListener('click', () => handleAuth('register'));

buttons.createRoom.addEventListener('click', () => {
    socket.emit('create_room');
});

buttons.leaveRoom.addEventListener('click', () => {
    socket.emit('leave_room');
    switchView('lobby');
});

// --- Socket.IO 事件处理 ---

socket.on('connect', () => {
    console.log('Connected to server');
});

// 房间创建成功
socket.on('room_created', (roomId) => {
    console.log('Room created:', roomId);
    display.roomId.textContent = `Room: ${roomId}`;
    switchView('game');
});

// 加入房间成功
socket.on('room_joined', (roomId) => {
    console.log('Room joined:', roomId);
    display.roomId.textContent = `Room: ${roomId}`;
    switchView('game');
});

// 大厅房间列表更新
socket.on('room_list', (rooms) => {
    console.log('Rooms:', rooms);
    display.rooms.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.className = 'room-item';
        // 显示房间信息：ID，人数，状态
        li.textContent = `Room ${room.id} (${Object.keys(room.players).length}/2) - ${room.status}`;

        // 如果房间在等待且未满员，显示加入按钮
        if (room.status === 'waiting' && Object.keys(room.players).length < 2) {
            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Join';
            joinBtn.onclick = () => {
                socket.emit('join_room', room.id);
            };
            li.appendChild(joinBtn);
        }

        display.rooms.appendChild(li);
    });
});

socket.on('player_joined', (user) => {
    console.log('Player joined:', user);
    // 可扩展：在界面上显示提示 "玩家 xxx 加入了房间"
});

// 游戏准备就绪 (两名玩家都已加入)
// 游戏准备就绪 (两名玩家都已加入)
socket.on('game_ready', () => {
    console.log('Game Ready!');

    // 关键修正：新游戏开始时，强制清理旧视图
    resetGameView();

    const localCanvas = document.getElementById('local-board');
    const remoteCanvas = document.getElementById('remote-board');

    // 清理旧的游戏实例 (防止重复绑定事件)
    if (appState.localGame) appState.localGame.gameOver = true;
    if (appState.remoteGame) appState.remoteGame.gameOver = true;

    // 初始化新游戏实例
    appState.localGame = new TetrisGame(localCanvas);
    appState.remoteGame = new TetrisGame(remoteCanvas, true); // 远程模式，只渲染

    // 绑定本地游戏回调

    // 1. 分数变动
    let lastSentScore = 0; // 记录上次发送攻击时的分数
    appState.localGame.onScore = (score) => {
        document.getElementById('local-score').textContent = score;
        socket.emit('game_action', { type: 'score', value: score });

        // 攻击逻辑: 每 200 分攻击一次
        const attackThreshold = 200;
        // 计算跨越了几个 200 分的门槛
        const attacks = Math.floor(score / attackThreshold) - Math.floor(lastSentScore / attackThreshold);

        if (attacks > 0) {
            socket.emit('game_action', { type: 'garbage', value: attacks });
        }
        lastSentScore = score;
    };

    // 2. 棋盘变动 (下落或消除后)
    appState.localGame.onBoardUpdate = (board) => {
        socket.emit('game_action', { type: 'board', value: board });
    };

    // 3. 下一个方块预览渲染
    const nextPieceCanvas = document.getElementById('next-piece');
    const nextPieceCtx = nextPieceCanvas.getContext('2d');

    appState.localGame.onNextPiece = (piece) => {
        // 安全检查：防止数据未准备好时渲染报错
        if (!piece || !nextPieceCanvas) return;

        // 清空预览画布
        nextPieceCtx.fillStyle = '#000';
        nextPieceCtx.fillRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);

        // 居中计算
        const blockSize = 25; // 预览界面方块稍小
        const offsetX = (nextPieceCanvas.width - piece[0].length * blockSize) / 2;
        const offsetY = (nextPieceCanvas.height - piece.length * blockSize) / 2;

        // 绘制下一个方块
        piece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0 && CONSTANTS && CONSTANTS.COLORS) {
                    nextPieceCtx.fillStyle = CONSTANTS.COLORS[value];
                    nextPieceCtx.fillRect(offsetX + x * blockSize, offsetY + y * blockSize, blockSize - 1, blockSize - 1);
                }
            });
        });
    };

    // 4. 行消除事件 (攻击判定已移至分数回调)
    appState.localGame.onLinesCleared = (lines) => {
        // 你可以在这里添加消除行的音效或特效
    };

    // 5. 游戏结束
    appState.localGame.onGameOver = () => {
        // 第一时间通知对手我输了
        socket.emit('game_action', { type: 'game_over' });
        showGameOver(false); // 显示失败弹窗
    };

    // 启动本地游戏循环
    appState.localGame.start();
});

// 处理游戏重置
socket.on('game_reset', () => {
    // 隐藏弹窗
    const modal = document.getElementById('game-over-modal');
    modal.classList.add('hidden');
    // 游戏区域的重置由 game_ready 触发 resetGameView 处理
});

// 处理接收到的游戏动作 (来自对手)
socket.on('game_action', (data) => {
    if (!appState.remoteGame) return;

    if (data.type === 'board') {
        appState.remoteGame.setBoardState(data.value);
    } else if (data.type === 'score') {
        document.getElementById('remote-score').textContent = data.value;
    } else if (data.type === 'game_over') {
        // 对手输了 -> 我赢了
        appState.localGame.gameOver = true; // 停止本地游戏
        showGameOver(true); // 显示胜利弹窗
    } else if (data.type === 'garbage') {
        // 收到垃圾行攻击
        appState.localGame.addGarbage(data.value);
    }
});

// --- 新增：视图重置与更新逻辑 ---
/**
 * 重置游戏视图（清空画布）
 * 在加入/离开房间、游戏重新开始时调用
 */
function resetGameView() {
    const localCanvas = document.getElementById('local-board');
    const remoteCanvas = document.getElementById('remote-board');
    const nextPieceCanvas = document.getElementById('next-piece');

    // 辅助清空函数
    const clear = (cvs) => {
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cvs.width, cvs.height);
    };

    if (localCanvas) clear(localCanvas);
    if (remoteCanvas) clear(remoteCanvas);
    if (nextPieceCanvas) {
        const ctx = nextPieceCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
    }

    // 重置分数显示
    document.getElementById('local-score').textContent = '0';
    document.getElementById('remote-score').textContent = '0';

    // 终止旧的游戏循环
    if (appState.localGame) appState.localGame.gameOver = true;
    if (appState.remoteGame) appState.remoteGame.gameOver = true;
}

// 监听玩家离开事件，重置对手画面
socket.on('player_left', () => {
    console.log('Opponent left');

    // 重置整个视图（包括分数、画布等）
    resetGameView();

    // 在对手画布上绘制“等待中”提示
    const remoteCanvas = document.getElementById('remote-board');
    if (remoteCanvas) {
        const ctx = remoteCanvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for player...', remoteCanvas.width / 2, remoteCanvas.height / 2);
    }

    // 提示
    const modal = document.getElementById('game-over-modal');
    modal.classList.add('hidden');
});


// --- 聊天与 UI 辅助逻辑 ---

const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMessages = document.getElementById('chat-messages');
const modal = document.getElementById('game-over-modal');
const playAgainBtn = document.getElementById('play-again-btn');

// 发送聊天消息
function sendChat() {
    const text = chatInput.value.trim();
    if (text) {
        socket.emit('chat_message', text);
        chatInput.value = '';
        chatInput.focus();
    }
}

chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

// 接收聊天消息
socket.on('chat_message', (msg) => {
    const div = document.createElement('div');
    if (msg.type === 'system') {
        div.className = 'chat-msg system';
        div.textContent = msg.text;
    } else {
        div.className = 'chat-msg user';
        div.innerHTML = `<span>${msg.username}:</span> ${msg.text}`;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight; // 自动滚动到底部
});

// 显示游戏结束弹窗
function showGameOver(isWin) {
    const title = document.getElementById('game-over-title');
    const desc = document.getElementById('game-over-desc');

    modal.classList.remove('hidden');

    if (isWin) {
        title.textContent = 'YOU WON!';
        title.style.color = '#0DFF72';
        desc.textContent = 'Congratulations! You defeated your opponent.';
    } else {
        title.textContent = 'GAME OVER';
        title.style.color = '#FF0D72';
        desc.textContent = 'Don\'t give up! Try again.';
    }
}

// 再玩一次按钮
playAgainBtn.addEventListener('click', () => {
    socket.emit('game_reset');
    // 手动隐藏防止重复点击，虽然 game_reset 回来也会隐藏
    modal.classList.add('hidden');
    resetGameView(); // 立即重置本地视图给用户反馈
});

// 键盘输入监听
document.addEventListener('keydown', (event) => {
    // 仅在游戏视图且游戏未结束时响应
    // 且不在输入框中时响应 (防止聊天时触发游戏逻辑)
    if (appState.currentView !== 'game' ||
        (appState.localGame && appState.localGame.gameOver) ||
        document.activeElement === chatInput) return;

    switch (event.code) {
        case 'ArrowLeft':
            if (appState.localGame) appState.localGame.move(-1);
            break;
        case 'ArrowRight':
            if (appState.localGame) appState.localGame.move(1);
            break;
        case 'ArrowDown':
            if (appState.localGame) appState.localGame.drop(); // 软下落 (加速)
            break;
        case 'ArrowUp':
            if (appState.localGame) appState.localGame.rotate(1); // 旋转
            break;
        case 'Space':
            if (appState.localGame) appState.localGame.hardDrop(); // 硬下落 (瞬间到底)
            break;
    }
});

socket.on('room_error', (msg) => {
    alert(msg);
});
