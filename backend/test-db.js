const mysql = require('mysql2/promise');

const dbConfig = {
  host: '127.0.0.1',  // 使用IP而不是localhost
  port: 3306,
  database: 'sipp_manager',
  user: 'sipp',  // 使用新创建的sipp用户
  password: 'sipp123456',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

async function testConnection() {
  console.log('Testing MySQL connection with config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user
  });

  let pool;
  try {
    pool = mysql.createPool(dbConfig);
    console.log('Pool created');

    // 添加事件监听
    pool.on('connection', (connection) => {
      console.log('New connection created, threadId:', connection.threadId);
    });

    pool.on('acquire', (connection) => {
      console.log('Connection acquired from pool, threadId:', connection.threadId);
    });

    pool.on('release', (connection) => {
      console.log('Connection released back to pool, threadId:', connection.threadId);
    });

    console.log('Attempting to get connection...');
    const connection = await pool.getConnection();
    console.log('Connection acquired, threadId:', connection.threadId);

    console.log('Attempting to ping...');
    await connection.ping();
    console.log('Ping successful');

    console.log('Querying MySQL version...');
    const [rows] = await connection.query('SELECT VERSION() as version');
    console.log('MySQL version:', rows[0].version);

    connection.release();
    console.log('Connection released');

    await pool.end();
    console.log('Pool closed');

    console.log('\n✅ Database connection test PASSED');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection test FAILED');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Errno:', error.errno);
    console.error('SqlState:', error.sqlState);
    console.error('SqlMessage:', error.sqlMessage);
    console.error('Stack:', error.stack);
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        console.error('Failed to close pool:', e.message);
      }
    }
    process.exit(1);
  }
}

testConnection();
