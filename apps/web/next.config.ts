import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources directly (no build step).
  transpilePackages: ['@tel/adapters', '@tel/ai', '@tel/calc', '@tel/config'],
  poweredByHeader: false,
};

export default nextConfig;
