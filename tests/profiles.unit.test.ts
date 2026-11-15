import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parseProfile, detectFormat } from "../src/profiles/parse";
import {
  normalizeLanguageKey,
  profileKeysFor,
  resolveProfile,
} from "../src/profiles/resolve";
import { applyLexicon } from "../src/profiles/lexicon";
import { readingLanguage } from "../src/profiles/language";
import { setProfileValue } from "../src/profiles/edit";
import { profileTemplate } from "../src/profiles/template";
import { processorConfigFromProfile } from "../src/profiles/processorConfig";
import { parseDuration, PROFILE_FORMAT_VERSION } from "../src/profiles/schema";
import { serializeToText } from "../src/processors/pipeline/TextSerializer";
import type { Node } from "unist";

const parse = (text: string) => parseProfile(text, parseYaml);

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

  it("accepts a template whose settings are all commented out", () => {
    for (const key of ["default", "de"]) {
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
    // Built-in German data fills what no file sets.
    expect(profile.structure.lists.ordinals[0]).toBe("Erstens");
    expect(profile.content.codePlaceholder).toBe("Codebeispiel.");
  });

  it("puts the most specific lexicon first and drops abbreviations on keep", () => {
    const profile = resolveProfile("de-DE", {
      default: { lexicon: [{ match: "KI", say: "Künstliche Intelligenz" }] },
      "de-DE": { lexicon: [{ match: "KI", say: "Ka I" }] },
    });
    expect(profile.lexicon[0]).toEqual({ match: "KI", say: "Ka I" });
    expect(profile.lexicon.some((e) => e.match === "z. B.")).toBe(true);

    const keep = resolveProfile("de", {
      de: { content: { abbreviations: "keep" } },
    });
    expect(keep.lexicon.some((e) => e.match === "z. B.")).toBe(false);
  });

  it("uses English data for English voices and none for unknown languages", () => {
    expect(resolveProfile("en-US", {}).structure.lists.ordinals[0]).toBe(
      "First",
    );
    expect(resolveProfile("default", {}).structure.lists.ordinals).toEqual([]);
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

  it("uncomments a commented-out setting of the template", () => {
    const text = profileTemplate("default");
    const changed = set(text, "content.acronyms", "spell");
    expect(changed).toContain("  acronyms: spell  # word | spell");
    expect(changed).toContain("# Voice speech profile");
    expect(parse(changed).data?.content).toEqual({ acronyms: "spell" });
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

  it("writes the given values into a new default template", () => {
    const text = profileTemplate("default", {
      "content.codeBlocks": "read",
      "content.urls": "skip",
    });
    expect(parse(text).data?.content).toEqual({
      codeBlocks: "read",
      urls: "skip",
    });
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
    const config = processorConfigFromProfile(resolveProfile("de-DE", layers));
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
        de: { structure: { lists: { numbering: "none", itemEnd: "none" } } },
      }),
    ).toBe("Eins\nZwei");
    expect(
      read(tree, { de: { structure: { lists: { numbering: "number" } } } }),
    ).toBe("1, Eins.\n2, Zwei.");
  });

  it("says German abbreviations and acronyms the German way", () => {
    const { lexicon } = resolveProfile("de-DE", {});
    expect(
      applyLexicon(
        "Die KI, z. B. bei Dr. Weber, lernt usw. Danach Pause.",
        lexicon,
      ),
    ).toBe(
      "Die Ka-I, zum Beispiel bei Doktor Weber, lernt und so weiter. Danach Pause.",
    );
  });
});
