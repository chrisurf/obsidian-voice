/**
 * SpeechProviderFactory - Creates the active TTS provider from settings
 */

import type { VoiceSettings } from "../settings/VoiceSettings";
import type { SpeechProvider } from "./SpeechProvider";
import { AwsPollyService } from "./AwsPollyService";
import { ElevenLabsService } from "./ElevenLabsService";
import { GoogleTtsService } from "./GoogleTtsService";
import { AzureSpeechService } from "./AzureSpeechService";
import { OpenAiSpeechService } from "./OpenAiSpeechService";
import { MiniMaxSpeechService } from "./MiniMaxSpeechService";
import { CartesiaSpeechService } from "./CartesiaSpeechService";

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
      settings.azureVoiceCatalog,
    );
  } else if (settings.TTS_PROVIDER === "openai") {
    provider = new OpenAiSpeechService(
      settings.OPENAI_API_KEY,
      settings.OPENAI_VOICE,
      settings.OPENAI_MODEL,
      Number(settings.SPEED),
    );
  } else if (settings.TTS_PROVIDER === "minimax") {
    provider = new MiniMaxSpeechService(
      settings.MINIMAX_API_KEY,
      settings.MINIMAX_GROUP_ID,
      settings.MINIMAX_VOICE,
      settings.MINIMAX_MODEL,
      settings.MINIMAX_HOST,
      Number(settings.SPEED),
    );
  } else if (settings.TTS_PROVIDER === "cartesia") {
    provider = new CartesiaSpeechService(
      settings.CARTESIA_API_KEY,
      settings.CARTESIA_VOICE,
      settings.CARTESIA_MODEL,
      settings.CARTESIA_LANGUAGE,
      Number(settings.SPEED),
      settings.cartesiaVoiceCatalog,
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
