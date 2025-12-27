
// 游戏常量定义
export const CONSTANTS = {
    COLS: 10,        // 棋盘列数
    ROWS: 20,        // 棋盘行数
    BLOCK_SIZE: 30,  // 方块像素大小
    // 方块颜色映射 (索引 1-7 对应7种方块，8为垃圾行)
    COLORS: [
        null,
        '#FF0D72', // T - 紫红
        '#0DC2FF', // O - 青色
        '#0DFF72', // S - 绿色
        '#F538FF', // Z - 紫色
        '#FF8E0D', // I - 橙色
        '#FFE138', // J - 黄色
        '#3877FF', // L - 蓝色
        '#808080', // Garbage - 灰色
    ]
};

// 7种俄罗斯方块的形状矩阵定义
const PIECES = [
    [ // T 形
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
    ],
    [ // O 形 (田字)
        [2, 2],
        [2, 2],
    ],
    [ // S 形
        [0, 3, 3],
        [3, 3, 0],
        [0, 0, 0],
    ],
    [ // Z 形
        [4, 4, 0],
        [0, 4, 4],
        [0, 0, 0],
    ],
    [ // I 形 (长条)
        [0, 5, 0, 0],
        [0, 5, 0, 0],
        [0, 5, 0, 0],
        [0, 5, 0, 0],
    ],
    [ // J 形
        [0, 6, 0],
        [0, 6, 0],
        [6, 6, 0],
    ],
    [ // L 形
        [0, 7, 0],
        [0, 7, 0],
        [0, 7, 7],
    ]
];

/**
 * 俄罗斯方块核心游戏类
 */
export class TetrisGame {
    /**
     * @param {HTMLCanvasElement} canvas - 游戏画布元素
     * @param {boolean} isRemote - 是否为远程玩家（镜像模式），如果是则不处理输入和掉落循环
     */
    constructor(canvas, isRemote = false) {
        this.ctx = canvas.getContext('2d');
        this.canvas = canvas;
        this.isRemote = isRemote;

        this.board = this.createBoard();
        this.score = 0;
        this.gameOver = false;

        // 当前控制的方块
        this.piece = null;
        this.nextPiece = null; // 下一个方块预览
        this.pos = { x: 0, y: 0 }; // 方块坐标

        // 时间控制（用于下落动画）
        this.dropCounter = 0;
        this.dropInterval = 1000; // 初始下落间隔 (毫秒)
        this.lastTime = 0;

        // 事件回调函数
        this.onGameOver = null;
        this.onScore = null;
        this.onBoardUpdate = null; // 用于同步棋盘状态到服务器
        this.onNextPiece = null;   // 用于通知UI更新下一个方块预览
        this.onLinesCleared = null; // 消除行回调
    }

    /**
     * 创建空的棋盘矩阵 (20行 x 10列)
     */
    createBoard() {
        return Array.from({ length: CONSTANTS.ROWS }, () => Array(CONSTANTS.COLS).fill(0));
    }

    /**
     * 启动游戏
     */
    start() {
        if (this.isRemote) return; // 远程游戏不需要本地循环驱动
        this.reset();
        this.loop();
    }

    /**
     * 重置游戏状态
     */
    reset() {
        this.board = this.createBoard();
        this.score = 0;
        this.gameOver = false;
        this.dropInterval = 1000;
        this.dropCounter = 0;

        // 初始化方块
        this.nextPiece = this.randomPiece();
        this.piece = this.randomPiece();
        this.pos = { x: 3, y: 0 }; // 初始位置居中

        if (this.onScore) this.onScore(0);
        if (this.onNextPiece) this.onNextPiece(this.nextPiece);
    }

    /**
     * 生成随机方块矩阵
     */
    randomPiece() {
        const id = Math.floor(Math.random() * PIECES.length);
        const matrix = PIECES[id];
        // 深拷贝矩阵，防止修改原定义
        return matrix.map(row => [...row]);
    }

    /**
     * 游戏主循环 (RequestAnimationFrame)
     * @param {number} time - 当前时间戳
     */
    loop(time = 0) {
        if (this.gameOver) return;

        const deltaTime = time - this.lastTime;
        this.lastTime = time;

        // 处理自动下落
        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.drop();
        }

        this.draw();
        requestAnimationFrame(this.loop.bind(this));
    }

    /**
     * 方块下落一格逻辑
     */
    drop() {
        this.pos.y++;
        // 碰撞检测
        if (this.collide(this.board, this.piece, this.pos)) {
            this.pos.y--; // 回退一格
            this.merge(this.board, this.piece, this.pos); // 将方块合并到棋盘
            this.arenaSweep(); // 检测消除行

            // 生成新方块
            this.piece = this.nextPiece;
            this.nextPiece = this.randomPiece();

            // 触发下一个方块的UI更新回调
            if (this.onNextPiece) this.onNextPiece(this.nextPiece);

            // 重置新方块位置
            this.pos = { x: 3, y: 0 };

            // 检测新方块是否一出生就碰撞 (Game Over)
            if (this.collide(this.board, this.piece, this.pos)) {
                this.gameOver = true;
                if (this.onGameOver) this.onGameOver();
            }

            // 触发棋盘更新回调 (用于发送给对手)
            if (this.onBoardUpdate) this.onBoardUpdate(this.board);
        }
        this.dropCounter = 0;
    }

    /**
     * 硬降 (Hard Drop)
     * 瞬间掉落到底部
     */
    hardDrop() {
        // 循环下落直到发生碰撞
        while (!this.collide(this.board, this.piece, { x: this.pos.x, y: this.pos.y + 1 })) {
            this.pos.y++;
            this.score += 2; // 硬降奖励分
        }
        // 执行最终的锁定逻辑
        this.drop();
    }

    /**
     * 左右移动
     * @param {number} dir - 1 为右, -1 为左
     */
    move(dir) {
        this.pos.x += dir;
        if (this.collide(this.board, this.piece, this.pos)) {
            this.pos.x -= dir; // 如果碰撞则回退
        }
    }

    /**
     * 旋转方块
     * @param {number} dir - 旋转方向 (目前只用到了顺时针)
     */
    rotate(dir) {
        const pos = this.pos.x;
        let offset = 1;
        this._rotateMatrix(this.piece, dir);

        // 简单的踢墙算法 (Wall Kick)
        // 如果旋转后发生碰撞，尝试左右平移来修正
        while (this.collide(this.board, this.piece, this.pos)) {
            this.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            // 如果尝试次数过多超过方块宽度，说明无法旋转，回退旋转
            if (offset > this.piece[0].length) {
                this._rotateMatrix(this.piece, -dir);
                this.pos.x = pos;
                return;
            }
        }
    }

    /**
     * 矩阵旋转辅助函数
     */
    _rotateMatrix(matrix, dir) {
        for (let y = 0; y < matrix.length; ++y) {
            for (let x = 0; x < y; ++x) {
                [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
            }
        }
        if (dir > 0) {
            matrix.forEach(row => row.reverse());
        } else {
            matrix.reverse();
        }
    }

    /**
     * 碰撞检测
     * 检查方块是否与棋盘边界或已存在的方块重叠
     */
    collide(board, piece, offset) {
        for (let y = 0; y < piece.length; ++y) {
            for (let x = 0; x < piece[y].length; ++x) {
                if (piece[y][x] !== 0 &&
                    (board[y + offset.y] && board[y + offset.y][x + offset.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 锁定方块
     * 将当前方块的值写入棋盘矩阵
     */
    merge(board, piece, offset) {
        piece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[y + offset.y][x + offset.x] = value;
                }
            });
        });
    }

    /**
     * 扫描并消除满行
     */
    arenaSweep() {
        let rowCount = 0;
        // 从底部向上扫描
        outer: for (let y = this.board.length - 1; y > 0; --y) {
            for (let x = 0; x < this.board[y].length; ++x) {
                if (this.board[y][x] === 0) {
                    continue outer; // 如果当前行有空格，跳过
                }
            }

            // 移除满行，并在顶部添加空行
            const row = this.board.splice(y, 1)[0].fill(0);
            this.board.unshift(row);
            ++y; // 因为移除了一行，需要保持索引检查当前行位置
            rowCount++;
        }

        // 积分规则
        if (rowCount > 0) {
            const oldScore = this.score;
            this.score += rowCount * 10;
            if (this.onScore) this.onScore(this.score);

            // 积分每达到 100 分触发一次攻击判定
            const attackLines = Math.floor(this.score / 100) - Math.floor(oldScore / 100);
            if (attackLines > 0 && this.onLinesCleared) {
                this.onLinesCleared(attackLines);
            }
        }
    }

    /**
     * 增加垃圾行 (被攻击)
     * @param {number} lines - 垃圾行数量
     */
    addGarbage(lines) {
        for (let i = 0; i < lines; i++) {
            const row = Array(CONSTANTS.COLS).fill(8); // 8 代表垃圾块颜色
            // 随机挖一个洞，确保不会完全堵死
            const hole = Math.floor(Math.random() * CONSTANTS.COLS);
            row[hole] = 0;
            this.board.shift(); // 移除顶部一行 (可能导致方块被顶出死亡)
            this.board.push(row);
        }
        // 强制重绘
        this.draw();
    }

    /**
     * 绘制函数
     */
    draw() {
        // 清空背景
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制棋盘
        this.drawMatrix(this.board, { x: 0, y: 0 });

        // 如果是本地游戏且方块存在，绘制当前活动的方块
        if (!this.isRemote && this.piece) {
            this.drawMatrix(this.piece, this.pos);
        }
    }

    /**
     * 绘制矩阵通用方法
     */
    drawMatrix(matrix, offset) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.ctx.fillStyle = CONSTANTS.COLORS[value];
                    // 绘制方块，留出1px间隙以显示网格感
                    this.ctx.fillRect((x + offset.x) * CONSTANTS.BLOCK_SIZE,
                        (y + offset.y) * CONSTANTS.BLOCK_SIZE,
                        CONSTANTS.BLOCK_SIZE - 1,
                        CONSTANTS.BLOCK_SIZE - 1);
                }
            });
        });
    }

    /**
     * 远程更新接口
     * 直接接收并在本地渲染对手的棋盘数据
     */
    setBoardState(board) {
        this.board = board;
        this.draw();
    }
}
