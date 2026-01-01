/**
 * roomManager.js - 房间管理公共模块
 * 
 * 提取双人和多人模式中重复的房间管理逻辑
 */

/**
 * 房间管理器基类
 */
class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    /**
     * 查找玩家所在的房间
     * @param {string} socketId - 玩家的 socket ID
     * @returns {{roomId: string, room: Object}|null}
     */
    findPlayerRoom(socketId) {
        for (const [roomId, room] of this.rooms) {
            if (room.players[socketId]) {
                return { roomId, room };
            }
        }
        return null;
    }

    /**
     * 获取房间
     * @param {string} roomId
     * @returns {Object|undefined}
     */
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    /**
     * 创建房间
     * @param {string} roomId
     * @param {Object} roomData
     */
    createRoom(roomId, roomData) {
        this.rooms.set(roomId, roomData);
    }

    /**
     * 删除房间
     * @param {string} roomId
     */
    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }

    /**
     * 获取所有房间列表
     * @returns {Array}
     */
    getAllRooms() {
        return Array.from(this.rooms.values());
    }

    /**
     * 添加玩家到房间
     * @param {string} roomId
     * @param {string} socketId
     * @param {Object} playerData
     * @returns {boolean}
     */
    addPlayer(roomId, socketId, playerData) {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        room.players[socketId] = playerData;
        return true;
    }

    /**
     * 从房间移除玩家
     * @param {string} roomId
     * @param {string} socketId
     * @returns {Object|null} 被移除的玩家数据
     */
    removePlayer(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room || !room.players[socketId]) return null;

        const player = room.players[socketId];
        delete room.players[socketId];
        return player;
    }

    /**
     * 获取房间玩家数量
     * @param {string} roomId
     * @returns {number}
     */
    getPlayerCount(roomId) {
        const room = this.rooms.get(roomId);
        return room ? Object.keys(room.players).length : 0;
    }

    /**
     * 检查房间是否为空
     * @param {string} roomId
     * @returns {boolean}
     */
    isRoomEmpty(roomId) {
        return this.getPlayerCount(roomId) === 0;
    }
}

/**
 * 广播系统消息到房间
 * @param {Server} io - Socket.IO 服务器实例
 * @param {string} roomId - 房间ID
 * @param {string} text - 消息内容
 */
function broadcastSystemMessage(io, roomId, text) {
    io.to(roomId).emit('chat_message', {
        type: 'system',
        text: text
    });
}

/**
 * 广播用户消息到房间
 * @param {Server} io - Socket.IO 服务器实例
 * @param {string} roomId - 房间ID
 * @param {string} username - 用户名
 * @param {string} text - 消息内容
 */
function broadcastUserMessage(io, roomId, username, text) {
    io.to(roomId).emit('chat_message', {
        type: 'user',
        username: username,
        text: text
    });
}

module.exports = {
    RoomManager,
    broadcastSystemMessage,
    broadcastUserMessage
};
