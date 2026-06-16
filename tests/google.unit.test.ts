import { requestUrl } from "obsidian";
import { GoogleTtsService } from "../src/service/GoogleTtsService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - Google Cloud TTS Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("uses the SSML input format (native pauses/emphasis)", () => {
      const service = new GoogleTtsService("key", "en-US-Neural2-C", 1.0);
      expect(service.inputFormat).toBe("ssml");
    });

    test("exposes a non-empty voice catalog", () => {
      const service = new GoogleTtsService("key", "en-US-Neural2-C", 1.0);
      expect(service.getVoiceOptions().length).toBeGreaterThan(0);
    });
  });

  describe("Credential validation", () => {
    test("rejects an empty API key without a network call", async () => {
      const service = new GoogleTtsService("", "en-US-Neural2-C", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("reports voice count on a successful response", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { voices: [{ name: "a" }, { name: "b" }, { name: "c" }] },
      });
      const service = new GoogleTtsService("key", "en-US-Neural2-C", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(3);
    });

    test("treats HTTP 403 as an invalid/unauthorized key", async () => {
      mockRequestUrl.mockResolvedValue({ status: 403, json: {} });
      const service = new GoogleTtsService("bad", "en-US-Neural2-C", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
    });
  });

  describe("Synthesis", () => {
    test("calls text:synthesize with the right URL, header and body", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { audioContent: "AQID" }, // bytes [1,2,3]
      });

      const service = new GoogleTtsService("my-key", "de-DE-Neural2-B", 1.0);
      await service.speak("<speak>Hallo Welt.</speak>", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toContain("/v1/text:synthesize");
      expect(call.method).toBe("POST");
      expect(call.headers["X-Goog-Api-Key"]).toBe("my-key");

      const body = JSON.parse(call.body);
      expect(body.input.ssml).toContain("<speak>");
      expect(body.voice.name).toBe("de-DE-Neural2-B");
      // languageCode derived from the voice name's first two segments
      expect(body.voice.languageCode).toBe("de-DE");
      expect(body.audioConfig.audioEncoding).toBe("MP3");

      // Audio cached for the active note (download support)
      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("normalizes Polly say-as 'number' to Google 'cardinal'", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { audioContent: "AQID" },
      });

      const service = new GoogleTtsService("key", "en-US-Neural2-C", 1.0);
      await service.speak(
        '<speak><say-as interpret-as="number">123</say-as></speak>',
      );

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.input.ssml).toContain('interpret-as="cardinal"');
      expect(body.input.ssml).not.toContain('interpret-as="number"');
    });

    test("throws and reports an error when the API key is missing", async () => {
      const service = new GoogleTtsService("", "en-US-Neural2-C", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("<speak>Hi</speak>")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("surfaces a friendly message on HTTP 403 during synthesis", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 403,
        json: { error: { message: "PERMISSION_DENIED" } },
      });
      const service = new GoogleTtsService("bad", "en-US-Neural2-C", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("<speak>Hi</speak>")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/invalid|not enabled/i),
      );
    });
  });
});

describe("Unit Tests - Speech Provider Factory (Google)", () => {
  test("creates an SSML provider for Google Cloud", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "google",
    });
    expect(provider.inputFormat).toBe("ssml");
    expect(
      provider.getVoiceOptions().some((v) => v.id === "en-US-Neural2-C"),
    ).toBe(true);
  });
});
