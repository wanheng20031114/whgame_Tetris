
const { v4: uuidv4 } = require('uuid');

// 内存中的房间存储
// 房间结构示例: 
// { 
//   id: string, 
//   players: { [socketId]: { userId, username } }, 
//   status: 'waiting' | 'playing' 
// }
const rooms = new Map();

// 在线用户列表
// Key: socket.id
// Value: { userId, username, ready: boolean, roomId: string|null }
const connectedUsers = new Map();

/**
 * 广播在线用户列表给所有客户端
 * @param {Server} io
 */
function broadcastUserList(io) {
    const userList = Array.from(connectedUsers.values());
    io.emit('online_users', userList);
}

/**
 * Socket.IO 事件处理器模块
 * @param {Server} io - Socket.IO 服务器实例
 * @param {Database} db - 数据库实例
 */
module.exports = (io, db) => {
    io.on('connection', (socket) => {
        // 用户连接时，尝试从握手认证数据中获取用户信息
        // 前端需在建立连接时设置 socket.auth = { userId, username }
        const { userId, username } = socket.handshake.auth;

        if (!userId) {
            console.log('Unauthenticated connection');
            return;
        }

        console.log(`User connected: ${username} (${userId})`);

        // 自动加入 'lobby' 频道，方便广播大厅信息
        socket.join('lobby');

        // 记录在线用户
        connectedUsers.set(socket.id, { userId, username });
        broadcastUserList(io);

        // 向新连接的用户发送当前的房间列表
        socket.emit('room_list', Array.from(rooms.values()));

        /**
         * 创建房间事件
         * 用户点击“创建房间”时触发
         */
        socket.on('create_room', () => {
            const roomId = uuidv4().slice(0, 6); // 生成短 ID
            const room = {
                id: roomId,
                players: { [socket.id]: { userId, username } }, // 初始包含创建者
                status: 'waiting'
            };

            // 存储房间
            rooms.set(roomId, room);

            // 离开大厅频道，加入新房间频道
            socket.leave('lobby');
            socket.join(roomId);

            // 通知客户端房间创建成功，跳转游戏视图
            socket.emit('room_created', roomId);
            // 广播更新后的大厅房间列表
            io.to('lobby').emit('room_list', Array.from(rooms.values()));
        });

        /**
         * 加入房间事件
         * @param {string} roomId - 目标房间 ID
         */
        socket.on('join_room', (roomId) => {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('room_error', 'Room not found');
                return;
            }

            if (Object.keys(room.players).length >= 2) {
                socket.emit('room_error', 'Room is full');
                return;
            }

            if (room.status !== 'waiting') {
                socket.emit('room_error', 'Game already started');
                return;
            }

            // 添加玩家到房间数据结构
            room.players[socket.id] = { userId, username };

            // socket 操作
            socket.leave('lobby');
            socket.join(roomId);

            // 通知加入者本人跳转
            socket.emit('room_joined', roomId);

            // 通知房间内所有玩家（包括房主）有新玩家加入
            io.to(roomId).emit('player_joined', { userId, username });

            // 如果满员（2人），触发游戏准备/开始
            if (Object.keys(room.players).length === 2) {
                // 生成一个随机种子，确保双方方块序列一致
                const seed = Math.floor(Math.random() * 2147483647);
                io.to(roomId).emit('game_ready', { seed });
            }

            // 更新大厅列表（人数变化）
            io.to('lobby').emit('room_list', Array.from(rooms.values()));
        });

        /**
         * 离开房间事件
         * 用户主动点击离开或退出
         */
        socket.on('leave_room', () => {
            handleLeave(socket, io);
        });

        /**
         * 断开连接事件
         * 用户关闭浏览器或网络中断
         */
        socket.on('disconnect', () => {
            // 移除在线用户
            connectedUsers.delete(socket.id);
            broadcastUserList(io);

            handleLeave(socket, io);
        });

        /**
         * 游戏动作转发事件
         * 负责转发棋盘更新、分数、垃圾行攻击、游戏结束等信号
         * @param {Object} data - 游戏数据 { type: 'board'|'score'|'garbage'|'game_over', value: ... }
         */
        socket.on('game_action', (data) => {
            // 寻找包含当前 socket 的房间
            for (const [roomId, room] of rooms) {
                if (room.players[socket.id]) {
                    // 将数据广播给房间内的其他人（排除自己）
                    socket.to(roomId).emit('game_action', data);

                    // 获胜积分逻辑：
                    // 如果收到 'game_over'，无论发送者是谁，通常意味着发送者输了（触顶）。
                    // 因此，房间里的另一个玩家是赢家。
                    if (data.type === 'game_over') {
                        // 找到 ID 不等于当前发送者 ID 的玩家作为赢家
                        const winnerId = Object.keys(room.players).find(id => id !== socket.id);
                        if (winnerId) {
                            const winnerUser = room.players[winnerId];

                            // 1. 更新数据库总分
                            try {
                                const stmt = db.prepare('UPDATE users SET score = score + 100 WHERE id = ?');
                                stmt.run(winnerUser.userId);
                                console.log(`Updated score for winner: ${winnerUser.username}`);
                            } catch (err) {
                                console.error('Score update failed:', err);
                            }

                            // 2. 更新房间内战绩 (Session Score)
                            if (!room.scores) room.scores = {};
                            if (!room.scores[winnerId]) room.scores[winnerId] = 0;
                            room.scores[winnerId]++;

                            // 格式化比分文本
                            const p1Id = Object.keys(room.players)[0];
                            const p2Id = Object.keys(room.players)[1];
                            const scoreText = `${room.players[p1Id].username}: ${room.scores[p1Id] || 0}  vs  ${room.players[p2Id].username}: ${room.scores[p2Id] || 0}`;

                            // 广播系统消息到聊天室
                            io.to(roomId).emit('chat_message', {
                                type: 'system',
                                text: `🏆 ${winnerUser.username} 获胜! 当前战绩: [ ${scoreText} ]`
                            });
                        }
                    }
                    break;
                }
            }
        });

        // 聊天消息事件
        socket.on('chat_message', (text) => {
            const { username } = socket.handshake.auth;
            for (const [roomId, room] of rooms) {
                if (room.players[socket.id]) {
                    // 广播给房间所有人 (包括自己，这样前端处理简单统一)
                    io.to(roomId).emit('chat_message', {
                        type: 'user',
                        username: username,
                        text: text
                    });
                    break;
                }
            }
        });

        /**
         * 游戏重置事件
         * 玩家请求重新开始游戏
         */
        socket.on('game_reset', () => {
            for (const [roomId, room] of rooms) {
                if (room.players[socket.id]) {
                    room.status = 'playing'; // 重置状态
                    // 通知双方重置
                    io.to(roomId).emit('game_reset');
                    // 立即开始新的一局
                    const seed = Math.floor(Math.random() * 2147483647);
                    io.to(roomId).emit('game_ready', { seed });

                    // 可选：发送系统消息
                    io.to(roomId).emit('chat_message', { type: 'system', text: '🔄 游戏已重置，新的一局开始！' });
                    break;
                }
            }
        });
    });
};

/**
 * 处理用户离开逻辑（封装复用）
 * @param {Socket} socket 
 * @param {Server} io 
 */
function handleLeave(socket, io) {
    for (const [roomId, room] of rooms) {
        if (room.players[socket.id]) {
            const username = room.players[socket.id].username;
            // 从房间移除玩家
            delete room.players[socket.id];
            socket.leave(roomId);
            socket.join('lobby'); // 重新加入大厅

            // 如果房间空了，删除房间
            if (Object.keys(room.players).length === 0) {
                rooms.delete(roomId);
            } else {
                // 如果还有人，房间状态重置为等待中，允许新人加入
                room.status = 'waiting';
                // 可选：重置当前战绩，因为是新对局
                room.scores = {};

                // 通知剩余玩家对方离开了
                io.to(roomId).emit('player_left');
                // 发送离开消息给剩余玩家
                io.to(roomId).emit('chat_message', { type: 'system', text: `🚪 ${username} 离开了房间` });
            }

            // 广播新的房间列表状态
            io.to('lobby').emit('room_list', Array.from(rooms.values()));
            break;
        }
    }
}
