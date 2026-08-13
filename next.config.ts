import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Database drivers resolve submodules at runtime (mysql2 reaches for
  // 'mysql2/promise', pg for its optional native binding) and better-sqlite3
  // is a native addon. Bundling them drops those paths from the standalone
  // trace, so the image builds fine and then fails on the first query.
  serverExternalPackages: ['opendal', 'better-sqlite3', 'mysql2', 'pg'],
};

export default nextConfig;
