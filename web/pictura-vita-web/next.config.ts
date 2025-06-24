import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// for dev only
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';