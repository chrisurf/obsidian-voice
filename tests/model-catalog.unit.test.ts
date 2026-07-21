import {
  mapOpenAiModels,
  normalizeBaseUrl,
  reconcileModel,
} from "../src/service/modelCatalog";

describe("Unit Tests - Model catalog helpers", () => {
  describe("normalizeBaseUrl", () => {
    test("returns empty string for blank input", () => {
      expect(normalizeBaseUrl("")).toBe("");
      expect(normalizeBaseUrl("   ")).toBe("");
      expect(normalizeBaseUrl(undefined)).toBe("");
    });

    test("trims whitespace and strips trailing slashes", () => {
      expect(normalizeBaseUrl("  https://tts.example.com/v1  ")).toBe(
        "https://tts.example.com/v1",
      );
      expect(normalizeBaseUrl("https://tts.example.com/v1/")).toBe(
        "https://tts.example.com/v1",
      );
      expect(normalizeBaseUrl("https://tts.example.com/v1///")).toBe(
        "https://tts.example.com/v1",
      );
    });

    test("leaves a clean URL untouched", () => {
      expect(normalizeBaseUrl("http://192.168.1.10:8880/v1")).toBe(
        "http://192.168.1.10:8880/v1",
      );
    });

    test("treats the official OpenAI URL the same as blank", () => {
      expect(normalizeBaseUrl("https://api.openai.com/v1")).toBe("");
      expect(normalizeBaseUrl(" https://api.openai.com/v1/ ")).toBe("");
    });
  });

  describe("reconcileModel", () => {
    const catalog = [
      { id: "kokoro", label: "kokoro" },
      { id: "piper", label: "piper" },
    ];

    test("keeps the current model when the catalog offers it", () => {
      expect(reconcileModel("piper", catalog)).toBe("piper");
    });

    test("falls back to the catalog's first model otherwise", () => {
      expect(reconcileModel("gpt-4o-mini-tts", catalog)).toBe("kokoro");
    });

    test("keeps the current model when the catalog is empty", () => {
      expect(reconcileModel("gpt-4o-mini-tts", [])).toBe("gpt-4o-mini-tts");
    });
  });

  describe("mapOpenAiModels", () => {
    test("maps the standard /models list shape", () => {
      const models = mapOpenAiModels({
        object: "list",
        data: [
          { id: "kokoro", object: "model", created: 1, owned_by: "donkeywork" },
        ],
      });
      expect(models).toEqual([{ id: "kokoro", label: "kokoro" }]);
    });

    test("sorts alphabetically and removes duplicates", () => {
      const models = mapOpenAiModels({
        data: [{ id: "tts-b" }, { id: "tts-a" }, { id: "tts-b" }],
      });
      expect(models.map((m) => m.id)).toEqual(["tts-a", "tts-b"]);
    });

    test("drops entries without a usable string id", () => {
      const models = mapOpenAiModels({
        data: [{ id: "ok" }, { id: 42 }, { id: "  " }, {}, null, "kokoro"],
      });
      expect(models).toEqual([{ id: "ok", label: "ok" }]);
    });

    test("returns [] for malformed payloads", () => {
      expect(mapOpenAiModels(null)).toEqual([]);
      expect(mapOpenAiModels(undefined)).toEqual([]);
      expect(mapOpenAiModels("nope")).toEqual([]);
      expect(mapOpenAiModels({})).toEqual([]);
      expect(mapOpenAiModels({ data: "nope" })).toEqual([]);
    });
  });
});
