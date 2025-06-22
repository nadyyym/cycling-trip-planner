/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  webpack: (config, { isServer }) => {
    // Optimize client-side bundle for JSZip and other large dependencies
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          // Separate JSZip into its own chunk for better caching
          jszip: {
            test: /[\\/]node_modules[\\/](jszip)[\\/]/,
            name: "jszip",
            chunks: "all",
            priority: 10,
          },
        },
      };
    }
    
    return config;
  },
};

export default config;
