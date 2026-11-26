import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const config: NextConfig = {
  poweredByHeader: false,
  // Only fixed repository artwork may enter the shared image optimizer cache.
  // Seller photos use authorization-checked, no-store delivery endpoints.
  images: {
    localPatterns: [
      { pathname: '/images/demo/**', search: '' },
      { pathname: '/brand/**', search: '' },
    ],
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
      {
        source: '/:locale(en|ar)/auth/:flow(callback|recovery)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/api/contact/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
