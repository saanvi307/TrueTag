import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import authConfig from './auth.config';
import { getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [Credentials({
    credentials: {
      username: { label: 'Username', type: 'text' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const username = typeof credentials?.username === 'string' ? credentials.username.trim() : '';
      const password = typeof credentials?.password === 'string' ? credentials.password : '';
      if (!username || !password) return null;
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT u.id, u.username, u.password_hash, u.role, u.officer_id, u.is_active, u.failed_attempts, u.locked_until,
            o.name AS officer_name FROM trutag_user_accounts u LEFT JOIN trutag_officers o ON o.id = u.officer_id
            WHERE u.username = ? LIMIT 1 FOR UPDATE`, [username],
        );
        const account = rows[0];
        if (!account || !account.is_active || (account.locked_until && new Date(account.locked_until).getTime() > Date.now())) {
          await connection.rollback(); return null;
        }
        const matches = await bcrypt.compare(password, account.password_hash);
        if (!matches) {
          await connection.execute(
            `UPDATE trutag_user_accounts SET
             locked_until = CASE WHEN failed_attempts >= 4 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END,
             failed_attempts = failed_attempts + 1
             WHERE id = ?`, [account.id],
          );
          await connection.commit(); return null;
        }
        if ((account.role === 'officer' && !account.officer_id) || (account.role === 'admin' && account.officer_id)) {
          await connection.rollback(); return null;
        }
        await connection.execute('UPDATE trutag_user_accounts SET failed_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?', [account.id]);
        await connection.commit();
        return {
          id: String(account.id), name: account.officer_name || account.username,
          username: account.username, role: account.role, officerId: account.officer_id ? Number(account.officer_id) : null,
        };
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
      } finally { connection.release(); }
    },
  })],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.officerId = user.officerId;
        token.username = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, {
          id: token.sub || '',
          role: token.role === 'admin' || token.role === 'officer' ? token.role : null,
          officerId: typeof token.officerId === 'number' ? token.officerId : null,
          username: token.username || '',
        });
      }
      return session;
    },
  },
});
