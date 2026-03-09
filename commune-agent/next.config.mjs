/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverExternalPackages: ["@ai-sdk/mcp", "@react-pdf/renderer", "better-sqlite3"],
  },
  webpack: (config) => {
    // Required by @react-pdf/renderer (uses canvas internally)
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
