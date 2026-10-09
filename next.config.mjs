/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["playwright"],
  outputFileTracingExcludes: {
    '*': ['./browser-data/**', './debug/**'],
  },
};

export default nextConfig;
