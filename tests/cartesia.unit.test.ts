import { requestUrl } from "obsidian";
import { CartesiaSpeechService } from "../src/service/CartesiaSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

const make = (catalog?: { id: string; label: string; lang: string }[]) =>
  new CartesiaSpeechService("key", "voice-uuid", "sonic-2", "en", 1.0, catalog);

describe("Unit Tests - Cartesia Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("declares the plain-text input format and no pause markup", () => {
      const s = make();
      expect(s.inputFormat).toBe("text");
      expect(s.textPauseStyle).toBe("none");
    });

    test("exposes a fallback voice catalog, overridden by a dynamic one", () => {
      expect(make().getVoiceOptions().length).toBeGreaterThan(0);
      const dyn = make([{ id: "d1", label: "Dyn", lang: "en" }]);
      expect(dyn.getVoiceOptions()).toEqual([
        { id: "d1", label: "Dyn", lang: "en" },
      ]);
    });
  });

  describe("Credential validation", () => {
    test("rejects an empty API key without a network call", async () => {
      const s = new CartesiaSpeechService("", "v", "sonic-2", "en", 1);
      const result = await s.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("lists voices and returns a mapped catalog on success", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          data: [
            { id: "uuid-1", name: "Aria", language: "en" },
            { id: "uuid-2", name: "Lukas", language: "de" },
          ],
        },
      });
      const result = await make().validateCredentials();
      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(2);
      expect(result.voices?.map((v) => v.id)).toEqual(["uuid-1", "uuid-2"]);

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("https://api.cartesia.ai/voices");
      expect(call.method).toBe("GET");
      expect(call.headers["X-API-Key"]).toBe("key");
      expect(call.headers["Cartesia-Version"]).toBeTruthy();
    });

    test("treats HTTP 401 as an invalid key", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const result = await make().validateCredentials();
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });
  });

  describe("Synthesis", () => {
    test("posts to /tts/bytes with the right headers and body, caches audio", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const s = new CartesiaSpeechService(
        "my-key",
        "voice-42",
        "sonic-turbo",
        "de",
        1.0,
      );
      await s.speak("Hallo Welt.", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe("https://api.cartesia.ai/tts/bytes");
      expect(call.method).toBe("POST");
      expect(call.headers["X-API-Key"]).toBe("my-key");
      expect(call.headers["Cartesia-Version"]).toBeTruthy();

      const body = JSON.parse(call.body);
      expect(body.transcript).toBe("Hallo Welt.");
      expect(body.model_id).toBe("sonic-turbo");
      expect(body.language).toBe("de");
      expect(body.voice).toEqual({ mode: "id", id: "voice-42" });
      expect(body.output_format.container).toBe("mp3");

      expect(s.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("chunks long text into multiple requests", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });
      const paragraph = "word ".repeat(400).trim(); // ~2000 chars
      const longText = [paragraph, paragraph].join("\n\n");
      await make().speak(longText);
      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    });

    test("throws and reports when the API key is missing", async () => {
      const s = new CartesiaSpeechService("", "v", "sonic-2", "en", 1);
      const errorCallback = jest.fn();
      s.setErrorCallback(errorCallback);
      await expect(s.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("surfaces a friendly message on HTTP 401 during synthesis", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const s = make();
      const errorCallback = jest.fn();
      s.setErrorCallback(errorCallback);
      await expect(s.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/invalid/i),
      );
    });
  });
});

describe("Unit Tests - Speech Provider Factory (Cartesia)", () => {
  test("creates a text provider for Cartesia", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "cartesia",
      CARTESIA_API_KEY: "k",
    });
    expect(provider).toBeInstanceOf(CartesiaSpeechService);
    expect(provider.inputFormat).toBe("text");
    expect(provider.textPauseStyle).toBe("none");
  });
});
