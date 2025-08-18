import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.docx$/,
      use: [
        {
          loader: 'raw-loader',
          options: {
            esModule: false,
          },
        },
      ],
    });
    
    config.module.rules.push({
      test: /\.xlsx$/,
      use: [
        {
          loader: 'raw-loader',
          options: {
            esModule: false,
          },
        },
      ],
    });

    return config;
  },
};

export default nextConfig;
