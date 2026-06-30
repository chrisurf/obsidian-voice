import { requestUrl } from "obsidian";
import { AzureSpeechService } from "../src/service/AzureSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - Azure Speech Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("uses the SSML input format (native pauses/emphasis)", () => {
      const service = new AzureSpeechService(
        "key",
        "eastus",
        "en-US-JennyNeural",
        1.0,
      );
      expect(service.inputFormat).toBe("ssml");
    });

    test("exposes a non-empty voice catalog", () => {
      const service = new AzureSpeechService(
        "key",
        "eastus",
        "en-US-JennyNeural",
        1.0,
      );
      expect(service.getVoiceOptions().length).toBeGreaterThan(0);
    });
  });

  describe("Credential validation", () => {
    test("rejects a missing key or region without a network call", async () => {
      const noKey = new AzureSpeechService("", "eastus", "en-US-JennyNeural");
      const noRegion = new AzureSpeechService("key", "", "en-US-JennyNeural");
      expect((await noKey.validateCredentials()).isValid).toBe(false);
      expect((await noRegion.validateCredentials()).isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("reports the mapped voices and count on a successful response", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: [
          {
            ShortName: "en-US-JennyNeural",
            DisplayName: "Jenny",
            Gender: "Female",
            Locale: "en-US",
            LocaleName: "English (United States)",
            VoiceType: "Neural",
          },
          {
            ShortName: "de-DE-ConradNeural",
            DisplayName: "Conrad",
            Gender: "Male",
            Locale: "de-DE",
            LocaleName: "German (Germany)",
            VoiceType: "Neural",
          },
          // Legacy non-Neural voice — excluded from the catalog and the count.
          {
            ShortName: "en-US-ZiraRUS",
            Locale: "en-US",
            VoiceType: "Standard",
          },
        ],
      });
      const service = new AzureSpeechService(
        "key",
        "eastus",
        "en-US-JennyNeural",
      );
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(2);
      expect(result.voices?.map((v) => v.id)).toEqual([
        "en-US-JennyNeural",
        "de-DE-ConradNeural",
      ]);
    });

    test("treats HTTP 401 as an invalid key/region", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const service = new AzureSpeechService(
        "bad",
        "eastus",
        "en-US-JennyNeural",
      );
      expect((await service.validateCredentials()).isValid).toBe(false);
    });
  });

  describe("Synthesis", () => {
    test("posts to the regional endpoint with the right headers and SSML envelope", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new AzureSpeechService(
        "my-key",
        "westeurope",
        "de-DE-KatjaNeural",
        1.0,
      );
      await service.speak("<speak>Hallo Welt.</speak>", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe(
        "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
      );
      expect(call.method).toBe("POST");
      expect(call.headers["Ocp-Apim-Subscription-Key"]).toBe("my-key");
      expect(call.headers["Content-Type"]).toBe("application/ssml+xml");
      expect(call.headers["X-Microsoft-OutputFormat"]).toContain("mp3");

      // Azure envelope: single <speak> with version/xmlns/xml:lang + <voice>
      expect(call.body).toContain('xml:lang="de-DE"');
      expect(call.body).toContain('<voice name="de-DE-KatjaNeural">');
      expect(call.body).toContain("Hallo Welt.");
      expect((call.body.match(/<speak/g) || []).length).toBe(1);

      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("rewrites prosody volume in dB to a percentage (Azure has no dB)", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(8),
      });

      const service = new AzureSpeechService(
        "key",
        "eastus",
        "en-US-JennyNeural",
      );
      await service.speak(
        '<speak><prosody volume="+2dB">bold</prosody></speak>',
      );

      const body = mockRequestUrl.mock.calls[0][0].body as string;
      expect(body).not.toContain("dB");
      expect(body).toContain('volume="+20%"');
    });

    test("throws and reports an error when key/region is missing", async () => {
      const service = new AzureSpeechService("", "", "en-US-JennyNeural");
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("<speak>Hi</speak>")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("surfaces a friendly message on HTTP 401 during synthesis", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const service = new AzureSpeechService(
        "bad",
        "eastus",
        "en-US-JennyNeural",
      );
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("<speak>Hi</speak>")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/invalid/i),
      );
    });
  });
});

describe("Unit Tests - Speech Provider Factory (Azure)", () => {
  test("creates an SSML provider for Azure Speech", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "azure",
    });
    expect(provider.inputFormat).toBe("ssml");
    expect(
      provider.getVoiceOptions().some((v) => v.id === "en-US-JennyNeural"),
    ).toBe(true);
  });
});
