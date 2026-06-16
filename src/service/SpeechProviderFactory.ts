/**
 * SpeechProviderFactory - Creates the active TTS provider from settings
 */

import type { VoiceSettings } from "../settings/VoiceSettings";
import type { SpeechProvider } from "./SpeechProvider";
import { AwsPollyService } from "./AwsPollyService";
import { ElevenLabsService } from "./ElevenLabsService";
import { GoogleTtsService } from "./GoogleTtsService";
import { AzureSpeechService } from "./AzureSpeechService";

/**
 * Create the speech provider selected in settings.
 */
export function createSpeechProvider(settings: VoiceSettings): SpeechProvider {
  let provider: SpeechProvider;

  if (settings.TTS_PROVIDER === "elevenlabs") {
    provider = new ElevenLabsService(
      settings.ELEVENLABS_API_KEY,
      settings.ELEVENLABS_VOICE,
      settings.ELEVENLABS_MODEL,
      Number(settings.SPEED),
    );
  } else if (settings.TTS_PROVIDER === "google") {
    provider = new GoogleTtsService(
      settings.GOOGLE_API_KEY,
      settings.GOOGLE_VOICE,
      Number(settings.SPEED),
    );
  } else if (settings.TTS_PROVIDER === "azure") {
    provider = new AzureSpeechService(
      settings.AZURE_API_KEY,
      settings.AZURE_REGION,
      settings.AZURE_VOICE,
      Number(settings.SPEED),
    );
  } else {
    provider = new AwsPollyService(
      {
        credentials: {
          accessKeyId: String(settings.AWS_ACCESS_KEY_ID),
          secretAccessKey: String(settings.AWS_SECRET_ACCESS_KEY),
        },
        region: String(settings.AWS_REGION),
      },
      settings.VOICE,
      Number(settings.SPEED),
    );
  }

  // Apply playback preferences that aren't part of the constructor
  provider.setRewindSeconds(settings.rewindSeconds);
  provider.setForwardSeconds(settings.forwardSeconds);

  return provider;
}
