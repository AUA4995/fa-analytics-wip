import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal ops app: every screen shows live database state, so we keep the
  // classic fully-dynamic rendering model rather than Cache Components.
  cacheComponents: false,
  // Standalone output is what the Dockerfile copies into the runtime image — only for the Docker build (it sets
  // BUILD_STANDALONE=1). The laptop's `npm start` and Vercel use the normal output (batch 7).
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Vercel (batch 7): files read at run time ship with the functions that read them — the logo in report emails and
  // PDFs, and pdfkit's built-in font metrics.
  outputFileTracingIncludes: {
    "/reports": ["./public/brand/**", "./node_modules/pdfkit/js/data/**"],
    "/finance": ["./public/brand/**", "./node_modules/pdfkit/js/data/**"],
    "/api/reports/\\[id\\]/pdf": ["./public/brand/**", "./node_modules/pdfkit/js/data/**"],
    "/api/cron/tick": ["./public/brand/**", "./node_modules/pdfkit/js/data/**"],
  },
  // Native/Node-only packages must not be bundled by Turbopack.
  serverExternalPackages: ["pg-boss", "pg", "@prisma/adapter-pg", "pdfkit"],
  // The dev compile cache (.next/dev/cache) kept serving an old globals.css after a git pull
  // (the Tailwind loader's output was reused). Compile fresh on every `npm run dev` instead.
  // Batch 2 (22/10/2026): left off — the stale CSS comes from the @tailwindcss/turbopack loader's cache and could not
  // be proven fixed. If styles ever look old: stop the app, delete the .next folder, start again (README).
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
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
