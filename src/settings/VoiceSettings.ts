export interface VoiceSettings {
  VOICE: string;
  SPEED: number;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
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

export const DEFAULT_SETTINGS: VoiceSettings = {
  VOICE: "Stephen",
  SPEED: 1.0,
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
};
