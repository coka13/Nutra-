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
      './node_modules/esbuild/**/*',
      './node_modules/tsx/**/*',
      './node_modules/c12/**/*',
      './node_modules/chokidar/**/*',
      './node_modules/confbox/**/*',
      './node_modules/deepmerge-ts/**/*',
      './node_modules/defu/**/*',
      './node_modules/destr/**/*',
      './node_modules/dotenv/**/*',
      './node_modules/effect/**/*',
      './node_modules/empathic/**/*',
      './node_modules/exsolve/**/*',
      './node_modules/giget/**/*',
      './node_modules/jiti/**/*',
      './node_modules/ohash/**/*',
      './node_modules/pathe/**/*',
      './node_modules/perfect-debounce/**/*',
      './node_modules/pkg-types/**/*',
      './node_modules/rc9/**/*',
      './node_modules/readdirp/**/*',
      './node_modules/@standard-schema/**/*',
      './node_modules/fast-check/**/*',
      './node_modules/pure-rand/**/*',
      './node_modules/citty/**/*',
      './node_modules/consola/**/*',
      './node_modules/node-fetch-native/**/*',
      './node_modules/nypm/**/*',
      './node_modules/tinyexec/**/*',
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
