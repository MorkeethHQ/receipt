/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@0gfoundation/0g-ts-sdk',
    '@0glabs/0g-serving-broker',
  ],
  serverExternalPackages: ['ethers'],
};

export default nextConfig;
