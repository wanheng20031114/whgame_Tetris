/**
 * renderUtils.js - 公共渲染工具模块
 * 
 * 提取三个游戏模式中重复的渲染逻辑
 */

import { CONSTANTS } from '../game/tetris.js';

/**
 * 渲染5个预览方块到画布数组
 * @param {HTMLCanvasElement[]} canvases - 5个预览画布
 * @param {Array[]} pieces - 5个方块矩阵数组
 */
export function renderNextPieces(canvases, pieces) {
    if (!canvases || !pieces || pieces.length === 0) return;

    canvases.forEach((canvas, index) => {
        if (!canvas || index >= pieces.length) return;

        const ctx = canvas.getContext('2d');
        const piece = pieces[index];

        // 清空画布
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!piece) return;

        // 第一个方块较大，后面的较小
        const blockSize = index === 0 ? 18 : 12;
        const offsetX = (canvas.width - piece[0].length * blockSize) / 2;
        const offsetY = (canvas.height - piece.length * blockSize) / 2;

        // 绘制方块
        piece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0 && CONSTANTS && CONSTANTS.COLORS) {
                    ctx.fillStyle = CONSTANTS.COLORS[value];
                    ctx.fillRect(
                        offsetX + x * blockSize,
                        offsetY + y * blockSize,
                        blockSize - 1,
                        blockSize - 1
                    );
                }
            });
        });
    });
}

/**
 * 渲染排行榜到列表元素
 * @param {HTMLElement} listEl - ol/ul 列表元素
 * @param {Array} leaderboard - 排行榜数据 [{username, score}, ...]
 * @param {string|null} currentUsername - 当前用户名（用于高亮）
 * @param {number} maxItems - 最大显示条数
 */
export function renderLeaderboard(listEl, leaderboard, currentUsername = null, maxItems = 10) {
    if (!listEl) return;

    if (!leaderboard || leaderboard.length === 0) {
        listEl.innerHTML = '<li class="empty">暂无记录</li>';
        return;
    }

    listEl.innerHTML = leaderboard.slice(0, maxItems).map((entry, index) => {
        const rank = index + 1;
        const isCurrentUser = currentUsername && entry.username === currentUsername;
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

/**
 * 获取5个预览画布元素
 * @returns {HTMLCanvasElement[]}
 */
export function getNextPieceCanvases() {
    return [
        document.getElementById('next-piece-0'),
        document.getElementById('next-piece-1'),
        document.getElementById('next-piece-2'),
        document.getElementById('next-piece-3'),
        document.getElementById('next-piece-4')
    ];
}
