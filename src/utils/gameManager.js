/**
 * gameManager.js - 游戏实例管理模块
 * 
 * 提取三个游戏模式中重复的游戏初始化和管理逻辑
 */

import { TetrisGame } from '../game/tetris.js';
import { renderNextPieces, getNextPieceCanvases } from './renderUtils.js';

/**
 * 清理游戏实例
 * @param {TetrisGame|null} game - 游戏实例
 */
export function cleanupGame(game) {
    if (game) {
        game.gameOver = true;
        if (game.soundManager) {
            game.soundManager.stopBGM();
        }
    }
}

/**
 * 创建并初始化游戏实例
 * @param {HTMLCanvasElement} canvas - 游戏画布
 * @param {number} seed - 随机种子
 * @param {Object} callbacks - 回调函数配置
 * @param {Function} callbacks.onScore - 分数变化回调
 * @param {Function} callbacks.onBoardUpdate - 棋盘更新回调
 * @param {Function} callbacks.onGameOver - 游戏结束回调
 * @param {boolean} callbacks.enableNextPiecesPreview - 是否启用5方块预览
 * @param {boolean} callbacks.playBGM - 是否播放背景音乐
 * @returns {TetrisGame} 游戏实例
 */
export function createGame(canvas, seed, callbacks = {}) {
    const game = new TetrisGame(canvas, false, seed);

    // 绑定分数回调
    if (callbacks.onScore) {
        game.onScore = callbacks.onScore;
    }

    // 绑定棋盘更新回调
    if (callbacks.onBoardUpdate) {
        game.onBoardUpdate = callbacks.onBoardUpdate;
    }

    // 绑定游戏结束回调
    if (callbacks.onGameOver) {
        game.onGameOver = callbacks.onGameOver;
    }

    // 绑定5方块预览渲染
    if (callbacks.enableNextPiecesPreview !== false) {
        const canvases = getNextPieceCanvases();
        game.onNextPieces = (pieces) => renderNextPieces(canvases, pieces);
    }

    // 播放背景音乐
    if (callbacks.playBGM !== false) {
        game.soundManager.playBGM();
    }

    return game;
}

/**
 * 创建带攻击逻辑的分数回调
 * @param {Function} updateScoreUI - 更新分数UI的函数
 * @param {Function} emitAction - 发送游戏动作的函数
 * @param {number} attackThreshold - 攻击阈值（默认200分）
 * @returns {Function} 分数回调函数
 */
export function createScoreCallback(updateScoreUI, emitAction, attackThreshold = 200) {
    let lastSentScore = 0;

    return (score) => {
        // 更新UI
        updateScoreUI(score);

        // 发送分数到服务器
        if (emitAction) {
            emitAction({ type: 'score', value: score });
        }

        // 攻击逻辑
        if (emitAction && attackThreshold > 0) {
            const attacks = Math.floor(score / attackThreshold) - Math.floor(lastSentScore / attackThreshold);
            if (attacks > 0) {
                emitAction({ type: 'garbage', value: attacks });
            }
        }

        lastSentScore = score;
    };
}
