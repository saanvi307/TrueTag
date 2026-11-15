import nextEnv from '@next/env';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

nextEnv.loadEnvConfig(process.cwd());
const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing database environment values: ${missing.join(', ')}`);
if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('Run this command in an interactive terminal so the password can be entered without echo.');

const terminal = createInterface({ input: stdin, output: stdout });
const lockName = 'trutag_initial_admin_seed';
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 1,
  charset: 'utf8mb4',
  ...(process.env.MYSQL_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2' } } : {}),
});
let connection;
let lockAcquired = false;

async function hiddenPrompt(label) {
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = chunk => {
      for (const char of String(chunk)) {
        if (char === '\u0003') {
          stdin.removeListener('data', onData); stdin.setRawMode(false); stdout.write('\n'); reject(new Error('Cancelled.')); return;
        }
        if (char === '\r' || char === '\n') {
          stdin.removeListener('data', onData); stdin.setRawMode(false); stdout.write('\n'); resolve(value); return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

try {
  connection = await pool.getConnection();
  const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
  if (Number(lockRows[0]?.acquired) !== 1) throw new Error('Another initial admin setup is in progress. Try again shortly.');
  lockAcquired = true;

  const [adminRows] = await connection.execute("SELECT COUNT(*) AS total FROM trutag_user_accounts WHERE role = 'admin'");
  if (Number(adminRows[0]?.total) > 0) throw new Error('An administrator account already exists. Initial admin setup can only run once.');

  const typedUsername = (await terminal.question('Admin username [Saanvi]: ')).trim();
  const username = typedUsername || 'Saanvi';
  if (username.length > 120) throw new Error('The username must be 120 characters or fewer.');
  const [existing] = await connection.execute('SELECT id FROM trutag_user_accounts WHERE username = ? LIMIT 1', [username]);
  if (existing.length) throw new Error('That username is already in use. Choose a different admin username.');

  const password = await hiddenPrompt('New admin password (minimum 12 characters; input hidden): ');
  const confirmation = await hiddenPrompt('Confirm admin password (input hidden): ');
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  if (password !== confirmation) throw new Error('The passwords did not match. No account was created.');

  await connection.beginTransaction();
  const [recheckRows] = await connection.execute("SELECT COUNT(*) AS total FROM trutag_user_accounts WHERE role = 'admin' FOR UPDATE");
  if (Number(recheckRows[0]?.total) > 0) { await connection.rollback(); throw new Error('An administrator account was created during setup. No additional initial admin was added.'); }
  const passwordHash = await bcrypt.hash(password, 12);
  await connection.execute(
    'INSERT INTO trutag_user_accounts (username, password_hash, role, officer_id) VALUES (?, ?, \'admin\', NULL)',
    [username, passwordHash],
  );
  await connection.commit();
  console.log('Initial administrator account created. The password was stored as a bcrypt hash and was not displayed.');
} catch (error) {
  if (connection) await connection.rollback().catch(() => undefined);
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'ER_NO_SUCH_TABLE') console.error('The user-account table is missing. Apply the documented TruTag schema files, then rerun this command.');
  else if (code === 'ER_ACCESS_DENIED_ERROR') console.error('MySQL rejected the configured account. Check MYSQL_USER, MYSQL_PASSWORD, and database grants.');
  else if (code === 'ER_BAD_DB_ERROR') console.error('MYSQL_DATABASE does not exist or is not accessible. Have a MySQL administrator create it and apply the schema first.');
  else console.error(error instanceof Error ? error.message : 'Initial admin setup failed.');
  process.exitCode = 1;
} finally {
  if (lockAcquired && connection) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
  connection?.release();
  await pool.end();
  terminal.close();
}
