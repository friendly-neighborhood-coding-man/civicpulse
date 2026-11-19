import type { NextConfig } from "next";

/**
 * Dev-only HMR/origin allowance. This must never be a wildcard: the preview
 * hostname is supplied explicitly per environment.
 */
const devOrigins = (process.env.CIVICPULSE_DEV_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp"],
  allowedDevOrigins: devOrigins,
};

export default nextConfig;
