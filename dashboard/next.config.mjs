import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Admin pages read live data on every request — nothing here should be
  // statically generated or cached at the edge.
  reactStrictMode: true,

  // This directory has its own package.json and lockfile, but it sits inside
  // the Expo app's repo, which has a lockfile of its own one level up.
  // Without this, Next guesses the Expo app's root as the workspace root and
  // warns about it on every build. Pin it explicitly to here.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
