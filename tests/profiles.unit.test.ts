import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parseProfile, detectFormat } from "../src/profiles/parse";
import {
  normalizeLanguageKey,
  profileKeysFor,
  resolveProfile,
  type ProfileLayers,
} from "../src/profiles/resolve";
import {
  applyLexicon,
  pairEntries,
  spellOut,
  spelledAcronymEntries,
} from "../src/profiles/lexicon";
import { SHIPPED_PROFILES } from "../src/profiles/defaults";
import { readingLanguage } from "../src/profiles/language";
import { setProfileValue } from "../src/profiles/edit";
import { profileTemplate } from "../src/profiles/template";
import { processorConfigFromProfile } from "../src/profiles/processorConfig";
import { parseDuration, PROFILE_FORMAT_VERSION } from "../src/profiles/schema";
import { serializeToText } from "../src/processors/pipeline/TextSerializer";
import type { Node } from "unist";

const parse = (text: string) => parseProfile(text, parseYaml);

/** The profiles Voice ships, as layers, plus extra ones on top. */
function shipped(extra: ProfileLayers = {}): ProfileLayers {
  const layers: ProfileLayers = {};
  for (const [key, text] of Object.entries(SHIPPED_PROFILES)) {
    layers[key] = parse(text).data!;
  }
  return { ...layers, ...extra };
}

describe("Speech profile parsing Unit", () => {
  it("detects JSON and YAML and reads both", () => {
    expect(detectFormat('  {"voiceProfile": 1}')).toBe("json");
    expect(detectFormat("voiceProfile: 1")).toBe("yaml");
    expect(
      parse('{"voiceProfile": 1, "content": {"urls": "skip"}}').data,
    ).toEqual({ voiceProfile: 1, content: { urls: "skip" } });
    expect(parse("voiceProfile: 1\ncontent:\n  urls: skip\n").data).toEqual({
      voiceProfile: 1,
      content: { urls: "skip" },
    });
  });

  it("requires a format version and refuses newer ones", () => {
    expect(parse("content:\n  urls: skip").errors[0]).toMatch(/voiceProfile/);
    expect(
      parse(`voiceProfile: ${PROFILE_FORMAT_VERSION + 1}`).errors[0],
    ).toMatch(/newer version/);
    expect(parse("voiceProfile: one").errors[0]).toMatch(/whole number/);
  });

  it("reports syntax errors and invalid values without data", () => {
    const broken = parse('{"voiceProfile": 1,');
    expect(broken.data).toBeNull();
    expect(broken.errors[0]).toMatch(/Not valid JSON/);

    const invalid = parse(
      "voiceProfile: 1\ncontent:\n  urls: maybe\nstructure:\n  paragraphs:\n    pause: 9s\n",
    );
    expect(invalid.data).toBeNull();
    expect(invalid.errors).toEqual([
      "content.urls: use one of read, skip",
      "structure.paragraphs.pause: use a duration between 0ms and 3000ms",
    ]);
  });

  it("validates lexicon entries", () => {
    const result = parse(
      'voiceProfile: 1\nlexicon:\n  - match: KI\n  - say: "x"\n',
    );
    expect(result.errors).toEqual([
      'lexicon entry 1: "say" must be the text to say instead.',
      'lexicon entry 2: "match" must be the text to replace.',
    ]);
  });

  it("keeps unknown fields with a warning instead of failing", () => {
    const result = parse(
      "voiceProfile: 1\nstyle:\n  mood: calm\ncontent:\n  urls: skip\n  tone: warm\n",
    );
    expect(result.errors).toEqual([]);
    expect(result.data?.style).toEqual({ mood: "calm" });
    expect(result.warnings).toEqual([
      '"style" is not supported by this version of Voice; it is kept but not applied.',
      '"content.tone" is not supported by this version of Voice; it is kept but not applied.',
    ]);
  });

  it("ships valid profiles and a valid template for other languages", () => {
    for (const key of ["default", "en-GB", "de", "fr", "es"]) {
      const result = parse(profileTemplate(key));
      expect({ key, errors: result.errors, warnings: result.warnings }).toEqual(
        {
          key,
          errors: [],
          warnings: [],
        },
      );
    }
  });

  it("parses durations in ms, seconds, or as numbers", () => {
    expect(parseDuration("400ms")).toBe(400);
    expect(parseDuration("0.4s")).toBe(400);
    expect(parseDuration(250)).toBe(250);
    expect(parseDuration("soon")).toBeNull();
  });
});

describe("Speech profile resolution Unit", () => {
  it("orders layers from default to the regional profile", () => {
    expect(profileKeysFor("de-DE")).toEqual(["default", "de", "de-DE"]);
    expect(profileKeysFor("de")).toEqual(["default", "de"]);
    expect(normalizeLanguageKey("de_de")).toBe("de-DE");
    expect(normalizeLanguageKey("Default")).toBe("default");
  });

  it("lets more specific profiles override settings", () => {
    const profile = resolveProfile("de-DE", {
      default: { content: { urls: "skip", acronyms: "spell" } },
      de: { content: { acronyms: "word" } },
      "de-DE": { structure: { paragraphs: { pause: "1s" } } },
    });
    expect(profile.content.urls).toBe("skip");
    expect(profile.content.acronyms).toBe("word");
    expect(profile.structure.paragraphs.pause).toBe(1000);
    // Nothing language-specific is built in: it comes from the profiles.
    expect(profile.structure.lists.ordinals).toEqual([]);
    expect(profile.content.codePlaceholder).toBe("Code snippet.");
  });

  it("puts the most specific lexicon first and drops abbreviations on keep", () => {
    const profile = resolveProfile(
      "de-DE",
      shipped({ "de-DE": { lexicon: [{ match: "KI", say: "Ka I" }] } }),
    );
    expect(profile.lexicon[0]).toEqual({ match: "KI", say: "Ka I" });
    expect(profile.lexicon.some((e) => e.match === "z. B.")).toBe(true);

    const keep = resolveProfile(
      "de-DE",
      shipped({ "de-DE": { content: { abbreviations: "keep" } } }),
    );
    expect(keep.lexicon.some((e) => e.match === "z. B.")).toBe(false);
  });

  it("reads word lists comma-separated, folded over lines, or as YAML lists", () => {
    const folded = parse(
      "voiceProfile: 1\nacronyms:\n  spell: >-\n    IT, API,\n    URL\n",
    ).data!;
    const sequence = parse(
      "voiceProfile: 1\nacronyms:\n  spell:\n    - IT\n    - API\n    - URL\n",
    ).data!;
    for (const layer of [folded, sequence]) {
      expect(resolveProfile("de", { de: layer }).acronyms.spell).toEqual([
        "IT",
        "API",
        "URL",
      ]);
    }
  });

  it("combines the acronyms of every applicable profile", () => {
    const profile = resolveProfile(
      "de-DE",
      shipped({ "de-DE": { acronyms: { spell: "XYZ", say: { AI: "A-I" } } } }),
    );
    expect(profile.acronyms.spell).toEqual(
      expect.arrayContaining(["IT", "KI", "XYZ"]),
    );
    // The more specific profile wins on a word.
    expect(profile.acronyms.say.AI).toBe("A-I");
  });

  it("uses the shipped English, British, German and French profiles", () => {
    const us = resolveProfile("en-US", shipped());
    expect(us.structure.lists.ordinals[0]).toBe("First");
    expect(us.acronyms.say.SQL).toBe("sequel");
    const uk = resolveProfile("en-GB", shipped());
    expect(uk.structure.lists.ordinals[0]).toBe("First"); // from the default
    expect(uk.acronyms.say.SQL).toBe("S-Q-L");
    expect(uk.abbreviations.Mr).toBe("Mister");
    expect(resolveProfile("de-DE", shipped()).structure.lists.ordinals[0]).toBe(
      "Erstens",
    );
    const fr = resolveProfile("fr-FR", shipped());
    expect(fr.structure.lists.ordinals[0]).toBe("Premièrement");
    expect(fr.content.codePlaceholder).toBe("Exemple de code.");
  });

  it("maps a profile onto the pipeline options", () => {
    const config = processorConfigFromProfile(
      resolveProfile("de", {
        de: { content: { codeBlocks: "read", urls: "skip" } },
      }),
    );
    expect(config.removeCodeBlocks).toBe(false);
    expect(config.skipUrls).toBe(true);
    expect(config.joinLineBreaks).toBe(true);
    expect(config.headingBreakTimes?.[0]).toBe(800);
    expect(config.textPauses).toEqual({
      heading: 0.8,
      paragraph: 0.4,
      listItem: 0.2,
    });
  });
});

describe("Pronunciation lexicon Unit", () => {
  it("replaces whole words only, case-sensitively by default", () => {
    const entries = [{ match: "KI", say: "Ka-I" }];
    expect(applyLexicon("Die KI und der KIOSK, ki.", entries)).toBe(
      "Die Ka-I und der KIOSK, ki.",
    );
    expect(
      applyLexicon("Die ki.", [{ ...entries[0], caseSensitive: false }]),
    ).toBe("Die Ka-I.");
  });

  it("matches abbreviations with dots and spaces", () => {
    const entries = [{ match: "z. B.", say: "zum Beispiel" }];
    expect(applyLexicon("Obst, z. B. Äpfel.", entries)).toBe(
      "Obst, zum Beispiel Äpfel.",
    );
  });

  it("keeps the sentence's full stop when asked to", () => {
    const entries = [{ match: "usw.", say: "und so weiter", keepStop: true }];
    expect(applyLexicon("Äpfel usw. Dann", entries)).toBe(
      "Äpfel und so weiter. Dann",
    );
    expect(applyLexicon("Äpfel usw.", entries)).toBe("Äpfel und so weiter.");
    expect(applyLexicon("Äpfel usw. und Birnen", entries)).toBe(
      "Äpfel und so weiter und Birnen",
    );
  });

  it("spells acronyms, plurals included", () => {
    expect(spellOut("API")).toBe("A-P-I");
    expect(spellOut("IoT")).toBe("I-o-T");
    expect(
      applyLexicon("Two APIs and an API.", spelledAcronymEntries(["API"])),
    ).toBe("Two A-P-Is and an A-P-I.");
  });

  it("keeps a sentence's full stop for pairs ending in a dot", () => {
    expect(
      pairEntries({ "etc.": "et cetera.", "e.g.": "for example" }),
    ).toEqual([
      { match: "etc.", say: "et cetera", keepStop: true },
      { match: "e.g.", say: "for example" },
    ]);
  });

  it("does not let one rule rewrite another rule's output", () => {
    const entries = [
      { match: "A", say: "B" },
      { match: "B", say: "C" },
    ];
    expect(applyLexicon("A B", entries)).toBe("B C");
  });
});

describe("Reading language Unit", () => {
  it("prefers the note's lang or language, then the voice", () => {
    expect(readingLanguage("en-US", { lang: "de" })).toBe("de");
    expect(readingLanguage("en-US", { language: "fr-FR" })).toBe("fr-FR");
    expect(readingLanguage("en-US", {})).toBe("en-US");
    expect(readingLanguage(undefined, undefined)).toBe("default");
  });
});

describe("Profile editing Unit", () => {
  const set = (text: string, path: string, value: unknown) =>
    setProfileValue(text, path, value, parseYaml, stringifyYaml);

  it("replaces a YAML value in place, keeping comments", () => {
    const text =
      "voiceProfile: 1\n# mine\ncontent:\n  urls: read  # read | skip\n";
    expect(set(text, "content.urls", "skip")).toBe(
      "voiceProfile: 1\n# mine\ncontent:\n  urls: skip  # read | skip\n",
    );
  });

  it("uncomments a commented-out setting of a template", () => {
    const text = profileTemplate("es");
    const changed = set(text, "content.acronyms", "spell");
    expect(changed).toContain("  acronyms: spell  # word | spell");
    expect(changed).toContain("# Voice speech profile");
    expect(parse(changed).data?.content).toEqual({ acronyms: "spell" });
  });

  it("replaces a folded word list and a map of pairs, keeping other comments", () => {
    const text = profileTemplate("default");
    let changed = set(text, "acronyms.spell", "IT, API, XYZ");
    changed = set(changed, "abbreviations", { "e.g.": "for example" });
    const data = parse(changed).data!;
    expect(data.acronyms).toEqual({
      spell: "IT, API, XYZ",
      say: (parse(text).data!.acronyms as { say: unknown }).say,
    });
    expect(data.abbreviations).toEqual({ "e.g.": "for example" });
    expect(changed).toContain("# Acronyms.");
    expect(changed).toContain("# Pronunciation for special cases");
  });

  it("rewrites the file when the key does not exist yet", () => {
    const changed = set("voiceProfile: 1\n", "content.urls", "skip");
    expect(parseYaml(changed)).toEqual({
      voiceProfile: 1,
      content: { urls: "skip" },
    });
  });

  it("edits JSON as JSON", () => {
    const changed = set('{"voiceProfile": 1}', "content.urls", "skip");
    expect(JSON.parse(changed)).toEqual({
      voiceProfile: 1,
      content: { urls: "skip" },
    });
  });

  it("writes the given values into the shipped default profile", () => {
    const text = profileTemplate("default", {
      "content.codeBlocks": "read",
      "content.urls": "skip",
    });
    expect(parse(text).data?.content).toMatchObject({
      codeBlocks: "read",
      urls: "skip",
    });
    expect(text).toContain("# Acronyms."); // comments kept
  });
});

describe("German reading output Unit", () => {
  // The remark pipeline is ESM-only and doesn't load under Jest, so these
  // build the cleaned mdast by hand (as the other serializer tests do).
  const text = (value: string) => ({ type: "text", value });
  const paragraph = (value: string) => ({
    type: "paragraph",
    children: [text(value)],
  });
  const item = (value: string) => ({
    type: "listItem",
    children: [paragraph(value)],
  });
  const list = (ordered: boolean, ...items: string[]) => ({
    type: "list",
    ordered,
    start: 1,
    children: items.map(item),
  });
  const root = (...children: unknown[]) => ({ type: "root", children }) as Node;

  const read = (tree: Node, layers = {}) => {
    const config = processorConfigFromProfile(
      resolveProfile("de-DE", shipped(layers)),
    );
    return serializeToText(tree, {
      joinLineBreaks: config.joinLineBreaks,
      listItemEnd: config.listItemEnd,
      listNumbering: config.listNumbering,
      ordinals: config.ordinals,
    });
  };

  it("joins wrapped lines so nothing pauses mid-sentence", () => {
    expect(read(root(paragraph("Das Projekt soll\nim Frühjahr enden.")))).toBe(
      "Das Projekt soll im Frühjahr enden.",
    );
  });

  it("announces numbered lists in German and closes items with a stop", () => {
    expect(read(root(list(true, "Kosten senken", "Qualität verbessern")))).toBe(
      "Erstens, Kosten senken.\nZweitens, Qualität verbessern.",
    );
    expect(read(root(list(false, "Planen", "Bauen")))).toBe("Planen.\nBauen.");
  });

  it("follows the profile's choices", () => {
    const tree = root(list(true, "Eins", "Zwei"));
    expect(
      read(tree, {
        "de-DE": {
          structure: { lists: { numbering: "none", itemEnd: "none" } },
        },
      }),
    ).toBe("Eins\nZwei");
    expect(
      read(tree, {
        "de-DE": { structure: { lists: { numbering: "number" } } },
      }),
    ).toBe("1, Eins.\n2, Zwei.");
  });

  it("says German abbreviations and acronyms the German way", () => {
    const { lexicon } = resolveProfile("de-DE", shipped());
    expect(
      applyLexicon(
        "Die KI, z. B. bei Dr. Weber, lernt usw. Danach die IT-APIs.",
        lexicon,
      ),
    ).toBe(
      "Die K-I, zum Beispiel bei Doktor Weber, lernt und so weiter. Danach die I-T-A-P-Is.",
    );
  });
});
