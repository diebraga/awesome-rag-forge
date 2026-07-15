import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
  },
  // @napi-rs/keyring ships a native (.node) addon -- it must be required at
  // runtime via Node's own module resolution, not bundled into an ESM
  // chunk. Same class of fix Prisma's own generated client needs, just for
  // a different native dependency.
  serverExternalPackages: ["@napi-rs/keyring"],
};

export default nextConfig;
