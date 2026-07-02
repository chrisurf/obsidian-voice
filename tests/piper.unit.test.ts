import { requestUrl } from "obsidian";
import { PiperService } from "../src/service/PiperService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - Piper Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("declares the plain-text input format", () => {
      const service = new PiperService("http://localhost:5000", "", 1.0);
      expect(service.inputFormat).toBe("text");
    });

    test("returns an empty voice catalog before any server fetch", () => {
      const service = new PiperService("http://localhost:5000", "", 1.0);
      expect(service.getVoiceOptions()).toEqual([]);
    });

    test("strips trailing slash from the server URL", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });
      const service = new PiperService("http://localhost:5000/", "", 1.0);
      await service.speak("hi", 1.0, "note.md");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("http://localhost:5000/synthesize");
    });

    test("defaults to http://localhost:5000 when URL is empty", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });
      const service = new PiperService("", "", 1.0);
      await service.speak("hi", 1.0, "note.md");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toContain("http://localhost:5000");
    });
  });

  describe("Speed (length_scale) mapping", () => {
    const synthesizeAndGetLengthScale = async (
      speed: number,
    ): Promise<number> => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });
      const service = new PiperService("http://localhost:5000", "", speed);
      await service.speak("test", speed, "note.md");
      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      return body.length_scale as number;
    };

    test("normal speed 1x -> length_scale 1.0", async () => {
      expect(await synthesizeAndGetLengthScale(1.0)).toBeCloseTo(1.0);
    });

    test("fast speed 2x -> length_scale 0.5", async () => {
      expect(await synthesizeAndGetLengthScale(2.0)).toBeCloseTo(0.5);
    });

    test("slow speed 0.5x -> length_scale 2.0", async () => {
      expect(await synthesizeAndGetLengthScale(0.5)).toBeCloseTo(2.0);
    });
  });

  describe("Synthesis", () => {
    test("POSTs to /synthesize with text and length_scale", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(64),
      });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      await service.speak("Hello world.", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("http://localhost:5000/synthesize");
      expect(call.method).toBe("POST");
      expect(call.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(call.body);
      expect(body.text).toBe("Hello world.");
      expect(body.length_scale).toBeCloseTo(1.0);
    });

    test("falls back to POST / on 404 (legacy rhasspy/piper)", async () => {
      // First call to /synthesize returns 404; second to / returns audio.
      mockRequestUrl
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(32) });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      await service.speak("Hello.", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
      const fallbackCall = mockRequestUrl.mock.calls[1][0];
      expect(fallbackCall.url).toBe("http://localhost:5000/");
    });

    test("uses cached path / on subsequent calls after fallback detection", async () => {
      mockRequestUrl
        .mockResolvedValueOnce({ status: 404 }) // /synthesize probe
        .mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(32) }); // / onwards

      const service = new PiperService("http://localhost:5000", "", 1.0);
      await service.speak("First.");
      await service.speak("Second.");

      const urls = mockRequestUrl.mock.calls.map((c) => c[0].url);
      // Call 0: /synthesize (probe), Call 1: / (retry), Call 2: / (second speak, no retry)
      expect(urls[0]).toContain("/synthesize");
      expect(urls[1]).toBe("http://localhost:5000/");
      expect(urls[2]).toBe("http://localhost:5000/");
    });

    test("includes the voice name when set", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new PiperService(
        "http://localhost:5000",
        "en_US-lessac-medium",
        1.0,
      );
      await service.speak("Hello.", 1.0, "note.md");

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.voice).toBe("en_US-lessac-medium");
    });

    test("omits the voice field when voice is empty", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      await service.speak("Hello.", 1.0, "note.md");

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.voice).toBeUndefined();
    });

    test("caches the audio blob for download after synthesis", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(64),
      });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      await service.speak("Hello world.", 1.0, "note.md");

      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("chunks long text into multiple requests", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      // Three paragraphs of ~2000 chars each -> exceeds the 3000 char chunk size
      const paragraph = "word ".repeat(400).trim();
      const longText = [paragraph, paragraph, paragraph].join("\n\n");

      const service = new PiperService("http://localhost:5000", "", 1.0);
      await service.speak(longText);

      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    });

    test("throws and reports an error on HTTP 500", async () => {
      mockRequestUrl.mockResolvedValue({ status: 500, arrayBuffer: null });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow(/HTTP 500/);
      expect(errorCallback).toHaveBeenCalled();
    });

    test("throws and reports an error on empty audio response", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(0),
      });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow(/empty/i);
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe("Credential / connection validation", () => {
    test("returns isValid true with voice list on HTTP 200", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        // Server returns a dict keyed by voice name (not an array)
        json: {
          "en_US-lessac-medium": {
            language: {
              code: "en-US",
              name_english: "English (United States)",
            },
          },
          "de_DE-thorsten-medium": {
            language: { code: "de-DE", name_english: "German" },
          },
        },
      });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(2);
      expect(result.voices).toHaveLength(2);
      expect(result.voices![0].id).toBe("en_US-lessac-medium");
      expect(result.voices![0].lang).toBe("en-US");
    });

    test("handles empty dict from /voices", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, json: {} });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(0);
      expect(result.voices).toHaveLength(0);
    });

    test("returns isValid false on HTTP 500", async () => {
      mockRequestUrl.mockResolvedValue({ status: 500 });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/HTTP 500/);
    });

    test("returns isValid false when the server is unreachable", async () => {
      mockRequestUrl.mockRejectedValue(new Error("ECONNREFUSED"));

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/Cannot reach/i);
    });

    test("handles non-object /voices response gracefully", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, json: null });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      const result = await service.validateCredentials();

      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(0);
      expect(result.voices).toHaveLength(0);
    });
  });

  describe("updateCredentials", () => {
    test("updates the server URL and voice from settings", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new PiperService("http://localhost:5000", "", 1.0);
      service.updateCredentials({
        ...DEFAULT_SETTINGS,
        TTS_PROVIDER: "piper",
        PIPER_URL: "http://192.168.1.10:5000",
        PIPER_VOICE: "en_US-lessac-medium",
      });
      await service.speak("hi", 1.0, "note.md");

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toContain("192.168.1.10:5000");
      const body = JSON.parse(call.body);
      expect(body.voice).toBe("en_US-lessac-medium");
    });
  });
});

describe("Unit Tests - Speech Provider Factory (Piper)", () => {
  test("creates a text-format provider for Piper", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "piper",
      PIPER_URL: "http://localhost:5000",
      PIPER_VOICE: "",
    });
    expect(provider.inputFormat).toBe("text");
  });
});
