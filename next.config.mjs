
/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
    serverActions: {
      bodySizeLimit: '10mb',
    },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'rdc-full.vercel.app',
        port: '',
        pathname: '/assets/**',
      },
      {
        protocol: 'https',
        hostname: 'www.pierc.org',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
