import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Adds Eve's generated service routes, including the WhatsApp Chat SDK channel.
export default withEve(nextConfig);
