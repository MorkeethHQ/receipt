import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@0gfoundation/0g-ts-sdk',
    '@0glabs/0g-serving-broker',
  ],
  serverExternalPackages: ['ethers'],
  webpack: (config) => {
    config.resolve.alias['@receipt/sdk'] = path.resolve(__dirname, '../../packages/receipt-sdk/src');
    return config;
  },
};

export default nextConfig;
