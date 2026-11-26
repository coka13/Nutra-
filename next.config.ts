import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';
const config: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => !entry.internal && entry.family === 'IPv4')
      .map((entry) => entry.address),
  ),
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client', 'ffmpeg-static'],
  outputFileTracingIncludes: {
    '/*': [
      './prisma/**/*',
      './node_modules/prisma/**/*',
      './node_modules/@prisma/**/*',
      './node_modules/@esbuild/**/*',
      './node_modules/tsx/**/*',
    ],
    '/api/exercises/*/animation': ['node_modules/ffmpeg-static/ffmpeg*'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/exercise-thumbnails/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/exercise-gifs/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};
export default config;
