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
};
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
