import mysql, { type Pool } from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var trutagMysqlPool: Pool | undefined;
}

export function getPool(): Pool {
  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_SSL } = process.env;
  const missing = [
    ['MYSQL_HOST', MYSQL_HOST], ['MYSQL_USER', MYSQL_USER],
    ['MYSQL_PASSWORD', MYSQL_PASSWORD], ['MYSQL_DATABASE', MYSQL_DATABASE],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) {
    throw new Error(`Database is not configured. Set ${missing.join(', ')} and run db/officers.sql.`);
  }
  const port = Number(MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT must be a number between 1 and 65535.');

  if (!global.trutagMysqlPool) {
    global.trutagMysqlPool = mysql.createPool({
      host: MYSQL_HOST,
      port,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 5,
      idleTimeout: 60000,
      enableKeepAlive: true,
      charset: 'utf8mb4',
      ...(MYSQL_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2' as const } } : {}),
    });
  }
  return global.trutagMysqlPool;
}

export function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Database request failed.';
  const missingConfig = message.startsWith('Database is not configured.');
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  let userMessage = 'The database request failed. Check the MySQL service and application logs.';
  if (missingConfig) userMessage = message;
  else if (code === 'ER_ACCESS_DENIED_ERROR') userMessage = 'MySQL rejected the configured account. Check MYSQL_USER, MYSQL_PASSWORD, and that the account has access to MYSQL_DATABASE.';
  else if (code === 'ER_BAD_DB_ERROR') userMessage = 'The configured MYSQL_DATABASE does not exist or is not accessible.';
  else if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) userMessage = 'The MySQL server could not be reached. Check MYSQL_HOST, MYSQL_PORT, and the server network settings.';
  else if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') userMessage = 'The connected database is missing part of the TruTag schema. Run the required SQL files in db/ in the documented order.';
  const status = missingConfig || ['ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code) ? 503 : 500;
  return Response.json({ error: userMessage }, { status });
}
