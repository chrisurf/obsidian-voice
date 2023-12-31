export interface VoiceSettings {
  VOICE: string;
  SPEED: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

export const DEFAULT_SETTINGS: VoiceSettings = {
  VOICE: "Stephen",
  SPEED: "1.0",
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
};
