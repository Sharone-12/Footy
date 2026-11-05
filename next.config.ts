import type { NextConfig } from "next";

// Squad cutouts are ~700 KB transparent PNGs in our own Supabase bucket, so
// unlike the 7 KB headshots they have to go through the image optimizer —
// which needs their host whitelisted. Parsed from the env var so a project
// swap can't leave a stale hostname behind.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Set by `next upgrade --agent=security` for the 16.4.0 -> 16.4.5 patch.
  experimental: { agentUpgrade: "security" },
  images: supabaseHost
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/images/**",
          },
        ],
      }
    : undefined,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
