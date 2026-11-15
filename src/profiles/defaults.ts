/**
 * The speech profiles Voice ships, as text: an American English default (for
 * every language without a profile of its own), British English (only what
 * differs from the default), German and French. They are written to the
 * profiles folder on first start, where users can read and extend them.
 */

import defaultProfile from "./defaults/default.yaml";
import britishProfile from "./defaults/en-GB.yaml";
import germanProfile from "./defaults/de.yaml";
import frenchProfile from "./defaults/fr.yaml";

export const SHIPPED_PROFILES: Record<string, string> = {
  default: defaultProfile,
  "en-GB": britishProfile,
  de: germanProfile,
  fr: frenchProfile,
};
