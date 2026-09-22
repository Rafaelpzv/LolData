import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
