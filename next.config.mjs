/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["exceljs"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
  },
};
export default nextConfig;
