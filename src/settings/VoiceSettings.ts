/**
 * Supported text-to-speech providers
 */
export type TtsProvider = "polly" | "elevenlabs" | "google" | "azure";

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

  // Google Cloud Text-to-Speech
  GOOGLE_API_KEY: string;
  GOOGLE_VOICE: string;

  // Azure AI Speech
  AZURE_API_KEY: string;
  AZURE_REGION: string;
  AZURE_VOICE: string;

  // Content / speech options (shared across providers)
  spellOutAcronyms: boolean;
  readCodeBlocks: boolean;
  autoDownloadAudio: boolean;
  skipUrls: boolean;
  // Playback: how many seconds the rewind/fast-forward controls jump
  rewindSeconds: number;
  forwardSeconds: number;
  // Internal: tracks the one-time reset of the legacy spellOutAcronyms default
  acronymDefaultMigrated: boolean;
}

/**
 * Bounds and default for the rewind/fast-forward skip interval (seconds)
 */
export const MIN_SKIP_SECONDS = 1;
export const MAX_SKIP_SECONDS = 60;
export const DEFAULT_SKIP_SECONDS = 3;

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

/**
 * Curated list of Google Cloud Text-to-Speech voices.
 *
 * The `id` is the Google voice `name` (e.g. "en-US-Neural2-C"); `lang` is the
 * BCP-47 languageCode (the name's first two segments). Only Neural2/WaveNet
 * tiers are listed — they all support SSML (prosody/breaks), unlike
 * Chirp/Journey voices. Users can verify availability via "Test Credentials".
 */
export const GOOGLE_VOICES: VoiceOption[] = [
  {
    id: "en-US-Neural2-C",
    label: "Neural2 C (American, Female)",
    lang: "en-US",
  },
  { id: "en-US-Neural2-D", label: "Neural2 D (American, Male)", lang: "en-US" },
  {
    id: "en-US-Neural2-F",
    label: "Neural2 F (American, Female)",
    lang: "en-US",
  },
  { id: "en-US-Wavenet-D", label: "WaveNet D (American, Male)", lang: "en-US" },
  {
    id: "en-GB-Neural2-A",
    label: "Neural2 A (British, Female)",
    lang: "en-GB",
  },
  { id: "en-GB-Neural2-B", label: "Neural2 B (British, Male)", lang: "en-GB" },
  { id: "de-DE-Neural2-A", label: "Neural2 A (German, Female)", lang: "de-DE" },
  { id: "de-DE-Neural2-B", label: "Neural2 B (German, Male)", lang: "de-DE" },
  { id: "fr-FR-Neural2-A", label: "Neural2 A (French, Female)", lang: "fr-FR" },
  { id: "fr-FR-Neural2-B", label: "Neural2 B (French, Male)", lang: "fr-FR" },
  {
    id: "es-ES-Neural2-A",
    label: "Neural2 A (Spanish, Female)",
    lang: "es-ES",
  },
  { id: "es-ES-Neural2-B", label: "Neural2 B (Spanish, Male)", lang: "es-ES" },
  {
    id: "it-IT-Neural2-A",
    label: "Neural2 A (Italian, Female)",
    lang: "it-IT",
  },
  { id: "it-IT-Neural2-C", label: "Neural2 C (Italian, Male)", lang: "it-IT" },
  {
    id: "pt-BR-Neural2-A",
    label: "Neural2 A (Portuguese, Brazilian)",
    lang: "pt-BR",
  },
  { id: "nl-NL-Wavenet-A", label: "WaveNet A (Dutch, Female)", lang: "nl-NL" },
  {
    id: "ja-JP-Neural2-B",
    label: "Neural2 B (Japanese, Female)",
    lang: "ja-JP",
  },
  { id: "ko-KR-Neural2-A", label: "Neural2 A (Korean, Female)", lang: "ko-KR" },
];

/**
 * Common Azure AI Speech regions (the region is part of the endpoint host).
 */
export const AZURE_REGIONS: ModelOption[] = [
  { id: "eastus", label: "East US" },
  { id: "eastus2", label: "East US 2" },
  { id: "westus", label: "West US" },
  { id: "westus2", label: "West US 2" },
  { id: "westus3", label: "West US 3" },
  { id: "centralus", label: "Central US" },
  { id: "westeurope", label: "West Europe" },
  { id: "northeurope", label: "North Europe" },
  { id: "uksouth", label: "UK South" },
  { id: "francecentral", label: "France Central" },
  { id: "germanywestcentral", label: "Germany West Central" },
  { id: "switzerlandnorth", label: "Switzerland North" },
  { id: "swedencentral", label: "Sweden Central" },
  { id: "japaneast", label: "Japan East" },
  { id: "southeastasia", label: "Southeast Asia" },
  { id: "centralindia", label: "Central India" },
  { id: "australiaeast", label: "Australia East" },
  { id: "canadacentral", label: "Canada Central" },
  { id: "brazilsouth", label: "Brazil South" },
];

/**
 * Curated list of Azure AI Speech neural voices.
 *
 * The `id` is the Azure voice ShortName (e.g. "en-US-JennyNeural") used in the
 * <voice name> element; `lang` is its locale. Users can verify availability
 * for their key/region via "Test Credentials".
 */
export const AZURE_VOICES: VoiceOption[] = [
  { id: "en-US-JennyNeural", label: "Jenny (American, Female)", lang: "en-US" },
  { id: "en-US-AriaNeural", label: "Aria (American, Female)", lang: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy (American, Male)", lang: "en-US" },
  {
    id: "en-US-ChristopherNeural",
    label: "Christopher (American, Male)",
    lang: "en-US",
  },
  { id: "en-GB-SoniaNeural", label: "Sonia (British, Female)", lang: "en-GB" },
  { id: "en-GB-RyanNeural", label: "Ryan (British, Male)", lang: "en-GB" },
  {
    id: "en-AU-NatashaNeural",
    label: "Natasha (Australian, Female)",
    lang: "en-AU",
  },
  { id: "de-DE-KatjaNeural", label: "Katja (German, Female)", lang: "de-DE" },
  { id: "de-DE-ConradNeural", label: "Conrad (German, Male)", lang: "de-DE" },
  { id: "fr-FR-DeniseNeural", label: "Denise (French, Female)", lang: "fr-FR" },
  { id: "fr-FR-HenriNeural", label: "Henri (French, Male)", lang: "fr-FR" },
  {
    id: "es-ES-ElviraNeural",
    label: "Elvira (Spanish, Female)",
    lang: "es-ES",
  },
  { id: "es-ES-AlvaroNeural", label: "Alvaro (Spanish, Male)", lang: "es-ES" },
  { id: "it-IT-ElsaNeural", label: "Elsa (Italian, Female)", lang: "it-IT" },
  { id: "it-IT-DiegoNeural", label: "Diego (Italian, Male)", lang: "it-IT" },
  {
    id: "pt-BR-FranciscaNeural",
    label: "Francisca (Portuguese, Brazilian)",
    lang: "pt-BR",
  },
  {
    id: "nl-NL-ColetteNeural",
    label: "Colette (Dutch, Female)",
    lang: "nl-NL",
  },
  {
    id: "ja-JP-NanamiNeural",
    label: "Nanami (Japanese, Female)",
    lang: "ja-JP",
  },
  { id: "ko-KR-SunHiNeural", label: "Sun-Hi (Korean, Female)", lang: "ko-KR" },
  {
    id: "zh-CN-XiaoxiaoNeural",
    label: "Xiaoxiao (Mandarin, Female)",
    lang: "zh-CN",
  },
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

  GOOGLE_API_KEY: "",
  GOOGLE_VOICE: "en-US-Neural2-C",

  AZURE_API_KEY: "",
  AZURE_REGION: "eastus",
  AZURE_VOICE: "en-US-JennyNeural",

  spellOutAcronyms: false,
  readCodeBlocks: false,
  autoDownloadAudio: false,
  skipUrls: false,
  rewindSeconds: DEFAULT_SKIP_SECONDS,
  forwardSeconds: DEFAULT_SKIP_SECONDS,
  acronymDefaultMigrated: false,
};
