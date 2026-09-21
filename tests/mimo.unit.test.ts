import { requestUrl } from "obsidian";
import {
  base64ToBytes,
  buildMimoMessages,
  extractMimoAudio,
  mimoEndpoint,
  mimoErrorMessageFrom,
} from "../src/service/mimoAudio";
import { MimoSpeechService } from "../src/service/MimoSpeechService";

const mockRequestUrl = requestUrl as jest.Mock;

/** Three bytes as standard base64 — used as fake MP3 payload. */
const SAMPLE_BYTES = [0xff, 0xfb, 0x90];
const SAMPLE_B64 = Buffer.from(SAMPLE_BYTES).toString("base64");

function audioResponse(data = SAMPLE_B64) {
  return {
    status: 200,
    json: {
      choices: [
        {
          finish_reason: "stop",
          message: { audio: { data, format: "mp3" } },
        },
      ],
    },
  };
}

describe("Unit Tests - MiMo audio helpers", () => {
  describe("base64ToBytes", () => {
    test("decodes standard base64 into bytes", () => {
      expect(Array.from(base64ToBytes(SAMPLE_B64))).toEqual(SAMPLE_BYTES);
    });

    test("strips whitespace and a data-URL prefix", () => {
      const wrapped = `data:audio/mpeg;base64, ${SAMPLE_B64}\n`;
      expect(Array.from(base64ToBytes(wrapped))).toEqual(SAMPLE_BYTES);
    });

    test("throws on empty input", () => {
      expect(() => base64ToBytes("   ")).toThrow(/empty/i);
    });

    test("throws on malformed base64", () => {
      expect(() => base64ToBytes("@@@")).toThrow(/invalid/i);
    });
  });

  describe("buildMimoMessages", () => {
    test("sends only the assistant message when style is empty", () => {
      expect(buildMimoMessages("Hello.")).toEqual([
        { role: "assistant", content: "Hello." },
      ]);
      expect(buildMimoMessages("Hello.", "  ")).toEqual([
        { role: "assistant", content: "Hello." },
      ]);
    });

    test("puts the style in user and the text in assistant", () => {
      expect(buildMimoMessages("Hello.", "  Warm narrator  ")).toEqual([
        { role: "user", content: "Warm narrator" },
        { role: "assistant", content: "Hello." },
      ]);
    });
  });

  describe("mimoEndpoint", () => {
    test("builds the chat-completions URL from a host", () => {
      expect(mimoEndpoint("api.xiaomimimo.com")).toBe(
        "https://api.xiaomimimo.com/v1/chat/completions",
      );
    });

    test("falls back to the pay-as-you-go host", () => {
      expect(mimoEndpoint("")).toBe(
        "https://api.xiaomimimo.com/v1/chat/completions",
      );
    });

    test("strips a trailing slash on the host", () => {
      expect(mimoEndpoint("token-plan-cn.xiaomimimo.com/")).toBe(
        "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
      );
    });
  });

  describe("extractMimoAudio", () => {
    test("returns decoded bytes from choices[0].message.audio.data", () => {
      const result = extractMimoAudio({
        choices: [{ message: { audio: { data: SAMPLE_B64 } } }],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.from(result.bytes)).toEqual(SAMPLE_BYTES);
      }
    });

    test("surfaces an OpenAI-style error object", () => {
      const result = extractMimoAudio({
        error: { message: "invalid api key", type: "invalid_request_error" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/invalid api key/i);
      }
    });

    test("maps a content-filter finish_reason", () => {
      const result = extractMimoAudio({
        choices: [{ finish_reason: "content_filter" }],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/content filter/i);
      }
    });

    test("fails when audio data is missing", () => {
      const result = extractMimoAudio({ choices: [{ message: {} }] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/no audio/i);
      }
    });
  });

  describe("mimoErrorMessageFrom", () => {
    test("reads a string error", () => {
      expect(mimoErrorMessageFrom({ error: "nope" })).toBe("nope");
    });

    test("returns empty when there is no error", () => {
      expect(mimoErrorMessageFrom({})).toBe("");
    });
  });
});

describe("Unit Tests - MiMo Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("declares the plain-text input format and a non-empty voice catalog", () => {
    const service = new MimoSpeechService(
      "key",
      "茉莉",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    expect(service.inputFormat).toBe("text");
    expect(service.textPauseStyle).toBe("none");
    expect(service.getVoiceOptions().length).toBeGreaterThan(0);
    expect(service.getVoiceOptions().some((v) => v.id === "冰糖")).toBe(true);
  });

  test("rejects a missing key without a network call", async () => {
    const service = new MimoSpeechService(
      "",
      "mimo_default",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    const result = await service.validateCredentials();
    expect(result.isValid).toBe(false);
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  test("synthesizes: correct endpoint, auth, body, and base64 decode", async () => {
    mockRequestUrl.mockResolvedValue(audioResponse());

    const service = new MimoSpeechService(
      "my-key",
      "茉莉",
      "token-plan-cn.xiaomimimo.com",
      "Warm narrator",
      1.0,
    );
    await service.speak("Hello world.", 1.0, "note.md");

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    const call = mockRequestUrl.mock.calls[0][0];
    expect(call.url).toBe(
      "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
    );
    expect(call.method).toBe("POST");
    expect(call.headers["api-key"]).toBe("my-key");
    expect(call.headers.Authorization).toBe("Bearer my-key");
    const body = JSON.parse(call.body);
    expect(body.model).toBe("mimo-v2.5-tts");
    expect(body.audio.format).toBe("mp3");
    expect(body.audio.voice).toBe("茉莉");
    expect(body.messages).toEqual([
      { role: "user", content: "Warm narrator" },
      { role: "assistant", content: "Hello world." },
    ]);

    expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
  });

  test("omits the user message when style is empty", async () => {
    mockRequestUrl.mockResolvedValue(audioResponse());
    const service = new MimoSpeechService(
      "key",
      "mimo_default",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    await service.speak("Hi.");
    const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(body.messages).toEqual([{ role: "assistant", content: "Hi." }]);
  });

  test("repeats the style instruction on every chunk", async () => {
    mockRequestUrl.mockResolvedValue(audioResponse());
    const service = new MimoSpeechService(
      "key",
      "mimo_default",
      "api.xiaomimimo.com",
      "Gentle",
      1.0,
    );
    const long = `${"Paragraph.\n\n".repeat(400)}End.`;
    await service.speak(long);

    expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    for (const [args] of mockRequestUrl.mock.calls) {
      const body = JSON.parse(args.body);
      expect(body.messages[0]).toEqual({ role: "user", content: "Gentle" });
      expect(body.messages[1].role).toBe("assistant");
    }
  });

  test("throws and reports when the API key is missing", async () => {
    const service = new MimoSpeechService(
      "",
      "mimo_default",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    const errorCallback = jest.fn();
    service.setErrorCallback(errorCallback);

    await expect(service.speak("Hello")).rejects.toThrow();
    expect(errorCallback).toHaveBeenCalled();
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  test("surfaces HTTP 401 as an invalid key", async () => {
    mockRequestUrl.mockResolvedValue({ status: 401, json: {} });
    const service = new MimoSpeechService(
      "bad",
      "mimo_default",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    const errorCallback = jest.fn();
    service.setErrorCallback(errorCallback);

    await expect(service.speak("Hello")).rejects.toThrow(/401/);
    expect(errorCallback).toHaveBeenCalled();
  });

  test("validates via a minimal probe that returns audio", async () => {
    mockRequestUrl.mockResolvedValue(audioResponse());
    const service = new MimoSpeechService(
      "key",
      "mimo_default",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    const result = await service.validateCredentials();
    expect(result.isValid).toBe(true);
    expect(result.voiceCount).toBe(service.getVoiceOptions().length);

    const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(body.messages).toEqual([{ role: "assistant", content: "." }]);
  });

  test("splits a long note into playlist sections and caches the joined audio", async () => {
    mockRequestUrl.mockResolvedValue(audioResponse());
    const service = new MimoSpeechService(
      "key",
      "mimo_default",
      "api.xiaomimimo.com",
      "",
      1.0,
    );
    const long = `${"Paragraph.\n\n".repeat(80)}End.`;
    await service.speak(long, 1.0, "note.md");

    expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    const sections = service.getNoteSections();
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((s) => s.ready)).toBe(true);
    expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
  });

  test("is created by the factory when TTS_PROVIDER is mimo", async () => {
    const { createSpeechProvider } =
      await import("../src/service/SpeechProviderFactory");
    const { DEFAULT_SETTINGS } = await import("../src/settings/VoiceSettings");
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "mimo",
      MIMO_API_KEY: "k",
    });
    expect(provider).toBeInstanceOf(MimoSpeechService);
    expect(provider.inputFormat).toBe("text");
  });
});
