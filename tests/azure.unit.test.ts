import { requestUrl } from "obsidian";
import { AzureSpeechService } from "../src/service/AzureSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";
import {
  azureProsodyRate,
  azureProsodyVolumeDb,
  adaptProsodyForAzure,
} from "../src/service/azureSsml";

const mockRequestUrl = requestUrl as jest.Mock;

// A representative slice of the SSML the content pipeline produces for a heading
// ("# Big heading") followed by an *emphasised* word: headings get a `loud`
// volume + a slightly-slower `rate="98%"`, italics get `rate="95%"`. These are
// absolute percentages (SSML/Polly/Google semantics). Kept as a fixture because
// the real pipeline pulls in ESM-only `unified`, which the Jest (ts-jest)
// runtime cannot import.
const PIPELINE_SSML =
  '<speak><prosody volume="loud" rate="98%">Big heading</prosody>' +
  '<break time="800ms"/> Some <prosody rate="95%">emphasised</prosody> words.' +
  "</speak>";

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

describe("Unit Tests - Azure SSML adaptation (rate/volume)", () => {
  describe("azureProsodyRate", () => {
    test("converts an unsigned absolute percentage to signed relative", () => {
      // The pipeline emits absolute percentages (95% = 0.95x). Azure reads a
      // bare percentage as relative (+95% ≈ 1.95x — the #56/#77 bug), so the
      // intended slight slowdown must be expressed as a signed relative value.
      expect(azureProsodyRate("95%")).toBe("-5%");
      expect(azureProsodyRate("98%")).toBe("-2%");
      expect(azureProsodyRate("100%")).toBe("+0%");
      expect(azureProsodyRate("120%")).toBe("+20%");
    });

    test("handles decimal percentages", () => {
      expect(azureProsodyRate("97.5%")).toBe("-2.5%");
    });

    test("leaves already-signed percentages, keywords and multipliers untouched", () => {
      expect(azureProsodyRate("+10%")).toBe("+10%");
      expect(azureProsodyRate("-15%")).toBe("-15%");
      expect(azureProsodyRate("slow")).toBe("slow");
      expect(azureProsodyRate("x-fast")).toBe("x-fast");
      expect(azureProsodyRate("0.95")).toBe("0.95");
    });
  });

  describe("azureProsodyVolumeDb", () => {
    test("maps dB to a bounded relative percentage", () => {
      expect(azureProsodyVolumeDb(2)).toBe("+20%");
      expect(azureProsodyVolumeDb(-3)).toBe("-30%");
      expect(azureProsodyVolumeDb(100)).toBe("+50%"); // clamped to ±50%
    });
  });

  describe("adaptProsodyForAzure", () => {
    test("rewrites rate and volume together, leaving text intact", () => {
      const inner =
        '<prosody volume="+2dB" rate="98%">Title</prosody> and ' +
        '<prosody rate="95%">emphasis</prosody>';
      const out = adaptProsodyForAzure(inner);
      expect(out).toContain('rate="-2%"');
      expect(out).toContain('rate="-5%"');
      expect(out).toContain('volume="+20%"');
      expect(out).toContain("Title");
      expect(out).toContain("emphasis");
      // No bare (unsigned) percentage rate — the exact thing Azure misreads.
      expect(out).not.toMatch(/rate="\d/);
      expect(out).not.toContain("dB");
    });
  });
});

describe("Unit Tests - Azure prosody rate regression (issues #56 / #77)", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("never sends a bare percentage rate to Azure", async () => {
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
      '<speak><prosody rate="98%">Heading</prosody> ' +
        '<prosody rate="95%">italic</prosody></speak>',
    );
    const body = mockRequestUrl.mock.calls[0][0].body as string;
    expect(body).toContain('rate="-2%"');
    expect(body).toContain('rate="-5%"');
    // Guard the actual defect: no unsigned absolute percentage reaches Azure.
    expect(body).not.toMatch(/rate="\d/);
  });

  test("golden: representative pipeline SSML never leaks a bare-% rate into Azure", async () => {
    // The canonical pipeline output intentionally uses absolute percentages
    // (SSML/Polly/Google semantics) — this documents the divergence…
    expect(PIPELINE_SSML).toMatch(/rate="\d+(?:\.\d+)?%"/);

    // …but after the Azure adaptation, nothing unsigned may reach the API, and
    // the intended slight slowdown survives as signed-relative values.
    mockRequestUrl.mockResolvedValue({
      status: 200,
      arrayBuffer: new ArrayBuffer(8),
    });
    const service = new AzureSpeechService(
      "key",
      "eastus",
      "en-US-JennyNeural",
    );
    await service.speak(PIPELINE_SSML);
    const body = mockRequestUrl.mock.calls[0][0].body as string;
    expect(body).not.toMatch(/rate="\d/);
    expect(body).toContain('rate="-2%"');
    expect(body).toContain('rate="-5%"');
    // Non-rate prosody (heading volume keyword) is preserved untouched.
    expect(body).toContain('volume="loud"');
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
