import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 otherwise writes its own CLAUDE.md into the project root; ours is the house rules.
  agentRules: false,
};

export default nextConfig;
