/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverExternalPackages: ["@ai-sdk/mcp"],
  },
};

export default nextConfig;
