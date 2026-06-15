import { requestUrl } from "obsidian";
import { ElevenLabsService } from "../src/service/ElevenLabsService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - ElevenLabs Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("declares the plain-text input format", () => {
      const service = new ElevenLabsService("key", "voice", "model", 1.0);
      expect(service.inputFormat).toBe("text");
    });

    test("exposes a non-empty voice catalog", () => {
      const service = new ElevenLabsService("key", "voice", "model", 1.0);
      expect(service.getVoiceOptions().length).toBeGreaterThan(0);
    });
  });

  describe("Credential validation", () => {
    test("rejects an empty API key without a network call", async () => {
      const service = new ElevenLabsService("", "voice", "model", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("reports voice count on a successful response", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { voices: [{ voice_id: "a" }, { voice_id: "b" }] },
      });
      const service = new ElevenLabsService("key", "voice", "model", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(2);
    });

    test("treats HTTP 401 as an invalid key", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const service = new ElevenLabsService("bad", "voice", "model", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });
  });

  describe("Synthesis", () => {
    test("calls the TTS endpoint with the right URL, headers and body", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new ElevenLabsService(
        "my-key",
        "voice-123",
        "eleven_multilingual_v2",
        1.0,
      );
      await service.speak("Hello world.", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toContain("/v1/text-to-speech/voice-123");
      expect(call.method).toBe("POST");
      expect(call.headers["xi-api-key"]).toBe("my-key");
      const body = JSON.parse(call.body);
      expect(body.text).toBe("Hello world.");
      expect(body.model_id).toBe("eleven_multilingual_v2");

      // Audio should be cached for the active note (download support)
      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("chunks long text into multiple requests", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      // Three paragraphs of ~2000 chars each → exceeds the 3000 char chunk size
      const paragraph = "word ".repeat(400).trim(); // ~2000 chars
      const longText = [paragraph, paragraph, paragraph].join("\n\n");

      const service = new ElevenLabsService("key", "voice", "model", 1.0);
      await service.speak(longText);

      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    });

    test("throws and reports an error when the API key is missing", async () => {
      const service = new ElevenLabsService("", "voice", "model", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("surfaces a friendly message on HTTP 401 during synthesis", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const service = new ElevenLabsService("bad", "voice", "model", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/invalid/i),
      );
    });
  });
});

describe("Unit Tests - Speech Provider Factory", () => {
  test("creates an SSML provider for AWS Polly", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "polly",
    });
    expect(provider.inputFormat).toBe("ssml");
    expect(provider.getVoiceOptions().some((v) => v.id === "Stephen")).toBe(
      true,
    );
  });

  test("creates a text provider for ElevenLabs", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "elevenlabs",
    });
    expect(provider.inputFormat).toBe("text");
    expect(
      provider.getVoiceOptions().some((v) => v.id === "21m00Tcm4TlvDq8ikWAM"),
    ).toBe(true);
  });
});
