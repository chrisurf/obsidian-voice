/**
 * Supported text-to-speech providers
 */
export type TtsProvider =
  | "polly"
  | "elevenlabs"
  | "google"
  | "azure"
  | "openai"
  | "minimax";

/**
 * Where saved MP3s are written.
 * - "note": next to the active note (the original, default behaviour).
 * - "custom": into a folder chosen via the folder picker; a tap on the save
 *   button reuses the last folder, while holding it (or right-click) re-opens
 *   the picker.
 */
export type AudioSaveMode = "note" | "custom";

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
  // Azure: the full voice catalog fetched from /voices/list on "Test
  // Credentials", cached so the picker can offer every voice grouped by
  // language. Empty/undefined until the user validates; the hardcoded
  // AZURE_VOICES list is the fallback.
  azureVoiceCatalog?: VoiceOption[];

  // OpenAI Text-to-Speech
  OPENAI_API_KEY: string;
  OPENAI_VOICE: string;
  OPENAI_MODEL: string;

  // MiniMax Text-to-Speech (T2A v2). MINIMAX_API_KEY authenticates (Bearer).
  // MINIMAX_GROUP_ID is optional (only legacy accounts need it); MINIMAX_HOST
  // selects the regional endpoint host; MINIMAX_VOICE may be any MiniMax voice
  // id (including ids not in the built-in catalog); MINIMAX_LANGUAGE_BOOST maps
  // to the request's language_boost field.
  MINIMAX_API_KEY: string;
  MINIMAX_GROUP_ID: string;
  MINIMAX_VOICE: string;
  MINIMAX_MODEL: string;
  MINIMAX_HOST: string;
  MINIMAX_LANGUAGE_BOOST: string;

  // Content / speech options (shared across providers)
  skipMarkersEnabled: boolean;
  skipEnclosedTypes: string[];
  customSkipPairs: { open: string; close: string }[];
  spellOutAcronyms: boolean;
  readCodeBlocks: boolean;
  autoDownloadAudio: boolean;
  autoEmbedAudio: boolean;
  skipUrls: boolean;
  // Playback: how many seconds the rewind/fast-forward controls jump
  rewindSeconds: number;
  forwardSeconds: number;
  // Player: when true, the player's folder picker follows the active note's
  // folder; when false the chosen folder stays put across note switches.
  folderSelectorFollowsNote: boolean;
  // Player: when true (default), a tap on the play button plays the note you
  // are viewing — its already-saved MP3 if one exists (matched by name in the
  // save folder), otherwise a fresh render — even when another chapter is
  // loaded, so jumping between notes picks up each note's saved audio. When
  // false, a loaded chapter keeps playing and notes are always synthesized.
  playNoteSavedAudio: boolean;
  // Audio files: the default folder for saved MP3s. When set, a tap on the save
  // button always saves here (and auto-save writes here silently); when empty,
  // saves go next to the active note. Managed from the folder picker's pin
  // button. Stored vault-relative ("/" for the vault root).
  defaultAudioFolder: string;
  // Audio files: folders the user starred in the picker, shown first for
  // one-tap access. Independent of the default folder. Vault-relative paths.
  favoriteAudioFolders: string[];
  // Internal: tracks the one-time migration of the legacy "custom save mode"
  // (audioSaveMode + lastAudioFolder) into defaultAudioFolder.
  audioFolderMigrated: boolean;
  // Legacy (no longer drives behaviour; kept so the one-time migration above
  // can read pre-existing values). Removed from the settings UI.
  audioSaveMode?: AudioSaveMode;
  lastAudioFolder?: string;
  // Internal: tracks the one-time reset of the legacy spellOutAcronyms default
  acronymDefaultMigrated: boolean;
  // Internal: tracks the one-time placement of the player in the right sidebar
  // so it is discoverable by default without re-adding it after the user closes it.
  playerPanePlaced: boolean;
  // Internal: the plugin version whose "What's New" note the user has already
  // seen, so it is shown only once per install/update.
  lastWhatsNewVersion: string;
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
  /**
   * Optional display name of the language used to group the voice in the
   * picker (e.g. "English (United States)"). Set by dynamically fetched
   * catalogs; the hardcoded lists leave it undefined and fall back to `lang`.
   */
  group?: string;
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

/**
 * OpenAI Text-to-Speech models selectable in the settings.
 * Default is gpt-4o-mini-tts (newest, expressive, low cost). tts-1 favours
 * latency and tts-1-hd favours quality; all return MP3 audio.
 */
export const OPENAI_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini-tts", label: "GPT-4o mini TTS (recommended)" },
  { id: "tts-1", label: "TTS-1 (fast)" },
  { id: "tts-1-hd", label: "TTS-1 HD (quality)" },
];

/**
 * Built-in OpenAI voices. Limited to the set supported across every selectable
 * model (tts-1, tts-1-hd, and gpt-4o-mini-tts) so switching the model never
 * invalidates the chosen voice. The voices are multilingual — they speak the
 * language of the input text — so `lang` is informational only.
 */
export const OPENAI_VOICES: VoiceOption[] = [
  { id: "alloy", label: "Alloy (Neutral)", lang: "en-US" },
  { id: "ash", label: "Ash (Expressive)", lang: "en-US" },
  { id: "coral", label: "Coral (Warm)", lang: "en-US" },
  { id: "echo", label: "Echo (Male)", lang: "en-US" },
  { id: "fable", label: "Fable (British)", lang: "en-GB" },
  { id: "onyx", label: "Onyx (Deep)", lang: "en-US" },
  { id: "nova", label: "Nova (Female)", lang: "en-US" },
  { id: "sage", label: "Sage (Calm)", lang: "en-US" },
  { id: "shimmer", label: "Shimmer (Soft)", lang: "en-US" },
];

/**
 * MiniMax regional API hosts. The path is `/v1/t2a_v2`; the Group ID is only
 * appended when one is configured (new API keys no longer need one). Pick the
 * host that matches where your MiniMax account was created. The international
 * platform moved from api.minimax.io to api.minimaxi.com in 2025; the legacy
 * hosts are kept for accounts created before the migration.
 */
export const MINIMAX_REGIONS: ModelOption[] = [
  { id: "api.minimaxi.com", label: "Global (api.minimaxi.com)" },
  { id: "api-bj.minimaxi.com", label: "Global backup (api-bj.minimaxi.com)" },
  { id: "api.minimaxi.chat", label: "Mainland China (api.minimaxi.chat)" },
  { id: "api.minimax.io", label: "Legacy global (api.minimax.io)" },
];

/**
 * MiniMax T2A models. HD favours quality; Turbo favours latency/cost. All
 * families accept the same inputs and return MP3 audio. The 2.8/2.6 families
 * are the current generation (2.8 also supports emotional paralinguistic tags);
 * 02/01 remain supported by the API.
 */
export const MINIMAX_MODELS: ModelOption[] = [
  { id: "speech-2.8-hd", label: "Speech 2.8 HD (newest, best quality)" },
  { id: "speech-2.8-turbo", label: "Speech 2.8 Turbo (newest, fast)" },
  { id: "speech-2.6-hd", label: "Speech 2.6 HD (low latency)" },
  { id: "speech-2.6-turbo", label: "Speech 2.6 Turbo (fast)" },
  { id: "speech-02-hd", label: "Speech 02 HD (quality)" },
  { id: "speech-02-turbo", label: "Speech 02 Turbo (fast)" },
  { id: "speech-01-hd", label: "Speech 01 HD (legacy)" },
  { id: "speech-01-turbo", label: "Speech 01 Turbo (legacy)" },
];

/**
 * language_boost options for the T2A request body. "auto" lets MiniMax detect
 * the language; "off" omits the field; every other value is sent verbatim
 * (e.g. "French"). Values mirror the official API enum.
 */
export const MINIMAX_LANGUAGE_BOOSTS: ModelOption[] = [
  { id: "auto", label: "Auto-detect (recommended)" },
  { id: "off", label: "Off (do not send language_boost)" },
  { id: "Chinese", label: "Chinese" },
  { id: "Chinese,Yue", label: "Chinese (Cantonese)" },
  { id: "English", label: "English" },
  { id: "French", label: "French" },
  { id: "Spanish", label: "Spanish" },
  { id: "German", label: "German" },
  { id: "Italian", label: "Italian" },
  { id: "Portuguese", label: "Portuguese" },
  { id: "Russian", label: "Russian" },
  { id: "Japanese", label: "Japanese" },
  { id: "Korean", label: "Korean" },
  { id: "Arabic", label: "Arabic" },
  { id: "Turkish", label: "Turkish" },
  { id: "Dutch", label: "Dutch" },
  { id: "Ukrainian", label: "Ukrainian" },
  { id: "Vietnamese", label: "Vietnamese" },
  { id: "Indonesian", label: "Indonesian" },
  { id: "Thai", label: "Thai" },
  { id: "Polish", label: "Polish" },
  { id: "Romanian", label: "Romanian" },
  { id: "Greek", label: "Greek" },
  { id: "Czech", label: "Czech" },
  { id: "Finnish", label: "Finnish" },
  { id: "Hindi", label: "Hindi" },
  { id: "Bulgarian", label: "Bulgarian" },
  { id: "Danish", label: "Danish" },
  { id: "Hebrew", label: "Hebrew" },
  { id: "Malay", label: "Malay" },
  { id: "Persian", label: "Persian" },
  { id: "Slovak", label: "Slovak" },
  { id: "Swedish", label: "Swedish" },
  { id: "Croatian", label: "Croatian" },
  { id: "Filipino", label: "Filipino" },
  { id: "Hungarian", label: "Hungarian" },
  { id: "Norwegian", label: "Norwegian" },
  { id: "Slovenian", label: "Slovenian" },
  { id: "Catalan", label: "Catalan" },
  { id: "Nynorsk", label: "Nynorsk" },
  { id: "Tamil", label: "Tamil" },
  { id: "Afrikaans", label: "Afrikaans" },
];

/**
 * Curated MiniMax system voices. The `id` is the MiniMax `voice_id`. All voices
 * are multilingual (the model speaks the language of the input, aided by
 * `language_boost: "auto"`), so `lang` is only used to group the picker. The
 * classic system ids (male-qn-*, female-*, presenter_*, audiobook_*) are stable
 * across models; the named ids are the newer Speech-02 voices.
 */
export const MINIMAX_VOICES: VoiceOption[] = [
  // Newer named Speech-02 voices (multilingual, natural in English).
  { id: "Wise_Woman", label: "Wise Woman", lang: "en-US" },
  { id: "Calm_Woman", label: "Calm Woman", lang: "en-US" },
  { id: "Friendly_Person", label: "Friendly Person", lang: "en-US" },
  { id: "Inspirational_girl", label: "Inspirational Girl", lang: "en-US" },
  { id: "Lively_Girl", label: "Lively Girl", lang: "en-US" },
  { id: "Deep_Voice_Man", label: "Deep Voice Man", lang: "en-US" },
  { id: "Patient_Man", label: "Patient Man", lang: "en-US" },
  { id: "Elegant_Man", label: "Elegant Man", lang: "en-US" },
  { id: "Casual_Guy", label: "Casual Guy", lang: "en-US" },
  { id: "Young_Knight", label: "Young Knight", lang: "en-US" },
  // Classic Chinese system voices (also multilingual).
  { id: "male-qn-qingse", label: "青涩青年 (Youthful Male)", lang: "zh-CN" },
  { id: "male-qn-jingying", label: "精英青年 (Elite Male)", lang: "zh-CN" },
  { id: "male-qn-badao", label: "霸道青年 (Domineering Male)", lang: "zh-CN" },
  { id: "female-shaonv", label: "少女 (Young Female)", lang: "zh-CN" },
  { id: "female-yujie", label: "御姐 (Mature Female)", lang: "zh-CN" },
  { id: "female-chengshu", label: "成熟女性 (Adult Female)", lang: "zh-CN" },
  { id: "female-tianmei", label: "甜美女性 (Sweet Female)", lang: "zh-CN" },
  { id: "presenter_male", label: "主持人 (Male Presenter)", lang: "zh-CN" },
  { id: "presenter_female", label: "主持人 (Female Presenter)", lang: "zh-CN" },
  { id: "audiobook_male_1", label: "有声书 (Male Narrator)", lang: "zh-CN" },
  {
    id: "audiobook_female_1",
    label: "有声书 (Female Narrator)",
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

  OPENAI_API_KEY: "",
  OPENAI_VOICE: "alloy",
  OPENAI_MODEL: "gpt-4o-mini-tts",

  MINIMAX_API_KEY: "",
  MINIMAX_GROUP_ID: "",
  MINIMAX_VOICE: "Wise_Woman",
  MINIMAX_MODEL: "speech-2.8-hd",
  MINIMAX_HOST: "api.minimaxi.com",
  MINIMAX_LANGUAGE_BOOST: "auto",

  spellOutAcronyms: false,
  readCodeBlocks: false,
  skipMarkersEnabled: false,
  skipEnclosedTypes: [],
  customSkipPairs: [],
  autoDownloadAudio: false,
  // Embed the saved MP3 in the note. On by default so manual downloads keep
  // their previous behaviour (save + embed). Turn off to download only.
  autoEmbedAudio: true,
  skipUrls: false,
  rewindSeconds: DEFAULT_SKIP_SECONDS,
  forwardSeconds: DEFAULT_SKIP_SECONDS,
  folderSelectorFollowsNote: true,
  playNoteSavedAudio: true,
  defaultAudioFolder: "",
  favoriteAudioFolders: [],
  audioFolderMigrated: false,
  acronymDefaultMigrated: false,
  playerPanePlaced: false,
  lastWhatsNewVersion: "",
};
