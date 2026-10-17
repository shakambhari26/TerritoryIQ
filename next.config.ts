import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The Gate P0 data-free map preview was folded into the workspace. Old links
  // and bookmarks land on the one working map. Redirects are checked before
  // routes, so this holds whether or not the old route files are still on disk.
  async redirects() {
    return [
      { source: "/territory-map", destination: "/workspace", permanent: false },
      { source: "/territory-map/:path*", destination: "/workspace", permanent: false },
      // The globe started at /globe-prototype and is now at /globe. Temporary (307) while it is a local prototype.
      { source: "/globe-prototype", destination: "/globe", permanent: false },
      { source: "/globe-prototype/:path*", destination: "/globe", permanent: false },
    ];
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
