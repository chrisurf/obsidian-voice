/**
 * SpeechProviderFactory - Creates the active TTS provider from settings
 */

import type { VoiceSettings } from "../settings/VoiceSettings";
import type { SpeechProvider } from "./SpeechProvider";
import { AwsPollyService } from "./AwsPollyService";
import { ElevenLabsService } from "./ElevenLabsService";

/**
 * Create the speech provider selected in settings.
 */
export function createSpeechProvider(settings: VoiceSettings): SpeechProvider {
  if (settings.TTS_PROVIDER === "elevenlabs") {
    return new ElevenLabsService(
      settings.ELEVENLABS_API_KEY,
      settings.ELEVENLABS_VOICE,
      settings.ELEVENLABS_MODEL,
      Number(settings.SPEED),
    );
  }

  return new AwsPollyService(
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
