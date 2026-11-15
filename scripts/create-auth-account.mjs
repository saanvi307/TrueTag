import nextEnv from '@next/env';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing database environment values: ${missing.join(', ')}`);
const terminal = createInterface({ input: stdin, output: stdout });
async function hiddenPrompt(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('Create accounts from an interactive terminal so the password can be entered without echo.');
  stdout.write(label); stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = chunk => {
      for (const char of String(chunk)) {
        if (char === '\u0003') { stdin.removeListener('data', onData); stdin.setRawMode(false); stdout.write('\n'); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { stdin.removeListener('data', onData); stdin.setRawMode(false); stdout.write('\n'); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

try {
  const username = (await terminal.question('Username: ')).trim();
  const role = (await terminal.question('Role (admin/officer): ')).trim().toLowerCase();
  if (!username || !['admin', 'officer'].includes(role)) throw new Error('Enter a username and choose admin or officer.');
  const officerReference = role === 'officer' ? (await terminal.question('Existing Officer ID (FSSAI reference): ')).trim() : '';
  terminal.close();
  const password = await hiddenPrompt('Password (input hidden): ');
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  const pool = mysql.createPool({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, ...(process.env.MYSQL_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2' } } : {}) });
  try {
    let officerId = null;
    if (role === 'officer') {
      const [officers] = await pool.execute('SELECT id FROM trutag_officers WHERE officer_id = ? LIMIT 1', [officerReference]);
      if (!officers.length) throw new Error(`No officer found with Officer ID ${officerReference}.`);
      officerId = officers[0].id;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute('INSERT INTO trutag_user_accounts (username, password_hash, role, officer_id) VALUES (?, ?, ?, ?)', [username, passwordHash, role, officerId]);
    stdout.write(`Created ${role} account ${username}.\n`);
  } finally { await pool.end(); }
} finally { terminal.close(); }
