/** @type {import('next').NextConfig} */
const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/$/, "");

const nextConfig = {
  async rewrites() {
    if (!apiBaseUrl) return [];
    return [
      {
        source: "/api/backend/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
