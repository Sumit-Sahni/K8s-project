/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server in .next/standalone -> small Docker image
  output: "standalone",
  poweredByHeader: false,
};

module.exports = nextConfig;
