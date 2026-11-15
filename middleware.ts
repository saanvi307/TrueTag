import NextAuth from 'next-auth';
import authConfig from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/', '/officers/:path*', '/food-businesses/:path*', '/assignments/:path*', '/verification-logs/:path*', '/product-scanner/:path*', '/officer-dashboard/:path*', '/api/admin/:path*', '/api/officers/:path*', '/api/food-businesses/:path*', '/api/assignments/:path*', '/api/officer/:path*'],
};
