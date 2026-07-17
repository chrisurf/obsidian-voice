import { requestUrl } from "obsidian";
import { KokoroSpeechService } from "../src/service/KokoroSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - Kokoro Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("declares the plain-text input format and no break-tag support", () => {
      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
        1.0,
      );
      expect(service.inputFormat).toBe("text");
      expect(service.supportsBreakTags).toBe(false);
    });

    test("exposes a non-empty voice catalog", () => {
      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      expect(service.getVoiceOptions().length).toBeGreaterThan(0);
    });
  });

  describe("Credential validation", () => {
    test("probes /v1/models and reports the voice count when reachable", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { data: [{ id: "kokoro" }] },
      });

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(service.getVoiceOptions().length);

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("http://localhost:8880/v1/models");
      expect(call.method).toBe("GET");
    });

    test("reports an error when the endpoint returns 404", async () => {
      mockRequestUrl.mockResolvedValue({ status: 404 });

      const service = new KokoroSpeechService(
        "http://localhost:9999",
        "pm_alex",
        "kokoro",
        "p",
      );
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    test("reports an error when the request fails", async () => {
      mockRequestUrl.mockRejectedValue(new Error("Network error"));

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/could not reach/i);
    });
  });

  describe("Synthesis", () => {
    test("calls the speech endpoint with the right URL, headers and body", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
        1.0,
      );
      await service.speak("Hello world.", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("http://localhost:8880/v1/audio/speech");
      expect(call.method).toBe("POST");
      expect(call.headers["Content-Type"]).toBe("application/json");
      expect(call.headers.Accept).toBe("audio/mpeg");

      const body = JSON.parse(call.body);
      expect(body.input).toBe("Hello world.");
      expect(body.voice).toBe("pm_alex");
      expect(body.model).toBe("kokoro");
      expect(body.lang_code).toBe("p");
      expect(body.response_format).toBe("mp3");
      expect(body.speed).toBe(1.0);

      // Audio should be cached for the active note (download support)
      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("chunks long text into multiple requests", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      // ~3000 chars → exceeds the 2000 char chunk size
      const longText = "word ".repeat(600).trim();

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      await service.speak(longText);

      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    });

    test("throws and reports an error when the server returns 404", async () => {
      mockRequestUrl.mockResolvedValue({ status: 404 });

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    });

    test("throws and reports an error when the server returns 400", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 400,
        json: { error: { message: "Bad lang_code" } },
      });

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
    });

    test("throws when the audio response is empty", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(0),
      });

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );

      await expect(service.speak("Hello")).rejects.toThrow(/empty audio/i);
    });
  });

  describe("Credentials update", () => {
    test("applies new settings via updateCredentials", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(8),
      });

      const service = new KokoroSpeechService(
        "http://localhost:8880",
        "pm_alex",
        "kokoro",
        "p",
      );
      service.updateCredentials({
        ...DEFAULT_SETTINGS,
        KOKORO_BASE_URL: "http://kokoro.test/",
        KOKORO_VOICE: "pf_dora",
        KOKORO_MODEL: "kokoro-v1",
        KOKORO_LANG_CODE: "e",
      });

      await service.speak("Hola.");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("http://kokoro.test/v1/audio/speech");
      const body = JSON.parse(call.body);
      expect(body.voice).toBe("pf_dora");
      expect(body.model).toBe("kokoro-v1");
      expect(body.lang_code).toBe("e");
    });
  });
});

describe("Unit Tests - Speech Provider Factory (Kokoro)", () => {
  test("creates a text provider for Kokoro", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "kokoro",
    });
    expect(provider.inputFormat).toBe("text");
    expect(provider.supportsBreakTags).toBe(false);
    expect(provider.getVoiceOptions().some((v) => v.id === "pm_alex")).toBe(
      true,
    );
  });
});
