import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@party-game/shared", "@party-game/content", "@party-game/minigames"],
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default config;
