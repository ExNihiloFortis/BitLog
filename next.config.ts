// next.config.ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
}
export default nextConfig

