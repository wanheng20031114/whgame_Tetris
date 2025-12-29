/**
 * socketMulti.js - 3-21人多人俄罗斯方块模式 Socket 处理模块
 * 
 * 负责处理多人房间的创建、加入、游戏同步等事件
 */

const { v4: uuidv4 } = require('uuid');

// 多人房间存储
// 房间结构: {
//   id: string,
//   hostSocketId: string,         // 房主的 socket ID
//   maxPlayers: number,           // 最大人数 (3-21)
//   players: {
//     [socketId]: {
//       userId, username,
//       score: number,            // 当前分数
//       alive: boolean,           // 是否存活
//       rank: number | null,      // 淘汰名次 (null=存活, 越小越好, 1=冠军)
//       board: Array              // 棋盘状态
//     }
//   },
//   status: 'waiting' | 'playing' | 'finished',
//   alivePlayers: number,         // 存活玩家数
//   seed: number                  // 随机种子
// }
const multiRooms = new Map();

/**
 * 选择攻击目标
 * 70% 纯随机，30% 分数加权随机
 * @param {Object} room - 房间对象
 * @param {string} attackerSocketId - 攻击者的 socket ID
 * @returns {string|null} 被攻击者的 socket ID，无可攻击目标时返回 null
 */
function selectAttackTarget(room, attackerSocketId) {
    const targets = Object.entries(room.players)
        .filter(([id, p]) => id !== attackerSocketId && p.alive);

    if (targets.length === 0) return null;

    if (Math.random() < 0.7) {
        // 70% 纯随机
        return targets[Math.floor(Math.random() * targets.length)][0];
    } else {
        // 30% 分数加权随机 (分数高被攻击概率大)
        const totalScore = targets.reduce((sum, [_, p]) => sum + p.score + 1, 0);
        let rand = Math.random() * totalScore;
        for (const [id, p] of targets) {
            rand -= (p.score + 1);
            if (rand <= 0) return id;
        }
        return targets[targets.length - 1][0];
    }
}

/**
 * 广播多人房间列表给大厅玩家
 * @param {Server} io
 */
function broadcastMultiRoomList(io) {
    const roomList = Array.from(multiRooms.values()).map(room => ({
        id: room.id,
        type: 'multi',
        maxPlayers: room.maxPlayers,
        playerCount: Object.keys(room.players).length,
        status: room.status,
        hostName: room.players[room.hostSocketId]?.username || 'Unknown'
    }));
    io.to('lobby').emit('multi_room_list', roomList);
}

/**
 * 处理多人模式玩家离开逻辑
 * @param {Socket} socket 
 * @param {Server} io 
 */
function handleMultiLeave(socket, io) {
    for (const [roomId, room] of multiRooms) {
        if (room.players[socket.id]) {
            const player = room.players[socket.id];
            const username = player.username;
            const wasAlive = player.alive;

            // 如果游戏进行中且玩家还活着，判定为失败
            if (room.status === 'playing' && wasAlive) {
                // 给该玩家分配当前最差名次
                player.alive = false;
                player.rank = room.alivePlayers;
                room.alivePlayers--;

                // 通知房间内其他玩家该玩家已退出/失败
                socket.to(roomId).emit('multi_player_eliminated', {
                    socketId: socket.id,
                    username: username,
                    rank: player.rank,
                    reason: 'left'
                });

                // 检查游戏是否结束
                checkGameEnd(room, io, roomId);
            }

            // 从房间移除玩家
            delete room.players[socket.id];
            socket.leave(roomId);
            socket.join('lobby');

            // 如果房间空了，删除房间
            if (Object.keys(room.players).length === 0) {
                multiRooms.delete(roomId);
            } else {
                // 如果房主离开，转移房主
                if (room.hostSocketId === socket.id) {
                    const newHostId = Object.keys(room.players)[0];
                    room.hostSocketId = newHostId;
                    io.to(roomId).emit('multi_host_changed', {
                        newHostId: newHostId,
                        newHostName: room.players[newHostId].username
                    });
                }

                // 如果游戏还未开始，通知房间更新玩家列表
                if (room.status === 'waiting') {
                    io.to(roomId).emit('multi_player_list', getPlayerList(room));
                }

                // 发送系统消息
                io.to(roomId).emit('chat_message', {
                    type: 'system',
                    text: `🚪 ${username} 离开了房间`
                });
            }

            // 广播更新的房间列表
            broadcastMultiRoomList(io);
            break;
        }
    }
}

/**
 * 获取房间玩家列表（用于UI显示）
 */
function getPlayerList(room) {
    return Object.entries(room.players).map(([socketId, player]) => ({
        socketId,
        username: player.username,
        score: player.score,
        alive: player.alive,
        rank: player.rank,
        isHost: socketId === room.hostSocketId
    }));
}

/**
 * 检查游戏是否结束
 */
function checkGameEnd(room, io, roomId) {
    if (room.alivePlayers <= 1 && room.status === 'playing') {
        room.status = 'finished';

        // 找到最后存活的玩家，授予第1名
        for (const [socketId, player] of Object.entries(room.players)) {
            if (player.alive) {
                player.alive = false;
                player.rank = 1;
                break;
            }
        }

        // 生成最终排名
        const rankings = Object.entries(room.players)
            .map(([socketId, p]) => ({
                socketId,
                username: p.username,
                rank: p.rank,
                score: p.score
            }))
            .sort((a, b) => a.rank - b.rank);

        // 广播游戏结束
        io.to(roomId).emit('multi_game_finished', { rankings });

        // 发送排名系统消息
        const rankText = rankings.map(r => `#${r.rank} ${r.username}`).join(' | ');
        io.to(roomId).emit('chat_message', {
            type: 'system',
            text: `🏆 游戏结束！最终排名: ${rankText}`
        });
    }
}

/**
 * Socket.IO 多人模式事件处理器
 * @param {Server} io - Socket.IO 服务器实例
 * @param {Database} db - 数据库实例
 */
module.exports = (io, db) => {
    io.on('connection', (socket) => {
        const { userId, username } = socket.handshake.auth;
        if (!userId) return; // 未认证用户直接忽略

        // 发送当前多人房间列表
        socket.emit('multi_room_list', Array.from(multiRooms.values()).map(room => ({
            id: room.id,
            type: 'multi',
            maxPlayers: room.maxPlayers,
            playerCount: Object.keys(room.players).length,
            status: room.status,
            hostName: room.players[room.hostSocketId]?.username || 'Unknown'
        })));

        /**
         * 创建多人房间
         * @param {number} maxPlayers - 最大玩家数 (3-21)
         */
        socket.on('create_multi_room', (maxPlayers) => {
            // 验证人数范围
            const players = Math.min(21, Math.max(3, parseInt(maxPlayers) || 3));

            const roomId = 'M' + uuidv4().slice(0, 5).toUpperCase(); // M前缀区分多人房间
            const room = {
                id: roomId,
                hostSocketId: socket.id,
                maxPlayers: players,
                players: {
                    [socket.id]: {
                        userId,
                        username,
                        score: 0,
                        alive: true,
                        rank: null,
                        board: null
                    }
                },
                status: 'waiting',
                alivePlayers: 1,
                seed: null
            };

            multiRooms.set(roomId, room);

            socket.leave('lobby');
            socket.join(roomId);

            socket.emit('multi_room_created', {
                roomId,
                maxPlayers: players,
                isHost: true
            });

            broadcastMultiRoomList(io);
        });

        /**
         * 加入多人房间
         */
        socket.on('join_multi_room', (roomId) => {
            const room = multiRooms.get(roomId);
            if (!room) {
                socket.emit('room_error', '房间不存在');
                return;
            }

            if (Object.keys(room.players).length >= room.maxPlayers) {
                socket.emit('room_error', '房间已满');
                return;
            }

            if (room.status !== 'waiting') {
                socket.emit('room_error', '游戏已开始');
                return;
            }

            // 添加玩家
            room.players[socket.id] = {
                userId,
                username,
                score: 0,
                alive: true,
                rank: null,
                board: null
            };
            room.alivePlayers++;

            socket.leave('lobby');
            socket.join(roomId);

            socket.emit('multi_room_joined', {
                roomId,
                maxPlayers: room.maxPlayers,
                isHost: false,
                hostName: room.players[room.hostSocketId].username
            });

            // 通知房间所有人新玩家加入
            io.to(roomId).emit('multi_player_list', getPlayerList(room));
            io.to(roomId).emit('chat_message', {
                type: 'system',
                text: `👋 ${username} 加入了房间`
            });

            broadcastMultiRoomList(io);
        });

        /**
         * 房主开始游戏
         */
        socket.on('start_multi_game', () => {
            for (const [roomId, room] of multiRooms) {
                if (room.players[socket.id] && room.hostSocketId === socket.id) {
                    if (room.status !== 'waiting') {
                        socket.emit('room_error', '游戏已在进行中');
                        return;
                    }

                    const playerCount = Object.keys(room.players).length;
                    if (playerCount < 2) {
                        socket.emit('room_error', '至少需要2名玩家才能开始');
                        return;
                    }

                    // 设置游戏状态
                    room.status = 'playing';
                    room.alivePlayers = playerCount;
                    room.seed = Math.floor(Math.random() * 2147483647);

                    // 重置所有玩家状态
                    for (const player of Object.values(room.players)) {
                        player.score = 0;
                        player.alive = true;
                        player.rank = null;
                        player.board = null;
                    }

                    // 通知所有玩家游戏开始
                    io.to(roomId).emit('multi_game_ready', {
                        seed: room.seed,
                        players: getPlayerList(room)
                    });

                    io.to(roomId).emit('chat_message', {
                        type: 'system',
                        text: '🎮 游戏开始！'
                    });

                    broadcastMultiRoomList(io);
                    break;
                }
            }
        });

        /**
         * 多人游戏动作转发
         * 包括：board(棋盘), score(分数), garbage(攻击), game_over(失败)
         */
        socket.on('multi_game_action', (data) => {
            for (const [roomId, room] of multiRooms) {
                if (room.players[socket.id]) {
                    const player = room.players[socket.id];

                    if (data.type === 'board') {
                        // 更新棋盘状态并广播给其他人
                        player.board = data.value;
                        socket.to(roomId).emit('multi_game_action', {
                            socketId: socket.id,
                            type: 'board',
                            value: data.value
                        });

                    } else if (data.type === 'score') {
                        // 更新分数并广播
                        player.score = data.value;
                        socket.to(roomId).emit('multi_game_action', {
                            socketId: socket.id,
                            type: 'score',
                            value: data.value
                        });

                    } else if (data.type === 'garbage') {
                        // 选择攻击目标并发送垃圾行
                        const targetId = selectAttackTarget(room, socket.id);
                        if (targetId) {
                            io.to(targetId).emit('multi_receive_garbage', {
                                fromSocketId: socket.id,
                                fromUsername: player.username,
                                lines: data.value
                            });

                            // 广播攻击事件（用于UI显示）
                            io.to(roomId).emit('multi_attack_event', {
                                from: player.username,
                                to: room.players[targetId].username,
                                lines: data.value
                            });
                        }

                    } else if (data.type === 'game_over') {
                        // 玩家失败
                        if (player.alive) {
                            player.alive = false;
                            player.rank = room.alivePlayers;
                            room.alivePlayers--;

                            // 广播玩家淘汰
                            io.to(roomId).emit('multi_player_eliminated', {
                                socketId: socket.id,
                                username: player.username,
                                rank: player.rank,
                                reason: 'game_over'
                            });

                            // 检查游戏是否结束
                            checkGameEnd(room, io, roomId);
                        }
                    }
                    break;
                }
            }
        });

        /**
         * 离开多人房间
         */
        socket.on('leave_multi_room', () => {
            handleMultiLeave(socket, io);
        });

        /**
         * 多人房间聊天
         */
        socket.on('multi_chat_message', (text) => {
            for (const [roomId, room] of multiRooms) {
                if (room.players[socket.id]) {
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
         * 重新开始多人游戏（任何玩家都可发起）
         */
        socket.on('restart_multi_game', () => {
            for (const [roomId, room] of multiRooms) {
                if (room.players[socket.id]) {
                    if (room.status !== 'finished') {
                        socket.emit('room_error', '只能在游戏结束后重新开始');
                        return;
                    }

                    // 重置房间状态
                    room.status = 'waiting';
                    room.seed = null;
                    room.alivePlayers = Object.keys(room.players).length;

                    for (const player of Object.values(room.players)) {
                        player.score = 0;
                        player.alive = true;
                        player.rank = null;
                        player.board = null;
                    }

                    const requesterName = room.players[socket.id].username;
                    io.to(roomId).emit('multi_game_reset');
                    io.to(roomId).emit('multi_player_list', getPlayerList(room));
                    io.to(roomId).emit('chat_message', {
                        type: 'system',
                        text: `🔄 ${requesterName} 请求重新开始，游戏已重置`
                    });

                    broadcastMultiRoomList(io);
                    break;
                }
            }
        });

        /**
         * 断开连接处理
         */
        socket.on('disconnect', () => {
            handleMultiLeave(socket, io);
        });
    });
};
