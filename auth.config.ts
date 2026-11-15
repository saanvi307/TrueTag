import type { NextAuthConfig } from 'next-auth';

const authConfig: NextAuthConfig = {
  providers: [],
  pages: { signIn: '/sign-in' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
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
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const role = auth?.user?.role;
      if (path === '/' || path.startsWith('/officers') || path.startsWith('/food-businesses') || path.startsWith('/assignments') || path.startsWith('/verification-logs') || path.startsWith('/product-scanner') || path.startsWith('/api/admin/') || path.startsWith('/api/officers') || path.startsWith('/api/food-businesses') || path.startsWith('/api/assignments')) return role === 'admin';
      if (path.startsWith('/officer-dashboard') || path.startsWith('/api/officer/')) return role === 'officer';
      return true;
    },
  },
};

export default authConfig;
