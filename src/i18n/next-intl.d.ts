import type { Locale } from "./config";
import type common from "../../messages/en/common.json";
import type nav from "../../messages/en/nav.json";
import type search from "../../messages/en/search.json";
import type regions from "../../messages/en/regions.json";
import type queues from "../../messages/en/queues.json";
import type tiers from "../../messages/en/tiers.json";
import type home from "../../messages/en/home.json";
import type rankings from "../../messages/en/rankings.json";
import type profile from "../../messages/en/profile.json";
import type matches from "../../messages/en/matches.json";
import type tft from "../../messages/en/tft.json";
import type errors from "../../messages/en/errors.json";
import type footer from "../../messages/en/footer.json";

// English is the reference locale: keys missing from it fail type-checking.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      common: typeof common;
      nav: typeof nav;
      search: typeof search;
      regions: typeof regions;
      queues: typeof queues;
      tiers: typeof tiers;
      home: typeof home;
      rankings: typeof rankings;
      profile: typeof profile;
      matches: typeof matches;
      tft: typeof tft;
      errors: typeof errors;
      footer: typeof footer;
    };
  }
}
