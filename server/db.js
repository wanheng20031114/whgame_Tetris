const Database = require('better-sqlite3');
const path = require('path');

// 数据库文件路径
// 存放在当前目录下，文件名为 tetris.db
const dbPath = path.join(__dirname, 'tetris.db');
const db = new Database(dbPath);

// 初始化数据库表结构
// 使用 better-sqlite3 的 exec 方法执行多条 SQL 语句
db.exec(`
  -- 用户表 (users)
  -- 存储用户的基本信息
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 用户ID，自增主键
    username TEXT UNIQUE,                 -- 用户名，必须唯一
    password TEXT,                        -- 密码 (明文存储，实际生产环境应加密)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP -- 注册时间
  );

  -- 游戏记录表 (game_records)
  -- 存储每场对战的结果
  CREATE TABLE IF NOT EXISTS game_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 记录ID
    player1_id INTEGER,                   -- 玩家1 ID
    player2_id INTEGER,                   -- 玩家2 ID
    winner_id INTEGER,                    -- 获胜者 ID
    score_p1 INTEGER,                     -- 玩家1 分数
    score_p2 INTEGER,                     -- 玩家2 分数
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 对战时间
    FOREIGN KEY(player1_id) REFERENCES users(id), -- 外键关联用户表
    FOREIGN KEY(player2_id) REFERENCES users(id)  -- 外键关联用户表
  );
`);

// 自动迁移：检查并添加 users 表的 score 字段 (如果不存在)
try {
  const tableInfo = db.prepare('PRAGMA table_info(users)').all();
  const hasScore = tableInfo.some(col => col.name === 'score');
  if (!hasScore) {
    console.log('Migrating: Adding score column to users table...');
    db.exec('ALTER TABLE users ADD COLUMN score INTEGER DEFAULT 0');
  }
} catch (error) {
  console.error('Migration failed:', error);
}

module.exports = db;
