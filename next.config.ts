import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Adds Eve's generated service routes (e.g. the eve channel's session endpoints).
export default withEve(nextConfig);
