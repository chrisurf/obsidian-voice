# Project Overview

This is an Obsidian Voice Plugin that adds text-to-speech functionality using AWS Polly. It allows users to listen to their notes with customizable voices, speed control, and audio navigation features.

## Technology Stack

- **TypeScript 4.7.4** - Primary language
- **Obsidian API** - Plugin framework
- **AWS SDK v3** - Polly client for text-to-speech
- **ESBuild 0.17.3** - Build tool
- **ESLint 9.19.0** - Linting with TypeScript ESLint 8.22.0

## Project Structure

```
src/
├── main.ts                   # Entry point
├── service/
│   └── AwsPollyService.ts    # AWS Polly integration
├── settings/
│   ├── VoiceSettings.ts      # Settings interface
│   ├── VoiceSettingTab.ts    # Settings UI
│   └── HotkeySettings.ts     # Hotkey configuration
└── utils/
    ├── VoicePlugin.ts        # Main plugin class
    ├── TextSpeaker.ts        # Audio control logic
    ├── SSMLTagger.ts         # SSML formatting
    ├── MarkdownHelper.ts     # Markdown processing
    ├── RegExHelper.ts        # Text utilities
    └── IconEventHandler.ts   # UI interactions
```

## Coding Standards

- Use TypeScript with strict null checks enabled
- Follow ES6+ syntax with async/await patterns
- Use ESLint recommended TypeScript configuration
- Import Obsidian types: `Plugin`, `PluginSettingTab`, `Setting`
- AWS SDK v3 modular imports: `import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly"`

## Key Features

- Text-to-speech with 25+ voices and 18 languages
- Audio controls: play, pause, rewind, fast-forward
- Tempo adjustment (0.5x to 2x speed)
- SSML tagging for enhanced speech synthesis
- Caching mechanism for audio content
- Mobile support (iOS/Android)
- Hotkey integration for all audio controls

## AWS Integration

- Uses AWS Polly neural engine with 24kHz sample rate
- Supports chunked text processing for large documents
- Requires user AWS credentials (Access Key ID, Secret Access Key, Region)
- Implements proper error handling for AWS service calls