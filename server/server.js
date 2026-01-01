const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const db = require('./db'); // 导入数据库模块

// 初始化 Express 应用
const app = express();
// 创建 HTTP 服务器，将 Express 应用作为处理器
const server = createServer(app);

// 初始化 Socket.IO 服务器
// 配置 CORS 以允许前端开发服务器跨域连接
const io = new Server(server, {
    cors: {
        origin: "*", // 允许所有来源 (方便开发，生产环境应限制)
        methods: ["GET", "POST"]
    }
});

// 中间件配置
app.use(cors()); // 启用跨域资源共享
app.use(express.json()); // 解析 JSON 格式的请求体

// 静态文件服务
// 注意：在生产环境中通常会取消注释以下行，用于托管没构建好的前端文件
// app.use(express.static(path.join(__dirname, '../dist')));

// --- API 路由定义 ---

/**
 * 注册接口
 * POST /api/register
 * 接收: { username, password }
 */
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    try {
        // 使用预编译语句插入新用户，防止 SQL 注入
        const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
        const info = stmt.run(username, password);
        // 返回成功响应及新用户的 ID
        res.json({ success: true, userId: info.lastInsertRowid });
    } catch (err) {
        // 处理唯一约束冲突 (用户名已存在)
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ error: 'Username already exists' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

/**
 * 登录接口
 * POST /api/login
 * 接收: { username, password }
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // 查询匹配的用户名和密码
    const stmt = db.prepare('SELECT id, username FROM users WHERE username = ? AND password = ?');
    const user = stmt.get(username, password);

    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

/**
 * 保存单人模式分数
 * POST /api/score
 * 接收: { userId, score }
 */
app.post('/api/score', (req, res) => {
    const { userId, score } = req.body;

    if (!userId || score === undefined) {
        return res.status(400).json({ error: 'Missing userId or score' });
    }

    try {
        // 获取用户当前最高分
        const currentUser = db.prepare('SELECT score FROM users WHERE id = ?').get(userId);

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 如果新分数更高，更新最高分
        if (score > (currentUser.score || 0)) {
            db.prepare('UPDATE users SET score = ? WHERE id = ?').run(score, userId);
            res.json({ success: true, newHighScore: true, score });
        } else {
            res.json({ success: true, newHighScore: false, highScore: currentUser.score });
        }
    } catch (err) {
        console.error('保存分数错误:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 获取排行榜
 * GET /api/leaderboard
 * 返回前20名玩家
 */
app.get('/api/leaderboard', (req, res) => {
    try {
        const leaderboard = db.prepare(`
            SELECT username, score 
            FROM users 
            WHERE score > 0 
            ORDER BY score DESC 
            LIMIT 20
        `).all();

        res.json({ success: true, leaderboard });
    } catch (err) {
        console.error('获取排行榜错误:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Socket.IO 逻辑集成 ---
const socketHandler = require('./socket');
// 将 socket 处理逻辑分拆到 socket.js 中，并传入 io 和 db 实例
socketHandler(io, db);

// 多人模式 Socket 处理器 (3-21人)
const socketMultiHandler = require('./socketMulti');
socketMultiHandler(io, db);

// 启动服务器
const PORT = 3000;
// 监听 0.0.0.0 以允许局域网访问
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});
