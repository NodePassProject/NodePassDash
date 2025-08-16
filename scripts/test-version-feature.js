const Database = require('better-sqlite3');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'public', 'database.db');

console.log('🧪 测试主控版本功能...');
console.log('数据库路径:', dbPath);

try {
  // 连接数据库
  const db = new Database(dbPath);
  console.log('✅ 数据库连接成功');

  // 1. 检查endpoints表结构
  console.log('\n📋 检查endpoints表结构...');
  const tableInfo = db.prepare("PRAGMA table_info(endpoints)").all();
  const verColumn = tableInfo.find(col => col.name === 'ver');
  
  if (verColumn) {
    console.log('✅ ver字段存在:', {
      name: verColumn.name,
      type: verColumn.type,
      notnull: verColumn.notnull,
      defaultValue: verColumn.dflt_value
    });
  } else {
    console.log('❌ ver字段不存在');
    process.exit(1);
  }

  // 2. 检查索引
  console.log('\n🔍 检查索引...');
  const indexInfo = db.prepare("PRAGMA index_list(endpoints)").all();
  const versionIndex = indexInfo.find(idx => idx.name === 'idx_endpoints_version');
  
  if (versionIndex) {
    console.log('✅ version索引存在:', versionIndex.name);
  } else {
    console.log('⚠️  version索引不存在，建议运行迁移脚本');
  }

  // 3. 检查数据
  console.log('\n📊 检查endpoints数据...');
  const endpoints = db.prepare("SELECT id, name, ver FROM endpoints LIMIT 5").all();
  
  if (endpoints.length > 0) {
    console.log(`✅ 找到 ${endpoints.length} 个主控:`);
    endpoints.forEach((ep, index) => {
      console.log(`  ${index + 1}. ${ep.name} (ID: ${ep.id}) - 版本: ${ep.ver || '未设置'}`);
    });
  } else {
    console.log('⚠️  没有找到主控数据');
  }

  // 4. 测试tunnels查询（模拟API查询）
  console.log('\n🔗 测试tunnels查询...');
  try {
    const tunnels = db.prepare(`
      SELECT 
        t.id, t.name, t.endpoint_id, t.type, t.status,
        e.name as endpoint_name, e.ver as endpoint_version
      FROM tunnels t
      LEFT JOIN endpoints e ON t.endpoint_id = e.id
      LIMIT 3
    `).all();

    if (tunnels.length > 0) {
      console.log(`✅ 找到 ${tunnels.length} 个隧道:`);
      tunnels.forEach((tunnel, index) => {
        console.log(`  ${index + 1}. ${tunnel.name} (${tunnel.type})`);
        console.log(`     主控: ${tunnel.endpoint_name} - 版本: ${tunnel.endpoint_version || '未设置'}`);
      });
    } else {
      console.log('⚠️  没有找到隧道数据');
    }
  } catch (error) {
    console.log('❌ 隧道查询失败:', error.message);
  }

  // 5. 检查API响应格式
  console.log('\n📡 模拟API响应格式...');
  const sampleTunnel = {
    id: "1",
    name: "示例隧道",
    endpoint: "测试主控",
    version: "1.2.3",
    type: "server",
    status: "running"
  };
  
  console.log('✅ 示例API响应:');
  console.log(JSON.stringify(sampleTunnel, null, 2));

  db.close();
  console.log('\n✅ 测试完成！数据库连接已关闭');

} catch (error) {
  console.error('❌ 测试失败:', error);
  process.exit(1);
}
