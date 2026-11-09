import type { Recipe } from "../types";
import { FEATURES } from "./features";
import { HERO } from "./hero";
import { LIBRARY } from "./library";
import { LOOKS } from "./looks";
import { TOUR } from "./tour";

/** Order matters in one place: `rating` turns a synced setting on, so TOUR, and its last recipe, stays last. */
export const RECIPES: Recipe[] = [...HERO, ...LIBRARY, ...FEATURES, ...LOOKS, ...TOUR];
