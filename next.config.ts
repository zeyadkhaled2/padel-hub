import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const config: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'radix-ui'],
  },
};
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
