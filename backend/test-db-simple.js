const mysql = require('mysql2/promise');

async function testSimpleConnection() {
  console.log('Testing simple MySQL connection...');

  try {
    // 不使用连接池，直接创建连接
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'sipp',
      password: 'sipp123456',
      database: 'sipp_manager'
    });

    console.log('✅ Connection created successfully');

    const [rows] = await connection.execute('SELECT VERSION() as version');
    console.log('✅ MySQL version:', rows[0].version);

    const [scenarios] = await connection.execute('SELECT COUNT(*) as count FROM scenarios');
    console.log('✅ Scenarios count:', scenarios[0].count);

    await connection.end();
    console.log('✅ Connection closed');

    console.log('\n✅✅✅ All tests PASSED!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test FAILED');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testSimpleConnection();
