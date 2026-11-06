import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The repo has its own lockfile; without this Next walks up to a lockfile in the parent
  // directory and treats that folder as the workspace root, which changes what gets traced into
  // the build output. Pinning the root keeps the build self-contained and reproducible on Vercel.
  // `import.meta.dirname` (not `__dirname`: this file is an ES module, which is also why the build
  // warns about the missing "type": "module" in package.json).
  turbopack: {
    root: import.meta.dirname,
  },
  // In development the app is opened on 127.0.0.1 as well as localhost; without this the dev
  // client scripts are refused and the page never hydrates (every button stops working).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ddragon.leagueoflegends.com",
      },
      {
        protocol: "https",
        hostname: "raw.communitydragon.org",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
