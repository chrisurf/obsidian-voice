import { requestUrl } from "obsidian";
import { OpenAiCompatibleSpeechService } from "../src/service/OpenAiCompatibleSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import {
  CUSTOM_VOICE_GROUP,
  SERVER_VOICE_GROUP,
  mergeModelChoices,
  mergeVoiceCatalog,
  normalizeBaseUrl,
  parseListInput,
  parseModelList,
  parseVoiceList,
} from "../src/service/openAiCompatible";
import {
  DEFAULT_SETTINGS,
  OPENAI_VOICES,
  type VoiceSettings,
} from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

function settings(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    ...DEFAULT_SETTINGS,
    TTS_PROVIDER: "openai-compatible",
    OPENAI_COMPAT_BASE_URL: "https://gateway.example/v1/",
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

describe("Unit Tests - OpenAI-compatible helpers", () => {
  test("normalizes the server URL without appending a version", () => {
    expect(normalizeBaseUrl(" https://openrouter.ai/api/v1/ ")).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(normalizeBaseUrl("http://localhost:8880")).toBe(
      "http://localhost:8880",
    );
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl("openrouter.ai/api/v1")).toBeNull();
    expect(normalizeBaseUrl("ftp://host")).toBeNull();
  });

  test("splits comma- and newline-separated input into unique entries", () => {
    expect(parseListInput(" alloy, nova\nalloy,, af_bella ")).toEqual([
      "alloy",
      "nova",
      "af_bella",
    ]);
    expect(parseListInput("")).toEqual([]);
  });

  describe("parseModelList", () => {
    test("reads the OpenAI shape and lists speech models first", () => {
      expect(
        parseModelList({
          data: [{ id: "whisper-1" }, { id: "gpt-4o" }, { id: "tts-1" }],
        }),
      ).toEqual(["tts-1", "gpt-4o", "whisper-1"]);
    });

    test("keeps only audio-output models when the server declares modalities", () => {
      expect(
        parseModelList({
          data: [
            {
              id: "openai/gpt-4o-mini-tts",
              architecture: { output_modalities: ["audio"] },
            },
            {
              id: "anthropic/claude",
              architecture: { output_modalities: ["text"] },
            },
          ],
        }),
      ).toEqual(["openai/gpt-4o-mini-tts"]);
    });

    test("accepts bare arrays and ignores junk", () => {
      expect(parseModelList(["kokoro", "kokoro", 42, { id: "" }])).toEqual([
        "kokoro",
      ]);
      expect(parseModelList(null)).toEqual([]);
      expect(parseModelList({ unexpected: true })).toEqual([]);
    });
  });

  describe("parseVoiceList", () => {
    test("reads Kokoro-FastAPI's list of voice ids", () => {
      expect(parseVoiceList({ voices: ["af_bella", "am_adam"] })).toEqual([
        {
          id: "af_bella",
          label: "af_bella",
          lang: "",
          group: SERVER_VOICE_GROUP,
        },
        {
          id: "am_adam",
          label: "am_adam",
          lang: "",
          group: SERVER_VOICE_GROUP,
        },
      ]);
    });

    test("reads voice objects with names, languages and genders", () => {
      expect(
        parseVoiceList([
          {
            voice_id: "de-DE-KatjaNeural",
            name: "Katja",
            language: "de-DE",
            gender: "Female",
          },
        ]),
      ).toEqual([
        {
          id: "de-DE-KatjaNeural",
          label: "Katja (Female)",
          lang: "de-DE",
          group: undefined,
        },
      ]);
    });

    test("returns nothing for unknown shapes", () => {
      expect(parseVoiceList({ detail: "Not found" })).toEqual([]);
    });
  });

  test("merges server voices with hand-added ones and falls back when empty", () => {
    const server = parseVoiceList(["af_bella"]);
    const merged = mergeVoiceCatalog(server, ["af_bella", "my_clone"], []);
    expect(merged.map((v) => v.id)).toEqual(["af_bella", "my_clone"]);
    expect(merged[1].group).toBe(CUSTOM_VOICE_GROUP);

    expect(mergeVoiceCatalog([], [], OPENAI_VOICES)).toBe(OPENAI_VOICES);
  });

  test("merges model choices and keeps the selected model", () => {
    expect(mergeModelChoices(["tts-1"], ["kokoro", "tts-1"], "old")).toEqual([
      "tts-1",
      "kokoro",
      "old",
    ]);
    expect(mergeModelChoices([], [], "")).toEqual([]);
  });
});

describe("Unit Tests - OpenAI-compatible Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("is created by the factory as a plain-text provider", () => {
    const provider = createSpeechProvider(settings());
    expect(provider).toBeInstanceOf(OpenAiCompatibleSpeechService);
    expect(provider.inputFormat).toBe("text");
    expect(provider.textPauseStyle).toBe("none");
  });

  test("offers the standard OpenAI voices until the server or user adds some", () => {
    const service = new OpenAiCompatibleSpeechService(settings());
    expect(service.getVoiceOptions()).toBe(OPENAI_VOICES);

    service.updateCredentials(
      settings({
        openaiCompatVoiceCatalog: parseVoiceList(["af_bella"]),
        OPENAI_COMPAT_CUSTOM_VOICES: "my_clone",
      }),
    );
    expect(service.getVoiceOptions().map((v) => v.id)).toEqual([
      "af_bella",
      "my_clone",
    ]);
  });

  describe("Synthesis", () => {
    test("posts to the configured server with the chosen model, voice and format", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });
      const service = new OpenAiCompatibleSpeechService(
        settings({
          OPENAI_COMPAT_API_KEY: "sk-or",
          OPENAI_COMPAT_MODEL: "openai/gpt-4o-mini-tts",
          OPENAI_COMPAT_VOICE: "nova",
        }),
      );

      await service.speak("Hello world.", 1.0, "note.md");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("https://gateway.example/v1/audio/speech");
      expect(call.headers.Authorization).toBe("Bearer sk-or");
      const body = JSON.parse(call.body);
      expect(body).toMatchObject({
        model: "openai/gpt-4o-mini-tts",
        voice: "nova",
        input: "Hello world.",
        response_format: "mp3",
      });
      expect(service.getLastGeneratedAudio("note.md")?.type).toBe("audio/mpeg");
    });

    test("works without an API key and without a model", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });
      const service = new OpenAiCompatibleSpeechService(settings());

      await service.speak("Hello.");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.headers.Authorization).toBeUndefined();
      expect(JSON.parse(call.body).model).toBeUndefined();
    });

    test("requests WAV and joins WAV chunks into one playable file", async () => {
      mockRequestUrl
        .mockResolvedValueOnce({ status: 200, arrayBuffer: wav([1, 2]) })
        .mockResolvedValueOnce({ status: 200, arrayBuffer: wav([3]) });
      const service = new OpenAiCompatibleSpeechService(
        settings({ OPENAI_COMPAT_FORMAT: "wav" }),
      );
      const paragraph = "word ".repeat(300).trim();

      await service.speak([paragraph, paragraph].join("\n\n"), 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.response_format).toBe("wav");
      const blob = service.getLastGeneratedAudio("note.md");
      expect(blob?.type).toBe("audio/wav");
      expect(blob?.size).toBe(44 + 3);
    });

    test("refuses to synthesize without a valid server URL", async () => {
      const service = new OpenAiCompatibleSpeechService(
        settings({ OPENAI_COMPAT_BASE_URL: "" }),
      );
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow(/server URL/);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/server URL/i),
      );
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });
  });

  describe("Connection test", () => {
    test("rejects an invalid URL without a network call", async () => {
      const service = new OpenAiCompatibleSpeechService(
        settings({ OPENAI_COMPAT_BASE_URL: "not a url" }),
      );
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("loads models and the first voice list it finds", async () => {
      mockRequestUrl.mockImplementation(({ url }: { url: string }) => {
        if (url.endsWith("/models")) {
          return Promise.resolve({
            status: 200,
            json: { data: [{ id: "kokoro" }] },
          });
        }
        if (url.endsWith("/audio/voices")) {
          return Promise.resolve({ status: 404, json: {} });
        }
        if (url.endsWith("/audio/speech/voices")) {
          return Promise.resolve({
            status: 200,
            json: [{ voice_id: "af_bella" }],
          });
        }
        return Promise.reject(new Error("unexpected " + url));
      });
      const service = new OpenAiCompatibleSpeechService(settings());

      const result = await service.validateCredentials();

      expect(result.isValid).toBe(true);
      expect(result.models).toEqual(["kokoro"]);
      expect(result.voices?.map((v) => v.id)).toEqual(["af_bella"]);
      expect(result.voiceCount).toBe(1);
      expect(
        mockRequestUrl.mock.calls.some(
          ([req]) => req.url === "https://gateway.example/v1/voices",
        ),
      ).toBe(false);
    });

    test("treats a server without /models as reachable", async () => {
      mockRequestUrl.mockResolvedValue({ status: 404, json: {} });
      const service = new OpenAiCompatibleSpeechService(settings());

      const result = await service.validateCredentials();

      expect(result).toMatchObject({ isValid: true, models: [], voices: [] });
    });

    test("reports a rejected or missing API key", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });

      const withoutKey = await new OpenAiCompatibleSpeechService(
        settings(),
      ).validateCredentials();
      expect(withoutKey).toMatchObject({ isValid: false });
      expect(withoutKey.error).toMatch(/requires an API key/);

      const withKey = await new OpenAiCompatibleSpeechService(
        settings({ OPENAI_COMPAT_API_KEY: "bad" }),
      ).validateCredentials();
      expect(withKey.error).toMatch(/rejected/);
    });

    test("reports an unreachable server", async () => {
      mockRequestUrl.mockRejectedValue(
        new Error("net::ERR_CONNECTION_REFUSED"),
      );
      const service = new OpenAiCompatibleSpeechService(settings());

      const result = await service.validateCredentials();

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/Could not reach/);
    });
  });
});
