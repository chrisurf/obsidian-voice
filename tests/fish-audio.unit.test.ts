import { requestUrl } from "obsidian";
import { FishAudioSpeechService } from "../src/service/FishAudioSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - Fish Audio Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("declares plain-text input and exposes the default voice", () => {
    const service = new FishAudioSpeechService("key", "", "s2.1-pro-free", 1);

    expect(service.inputFormat).toBe("text");
    expect(service.getVoiceOptions()).toContainEqual(
      expect.objectContaining({ id: "", label: "Default voice" }),
    );
  });

  test("adds a configured custom voice to the player catalog", () => {
    const service = new FishAudioSpeechService(
      "key",
      "ca3007f96ae7499ab87d27ea3599956a",
      "s2.1-pro-free",
      1,
    );

    expect(
      service
        .getVoiceOptions()
        .some((voice) => voice.id === "ca3007f96ae7499ab87d27ea3599956a"),
    ).toBe(true);
  });

  test("rejects an empty API key without a network call", async () => {
    const service = new FishAudioSpeechService("", "", "s2.1-pro-free", 1);
    const result = await service.validateCredentials();

    expect(result.isValid).toBe(false);
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  test("validates the key through the voice-model endpoint", async () => {
    mockRequestUrl.mockResolvedValue({ status: 200, json: { total: 0 } });
    const service = new FishAudioSpeechService(
      "fish-key",
      "",
      "s2.1-pro-free",
      1,
    );
    const result = await service.validateCredentials();

    expect(result.isValid).toBe(true);
    const call = mockRequestUrl.mock.calls[0][0];
    expect(call.url).toBe("https://api.fish.audio/model?page_size=1&self=true");
    expect(call.headers.Authorization).toBe("Bearer fish-key");
  });

  test("synthesizes with the model header and default voice", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      arrayBuffer: new ArrayBuffer(32),
    });
    const service = new FishAudioSpeechService(
      "fish-key",
      "",
      "s2.1-pro-free",
      1,
    );

    await service.speak("Hello from Fish Audio.", 1, "note.md");

    const call = mockRequestUrl.mock.calls[0][0];
    expect(call.url).toBe("https://api.fish.audio/v1/tts");
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe("Bearer fish-key");
    expect(call.headers.model).toBe("s2.1-pro-free");
    const body = JSON.parse(call.body);
    expect(body).toEqual({
      text: "Hello from Fish Audio.",
      format: "mp3",
    });
    expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
  });

  test("sends a configured voice as reference_id", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      arrayBuffer: new ArrayBuffer(32),
    });
    const service = new FishAudioSpeechService(
      "fish-key",
      "voice-model-id",
      "s2.1-pro",
      1,
    );

    await service.speak("Custom voice.");

    const call = mockRequestUrl.mock.calls[0][0];
    expect(JSON.parse(call.body).reference_id).toBe("voice-model-id");
    expect(call.headers.model).toBe("s2.1-pro");
  });

  test("chunks long notes into multiple requests", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      arrayBuffer: new ArrayBuffer(16),
    });
    const paragraph = "word ".repeat(400).trim();
    const service = new FishAudioSpeechService(
      "fish-key",
      "",
      "s2.1-pro-free",
      1,
    );

    await service.speak([paragraph, paragraph].join("\n\n"));

    expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
  });

  test("reports credit exhaustion clearly", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 402,
      json: { message: "insufficient balance" },
    });
    const service = new FishAudioSpeechService("fish-key", "", "s2.1-pro", 1);
    const errorCallback = jest.fn();
    service.setErrorCallback(errorCallback);

    await expect(service.speak("Hello")).rejects.toThrow();
    expect(errorCallback).toHaveBeenCalledWith(
      expect.stringMatching(/credits/i),
    );
  });

  test("is created by the provider factory", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "fish-audio",
      FISH_AUDIO_API_KEY: "key",
    });

    expect(provider).toBeInstanceOf(FishAudioSpeechService);
    expect(provider.inputFormat).toBe("text");
  });
});
