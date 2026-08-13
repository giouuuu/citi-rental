import type { NextConfig } from "next";

const supabaseHostname = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "oyphktvlxfklfrdxknit.supabase.co";
  } catch {
    return "oyphktvlxfklfrdxknit.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    // Client Cache lifetimes. `dynamic` defaults to 0, so today every return to
    // a list re-queries Postgres; 30s absorbs the open-a-record-then-go-back
    // loop without a round trip. Safe only because every mutation action calls
    // revalidateResource() — see src/features/shared/lib/revalidate-resource.ts.
    // Trade-off: another admin's edit can take up to 30s to appear for a user
    // who is navigating rather than reloading. Lower this to 10 if that bites.
    staleTimes: { dynamic: 30, static: 300 },
  },
  transpilePackages: [
    "@fullcalendar/core",
    "@fullcalendar/react",
    "@fullcalendar/daygrid",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
