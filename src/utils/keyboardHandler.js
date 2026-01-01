/**
 * keyboardHandler.js - 统一键盘控制处理模块
 * 
 * 提取三个游戏模式中重复的键盘控制逻辑
 */

/**
 * 创建键盘事件处理器
 * @param {Function} getGame - 获取当前游戏实例的函数
 * @param {Object} options - 配置选项
 * @param {Function} options.shouldIgnore - 自定义判断是否忽略输入的函数
 * @returns {Function} keydown 事件处理函数
 */
export function createKeyboardHandler(getGame, options = {}) {
    return (event) => {
        const game = getGame();

        // 如果游戏未开始或已结束，忽略输入
        if (!game || game.gameOver) return;

        // 自定义忽略逻辑（如检查是否在输入框中）
        if (options.shouldIgnore && options.shouldIgnore(event)) return;

        switch (event.code) {
            case 'KeyA':
            case 'ArrowLeft':
                game.move(-1);
                break;
            case 'KeyD':
            case 'ArrowRight':
                game.move(1);
                break;
            case 'KeyS':
            case 'ArrowDown':
                game.drop();
                break;
            case 'KeyW':
            case 'ArrowUp':
                game.rotate(1);
                break;
            case 'Space':
                game.hardDrop();
                break;
        }
    };
}

/**
 * 检查是否在输入框中（用于聊天时禁用游戏控制）
 * @param {string} inputId - 输入框的 ID
 * @returns {Function} 判断函数
 */
export function createInputChecker(inputId) {
    return () => {
        const inputEl = document.getElementById(inputId);
        return inputEl && document.activeElement === inputEl;
    };
}
