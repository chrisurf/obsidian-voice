import { requestUrl } from "obsidian";
import {
  hexToBytes,
  extractT2AAudio,
  minimaxErrorMessage,
} from "../src/service/minimaxAudio";
import { MiniMaxSpeechService } from "../src/service/MiniMaxSpeechService";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - MiniMax audio helpers", () => {
  describe("hexToBytes", () => {
    test("decodes a lowercase hex string into bytes", () => {
      const bytes = hexToBytes("fffb90");
      expect(Array.from(bytes)).toEqual([0xff, 0xfb, 0x90]);
    });

    test("is case-insensitive and trims whitespace", () => {
      const bytes = hexToBytes("  00FF1a\n");
      expect(Array.from(bytes)).toEqual([0x00, 0xff, 0x1a]);
    });

    test("throws on odd-length input", () => {
      expect(() => hexToBytes("abc")).toThrow(/odd length/i);
    });

    test("throws on non-hex characters", () => {
      expect(() => hexToBytes("zz")).toThrow(/non-hex/i);
    });
  });

  describe("extractT2AAudio", () => {
    test("returns decoded bytes on success (status_code 0)", () => {
      const result = extractT2AAudio({
        data: { audio: "fffb90", status: 2 },
        base_resp: { status_code: 0, status_msg: "success" },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.from(result.bytes)).toEqual([0xff, 0xfb, 0x90]);
      }
    });

    test("succeeds when base_resp is absent but audio is present", () => {
      const result = extractT2AAudio({ data: { audio: "00" } });
      expect(result.ok).toBe(true);
    });

    test("maps an auth failure (1004) to a helpful message", () => {
      const result = extractT2AAudio({
        base_resp: { status_code: 1004, status_msg: "invalid api key" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/API key and Group ID/i);
      }
    });

    test("reports empty audio", () => {
      const result = extractT2AAudio({
        data: { audio: "" },
        base_resp: { status_code: 0 },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/no audio/i);
      }
    });

    test("reports malformed hex", () => {
      const result = extractT2AAudio({
        data: { audio: "xyz" },
        base_resp: { status_code: 0 },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("minimaxErrorMessage", () => {
    test("has dedicated messages for known codes", () => {
      expect(minimaxErrorMessage(1002)).toMatch(/rate limit/i);
      expect(minimaxErrorMessage(1008)).toMatch(/balance/i);
    });

    test("falls back to code + message for unknown codes", () => {
      expect(minimaxErrorMessage(9999, "boom")).toMatch(/9999.*boom/i);
    });
  });
});

describe("Unit Tests - MiniMax Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("declares the plain-text input format and a non-empty voice catalog", () => {
    const service = new MiniMaxSpeechService(
      "key",
      "group",
      "Wise_Woman",
      "speech-02-hd",
      "api.minimax.io",
      1.0,
    );
    expect(service.inputFormat).toBe("text");
    expect(service.getVoiceOptions().length).toBeGreaterThan(0);
  });

  test("rejects missing key/Group ID without a network call", async () => {
    const service = new MiniMaxSpeechService(
      "",
      "",
      "Wise_Woman",
      "speech-02-hd",
      "api.minimax.io",
      1.0,
    );
    const result = await service.validateCredentials();
    expect(result.isValid).toBe(false);
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  test("synthesizes: correct endpoint (GroupId query), auth, body, and hex decode", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        data: { audio: "fffb90", status: 2 },
        base_resp: { status_code: 0, status_msg: "success" },
      },
    });

    const service = new MiniMaxSpeechService(
      "my-key",
      "my-group",
      "male-qn-qingse",
      "speech-02-turbo",
      "api.minimaxi.chat",
      1.0,
    );
    await service.speak("Hello world.", 1.0, "note.md");

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    const call = mockRequestUrl.mock.calls[0][0];
    expect(call.url).toBe(
      "https://api.minimaxi.chat/v1/t2a_v2?GroupId=my-group",
    );
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe("Bearer my-key");
    const body = JSON.parse(call.body);
    expect(body.text).toBe("Hello world.");
    expect(body.model).toBe("speech-02-turbo");
    expect(body.output_format).toBe("hex");
    expect(body.voice_setting.voice_id).toBe("male-qn-qingse");
    expect(body.audio_setting.format).toBe("mp3");

    // Audio should be cached for the active note (download support)
    expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
  });

  test("throws and reports when credentials are missing", async () => {
    const service = new MiniMaxSpeechService(
      "",
      "",
      "Wise_Woman",
      "speech-02-hd",
      "api.minimax.io",
      1.0,
    );
    const errorCallback = jest.fn();
    service.setErrorCallback(errorCallback);

    await expect(service.speak("Hello")).rejects.toThrow();
    expect(errorCallback).toHaveBeenCalled();
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  test("surfaces a MiniMax logical error (base_resp status_code)", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { base_resp: { status_code: 1004, status_msg: "auth failed" } },
    });
    const service = new MiniMaxSpeechService(
      "bad",
      "group",
      "Wise_Woman",
      "speech-02-hd",
      "api.minimax.io",
      1.0,
    );
    const errorCallback = jest.fn();
    service.setErrorCallback(errorCallback);

    await expect(service.speak("Hello")).rejects.toThrow();
    expect(errorCallback).toHaveBeenCalled();
  });

  test("validates via a minimal probe on status_code 0", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        data: { audio: "00", status: 2 },
        base_resp: { status_code: 0 },
      },
    });
    const service = new MiniMaxSpeechService(
      "key",
      "group",
      "Wise_Woman",
      "speech-02-hd",
      "api.minimax.io",
      1.0,
    );
    const result = await service.validateCredentials();
    expect(result.isValid).toBe(true);
    expect(result.voiceCount).toBe(service.getVoiceOptions().length);
  });

  test("is created by the factory when TTS_PROVIDER is minimax", async () => {
    const { createSpeechProvider } =
      await import("../src/service/SpeechProviderFactory");
    const { DEFAULT_SETTINGS } = await import("../src/settings/VoiceSettings");
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "minimax",
      MINIMAX_API_KEY: "k",
      MINIMAX_GROUP_ID: "g",
    });
    expect(provider).toBeInstanceOf(MiniMaxSpeechService);
    expect(provider.inputFormat).toBe("text");
  });
});
