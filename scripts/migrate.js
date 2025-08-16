const Database = require('better-sqlite3');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'public', 'database.db');

console.log('开始数据库迁移...');
console.log('数据库路径:', dbPath);

try {
  // 连接数据库
  const db = new Database(dbPath);
  console.log('数据库连接成功');

  // 检查endpoints表是否存在ver字段
  const tableInfo = db.prepare("PRAGMA table_info(endpoints)").all();
  const hasVerColumn = tableInfo.some(col => col.name === 'ver');

  if (hasVerColumn) {
    console.log('endpoints表已存在ver字段，跳过添加version字段');
    
    // 检查是否已存在version字段索引
    const indexInfo = db.prepare("PRAGMA index_list(endpoints)").all();
    const hasVersionIndex = indexInfo.some(idx => idx.name === 'idx_endpoints_version');
    
    if (!hasVersionIndex) {
      console.log('创建version字段索引...');
      db.exec("CREATE INDEX IF NOT EXISTS idx_endpoints_version ON endpoints(ver)");
      console.log('version字段索引创建成功');
    } else {
      console.log('version字段索引已存在');
    }
  } else {
    console.log('endpoints表不存在ver字段，请先运行005_add_endpoint_info_fields.sql迁移');
    process.exit(1);
  }

  // 验证迁移结果
  const newTableInfo = db.prepare("PRAGMA table_info(endpoints)").all();
  const verColumn = newTableInfo.find(col => col.name === 'ver');
  
  if (verColumn) {
    console.log('✅ 迁移成功！ver字段信息:', {
      name: verColumn.name,
      type: verColumn.type,
      notnull: verColumn.notnull,
      defaultValue: verColumn.dflt_value
    });
    
    // 检查索引
    const indexInfo = db.prepare("PRAGMA index_list(endpoints)").all();
    const versionIndex = indexInfo.find(idx => idx.name === 'idx_endpoints_version');
    
    if (versionIndex) {
      console.log('✅ version字段索引创建成功:', versionIndex.name);
    }
  } else {
    console.log('❌ 迁移失败：未找到ver字段');
  }

  db.close();
  console.log('数据库连接已关闭');

} catch (error) {
  console.error('迁移失败:', error);
  process.exit(1);
}
