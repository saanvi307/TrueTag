import 'next-auth';
import 'next-auth/jwt';
import type { DefaultSession } from 'next-auth';

type TruTagRole = 'admin' | 'officer';

declare module 'next-auth' {
  interface User { username: string; role: TruTagRole; officerId: number | null }
  interface Session {
    user: { id: string; username: string; role: TruTagRole | null; officerId: number | null } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT { role?: TruTagRole; officerId?: number | null; username?: string }
}
