import { requestUrl } from "obsidian";
import { OpenRouterSpeechService } from "../src/service/OpenRouterSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_MODELS_PATH,
  OPENROUTER_VOICE_GROUP,
  parseOpenRouterModels,
  reconcileOpenRouterModel,
  voicesForModel,
} from "../src/service/openRouter";
import {
  DEFAULT_SETTINGS,
  OPENAI_VOICES,
  type VoiceSettings,
} from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

function settings(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    ...DEFAULT_SETTINGS,
    TTS_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "sk-or-test",
    ...overrides,
  };
}

/** A tiny WAV file (header + data bytes). */
function wav(samples: number[]): ArrayBuffer {
  const out = new Uint8Array(44 + samples.length);
  const view = new DataView(out.buffer);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => (out[offset + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  text(36, "data");
  view.setUint32(40, samples.length, true);
  out.set(samples, 44);
  return out.buffer;
}

/** A realistic sample of OpenRouter's /models/user speech catalog. */
function catalogResponse() {
  return {
    data: [
      {
        id: "openai/gpt-4o-mini-tts",
        name: "OpenAI: GPT-4o Mini TTS",
        supported_voices: ["alloy", "nova", "echo"],
      },
      {
        id: "deepgram/flux-tts:free",
        name: "Deepgram: Flux TTS (free)",
        supported_voices: ["flux-alexis-en", "flux-bree-en"],
      },
      {
        id: "google/gemini-3.1-flash-tts-preview",
        name: "Google: Gemini 3.1 Flash TTS Preview",
        supported_voices: ["Zephyr"],
      },
      {
        id: "sesame/csm-1b",
        name: "Sesame: CSM 1B",
        supported_voices: ["conversational_a"],
      },
      {
        id: "canopylabs/orpheus-3b-0.1-ft",
        name: "Canopy Labs: Orpheus 3B",
        supported_voices: ["tara"],
      },
      {
        id: "fish-audio/s1",
        name: "Fish Audio: S1",
        supported_voices: null,
      },
      { id: "openai/gpt-4o-mini-tts", name: "duplicate", supported_voices: [] },
      { id: 42, name: "junk" },
    ],
  };
}

describe("Unit Tests - OpenRouter helpers", () => {
  test("parses models, each carrying its own voices", () => {
    const models = parseOpenRouterModels(catalogResponse());
    expect(models.map((m) => m.id)).toEqual([
      "openai/gpt-4o-mini-tts",
      "deepgram/flux-tts:free",
      "fish-audio/s1",
    ]);
    expect(models[0].name).toBe("OpenAI: GPT-4o Mini TTS");
    expect(models[0].voices.map((v) => v.id)).toEqual([
      "alloy",
      "nova",
      "echo",
    ]);
    expect(models[0].voices[0].group).toBe(OPENROUTER_VOICE_GROUP);
    // A model with no supported_voices keeps an empty voice list.
    expect(models[2].voices).toEqual([]);
  });

  test("drops excluded models (PCM-only gemini + input-capped sesame/orpheus)", () => {
    const models = parseOpenRouterModels(catalogResponse());
    for (const bad of [
      "google/gemini-3.1-flash-tts-preview",
      "sesame/csm-1b",
      "canopylabs/orpheus-3b-0.1-ft",
    ]) {
      expect(models.some((m) => m.id === bad)).toBe(false);
    }
  });

  test("voicesForModel returns the selected model's voices and falls back", () => {
    const models = parseOpenRouterModels(catalogResponse());
    expect(
      voicesForModel(models, "openai/gpt-4o-mini-tts", []).map((v) => v.id),
    ).toEqual(["alloy", "nova", "echo"]);
    // A model with no voices, or an unknown model, falls back.
    expect(voicesForModel(models, "fish-audio/s1", OPENAI_VOICES)).toBe(
      OPENAI_VOICES,
    );
    expect(voicesForModel(models, "missing/model", OPENAI_VOICES)).toBe(
      OPENAI_VOICES,
    );
  });

  test("reconcileOpenRouterModel keeps a listed model else picks the first", () => {
    const models = parseOpenRouterModels(catalogResponse());
    expect(reconcileOpenRouterModel("deepgram/flux-tts:free", models)).toBe(
      "deepgram/flux-tts:free",
    );
    expect(reconcileOpenRouterModel("stale/model", models)).toBe(
      "openai/gpt-4o-mini-tts",
    );
    expect(reconcileOpenRouterModel("", models)).toBe("openai/gpt-4o-mini-tts");
    expect(reconcileOpenRouterModel("kept", [])).toBe("kept");
  });
});

describe("Unit Tests - OpenRouter Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("is created by the factory as a plain-text provider", () => {
    const provider = createSpeechProvider(settings());
    expect(provider).toBeInstanceOf(OpenRouterSpeechService);
    expect(provider.inputFormat).toBe("text");
    expect(provider.textPauseStyle).toBe("none");
  });

  test("offers the selected model's voices after the catalog is loaded", () => {
    const models = parseOpenRouterModels(catalogResponse());
    const service = new OpenRouterSpeechService(
      settings({
        OPENROUTER_MODEL: "deepgram/flux-tts:free",
        openrouterModelCatalog: models,
      }),
    );
    expect(service.getVoiceOptions().map((v) => v.id)).toEqual([
      "flux-alexis-en",
      "flux-bree-en",
    ]);
    // Before any catalog, the standard OpenAI voices are the fallback.
    const empty = new OpenRouterSpeechService(settings());
    expect(empty.getVoiceOptions()).toBe(OPENAI_VOICES);
  });

  test("falls back to the model's first voice when the saved voice is empty or invalid", () => {
    const models = parseOpenRouterModels(catalogResponse());
    // Sesame-style model: requires an explicit voice.
    const empty = new OpenRouterSpeechService(
      settings({
        OPENROUTER_MODEL: "openai/gpt-4o-mini-tts",
        openrouterModelCatalog: models,
      }),
    );
    expect(empty.getVoice()).toBe("alloy"); // first supported voice, not ""

    // A stale/invalid saved voice also repairs onto the model's first.
    const stale = new OpenRouterSpeechService(
      settings({
        OPENROUTER_MODEL: "openai/gpt-4o-mini-tts",
        OPENROUTER_VOICE: "not-a-real-voice",
        openrouterModelCatalog: models,
      }),
    );
    expect(stale.getVoice()).toBe("alloy");
  });

  describe("Synthesis", () => {
    test("posts to OpenRouter's fixed /audio/speech with model and voice", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });
      const service = new OpenRouterSpeechService(
        settings({
          OPENROUTER_MODEL: "openai/gpt-4o-mini-tts",
          OPENROUTER_VOICE: "nova",
        }),
      );

      await service.speak("Hello world.", 1.0, "note.md");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe(`${OPENROUTER_BASE_URL}/audio/speech`);
      expect(call.headers.Authorization).toBe("Bearer sk-or-test");
      const body = JSON.parse(call.body);
      expect(body).toMatchObject({
        model: "openai/gpt-4o-mini-tts",
        voice: "nova",
        input: "Hello world.",
        response_format: "mp3",
      });
      expect(service.getLastGeneratedAudio("note.md")?.type).toBe("audio/mpeg");
    });

    test("refuses to synthesize without an API key", async () => {
      const service = new OpenRouterSpeechService(
        settings({ OPENROUTER_API_KEY: "" }),
      );
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow(/API key/);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/API key/i),
      );
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("joins WAV chunks across long notes", async () => {
      mockRequestUrl
        .mockResolvedValueOnce({ status: 200, arrayBuffer: wav([1, 2]) })
        .mockResolvedValueOnce({ status: 200, arrayBuffer: wav([3]) });
      const service = new OpenRouterSpeechService(settings());
      const paragraph = "word ".repeat(300).trim();

      await service.speak([paragraph, paragraph].join("\n\n"), 1.0, "note.md");

      // Two chunks were sent and the pieces joined into one playable blob.
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });
  });

  describe("Connection test", () => {
    test("loads the catalog and returns models + modelCatalog", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: catalogResponse(),
      });
      const service = new OpenRouterSpeechService(settings());

      const result = await service.validateCredentials();

      expect(result.isValid).toBe(true);
      expect(result.models).toEqual([
        "openai/gpt-4o-mini-tts",
        "deepgram/flux-tts:free",
        "fish-audio/s1",
      ]);
      expect(result.modelCatalog?.length).toBe(3);
      expect(mockRequestUrl.mock.calls[0][0].url).toBe(
        `${OPENROUTER_BASE_URL}${OPENROUTER_MODELS_PATH}`,
      );
    });

    test("rejects a missing API key without a network call", async () => {
      const service = new OpenRouterSpeechService(
        settings({ OPENROUTER_API_KEY: "" }),
      );
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("reports a rejected key", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const result = await new OpenRouterSpeechService(
        settings(),
      ).validateCredentials();
      expect(result).toMatchObject({ isValid: false });
      expect(result.error).toMatch(/rejected/);
    });

    test("reports a 200 with no speech models", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, json: { data: [] } });
      const result = await new OpenRouterSpeechService(
        settings(),
      ).validateCredentials();
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/listed no speech models/);
    });

    test("reports an unreachable host", async () => {
      mockRequestUrl.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
      const result = await new OpenRouterSpeechService(
        settings(),
      ).validateCredentials();
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/Could not reach OpenRouter/);
    });
  });
});
