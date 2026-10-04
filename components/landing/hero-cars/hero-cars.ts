import type { StaticImageData } from "next/image";

import everest from "./everest.webp";
import hiace from "./hiace.webp";
import innova from "./innova.webp";
import vios from "./vios.webp";
import wigo from "./wigo.webp";

export type PhotoCredit = {
  author: string;
  license: "CC BY-SA 3.0" | "CC BY-SA 4.0";
  licenseUrl: string;
  source: string;
};

export type HeroCar = {
  key: string;
  category: string;
  /** Words that match this type against free-text `vehicles.category`. */
  matches: string[];
  model: string;
  image: StaticImageData;
  /** Width relative to the longest car, so the lineup keeps real-world scale. */
  scale: number;
  credit: PhotoCredit;
};

const BY_SA_3 = "https://creativecommons.org/licenses/by-sa/3.0/";
const BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";

/**
 * Background-removed cutouts of Wikimedia Commons photos. CC BY-SA requires
 * attribution and that these derivatives stay CC BY-SA — the footer renders
 * the credits below.
 */
export const heroCars: HeroCar[] = [
  {
    key: "vios",
    category: "Sedan",
    matches: ["sedan"],
    model: "Toyota Vios",
    image: vios,
    scale: 0.86,
    credit: {
      author: "Captainmorlypogi1959",
      license: "CC BY-SA 4.0",
      licenseUrl: BY_SA_4,
      source: "https://commons.wikimedia.org/wiki/File:Toyota_Vios_1.3_XLE_2021_(2).jpg",
    },
  },
  {
    key: "everest",
    category: "SUV",
    matches: ["suv", "crossover"],
    model: "Ford Everest",
    image: everest,
    scale: 0.93,
    credit: {
      author: "Captainmorlypogi1959",
      license: "CC BY-SA 4.0",
      licenseUrl: BY_SA_4,
      source:
        "https://commons.wikimedia.org/wiki/File:Ford_Everest_4x4_Wildtrak_2023_(2).jpg",
    },
  },
  {
    key: "wigo",
    category: "Economy",
    matches: ["economy", "hatchback", "compact"],
    model: "Toyota Wigo",
    image: wigo,
    scale: 0.72,
    credit: {
      author: "Areaseven",
      license: "CC BY-SA 3.0",
      licenseUrl: BY_SA_3,
      source: "https://commons.wikimedia.org/wiki/File:Toyota_Wigo_G_-_Left_Side.jpg",
    },
  },
  {
    key: "innova",
    category: "MPV",
    matches: ["mpv", "family"],
    model: "Toyota Innova",
    image: innova,
    scale: 0.9,
    credit: {
      author: "Premnath Kudva",
      license: "CC BY-SA 4.0",
      licenseUrl: BY_SA_4,
      source: "https://commons.wikimedia.org/wiki/File:Toyota_Innova_Crysta_2.4_Z_side.jpg",
    },
  },
  {
    key: "hiace",
    category: "Van",
    matches: ["van"],
    model: "Toyota HiAce",
    image: hiace,
    scale: 1,
    credit: {
      author: "Alex Neman",
      license: "CC BY-SA 4.0",
      licenseUrl: BY_SA_4,
      source:
        "https://commons.wikimedia.org/wiki/File:2017_Toyota_HiAce_(side),_Batu_City.jpg",
    },
  },
];

/** Every photo the landing page shows, for the footer credits. */
export const landingPhotoCredits: Array<{ key: string; label: string; credit: PhotoCredit }> = [
  ...heroCars.map(({ key, model, credit }) => ({ key, label: model, credit })),
];
