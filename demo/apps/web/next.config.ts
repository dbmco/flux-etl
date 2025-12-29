import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable standalone build output for optimized Docker image
  output: 'standalone',
  typedRoutes: true,
  experimental: {
    optimizePackageImports: [
      'react',
      'react-dom'
    ]
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
