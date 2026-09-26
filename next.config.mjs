/** @type {import('next').NextConfig} */
const nextConfig = (phase) => ({
  // Keep local development and verification separate; Vercel expects .next.
  distDir: phase === 'phase-development-server' || process.env.VERCEL === '1' ? '.next' : '.next-production',
});

export default nextConfig;
