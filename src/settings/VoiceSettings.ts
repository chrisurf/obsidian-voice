/**
 * Supported text-to-speech providers
 */
export type TtsProvider = "polly" | "elevenlabs";

export interface VoiceSettings {
  // Active text-to-speech provider
  TTS_PROVIDER: TtsProvider;

  // AWS Polly
  VOICE: string;
  SPEED: number;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;

  // ElevenLabs
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE: string;
  ELEVENLABS_MODEL: string;

  // Content / speech options (shared across providers)
  spellOutAcronyms: boolean;
  readCodeBlocks: boolean;
  autoDownloadAudio: boolean;
  skipUrls: boolean;
  // Internal: tracks the one-time reset of the legacy spellOutAcronyms default
  acronymDefaultMigrated: boolean;
}

export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export const VOICES: VoiceOption[] = [
  { id: "Stephen", label: "Stephen (American)", lang: "en-US" },
  { id: "Joanna", label: "Joanna (American)", lang: "en-US" },
  { id: "Brian", label: "Brian (British)", lang: "en-GB" },
  { id: "Emma", label: "Emma (British)", lang: "en-GB" },
  { id: "Daniel", label: "Daniel (German)", lang: "de-DE" },
  { id: "Vicki", label: "Vicki (German)", lang: "de-DE" },
  { id: "Remi", label: "Rémi (French)", lang: "fr-FR" },
  { id: "Lea", label: "Léa (French)", lang: "fr-FR" },
  { id: "Sergio", label: "Sergio (Spanish)", lang: "es-ES" },
  { id: "Lucia", label: "Lucia (Spanish)", lang: "es-ES" },
  { id: "Adriano", label: "Adriano (Italian)", lang: "it-IT" },
  { id: "Bianca", label: "Bianca (Italian)", lang: "it-IT" },
  { id: "Ola", label: "Ola (Polish)", lang: "pl-PL" },
  { id: "Laura", label: "Laura (Dutch)", lang: "nl-NL" },
  { id: "Ines", label: "Ines (Portuguese)", lang: "pt-PT" },
  { id: "Camila", label: "Camila (Portuguese, Brazilian)", lang: "pt-BR" },
  { id: "Thiago", label: "Thiago (Portuguese, Brazilian)", lang: "pt-BR" },
  { id: "Vitoria", label: "Vitoria (Portuguese, Brazilian)", lang: "pt-BR" },
  { id: "Arlet", label: "Arlet (Catalan)", lang: "ca-ES" },
  { id: "Elin", label: "Elin (Swedish)", lang: "sv-SE" },
  { id: "Sofie", label: "Sofie (Danish)", lang: "da-DK" },
  { id: "Ida", label: "Ida (Norwegian)", lang: "nb-NO" },
  { id: "Suvi", label: "Suvi (Finnish)", lang: "fi-FI" },
  { id: "Takumi", label: "Takumi (Japanese)", lang: "ja-JP" },
  { id: "Tomoko", label: "Tomoko (Japanese)", lang: "ja-JP" },
  { id: "Seoyeon", label: "Seoyeon (Korean)", lang: "ko-KR" },
  { id: "Kajal", label: "Kajal (Hindi)", lang: "hi-IN" },
  { id: "Zhiyu", label: "Zhiyu (Mandarin)", lang: "cmn-CN" },
];

/**
 * ElevenLabs models selectable in the settings.
 * Default is multilingual_v2 (best quality, 29 languages, supports breaks).
 */
export const ELEVENLABS_MODELS: ModelOption[] = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (quality)" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 (fastest)" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5 (balanced)" },
];

/**
 * Curated list of ElevenLabs premade voices.
 *
 * The `id` is the ElevenLabs voice_id. These premade ids have historically
 * been stable; users can also see/validate their account voices via the
 * settings "Test Credentials" action. The `lang` is informational only — the
 * multilingual model speaks many languages regardless of the voice.
 */
export const ELEVENLABS_VOICES: VoiceOption[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (Female)", lang: "en-US" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella (Female)", lang: "en-US" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi (Female)", lang: "en-US" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam (Male)", lang: "en-US" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni (Male)", lang: "en-US" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh (Male)", lang: "en-US" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam (Male)", lang: "en-US" },
];

export const DEFAULT_SETTINGS: VoiceSettings = {
  TTS_PROVIDER: "polly",

  VOICE: "Stephen",
  SPEED: 1.0,
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",

  ELEVENLABS_API_KEY: "",
  ELEVENLABS_VOICE: "21m00Tcm4TlvDq8ikWAM",
  ELEVENLABS_MODEL: "eleven_multilingual_v2",

  spellOutAcronyms: false,
  readCodeBlocks: false,
  autoDownloadAudio: false,
  skipUrls: false,
  acronymDefaultMigrated: false,
};
