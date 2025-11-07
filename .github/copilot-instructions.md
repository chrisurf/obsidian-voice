# Project Overview

This is an Obsidian Voice Plugin that adds text-to-speech functionality using AWS Polly. It allows users to listen to their notes with customizable voices, speed control, and audio navigation features.

## Technology Stack

- **TypeScript 5.9.3** - Primary language
- **Obsidian API** - Plugin framework
- **AWS SDK v3.926.0** - Polly client for text-to-speech
- **ESBuild 0.25.12** - Build tool
- **ESLint 9.39.1** - Linting with TypeScript ESLint 8.46.3
- **Jest 29.7.0** - Testing framework

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
├── utils/
│   ├── VoicePlugin.ts        # Main plugin class
│   ├── TextSpeaker.ts        # Audio control logic
│   ├── SSMLTagger.ts         # SSML formatting
│   ├── MarkdownHelper.ts     # Markdown processing
│   ├── RegExHelper.ts        # Text utilities
│   └── IconEventHandler.ts   # UI interactions
└── tests/
    ├── unit.test.ts          # Unit tests
    ├── integration.test.ts   # AWS Polly integration tests
    ├── setup.ts              # Test environment setup
    ├── mocks/
    │   └── polly-mock.ts     # AWS service mocking
    └── utils/
        └── test-helpers.ts   # Testing utilities
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
- SSML XML character escaping for special characters (&, <, >, ", ')

## Testing Framework

- Jest 29.7.0 with TypeScript support for comprehensive testing
- Unit tests for core functionality with AWS service mocking
- Integration tests with real AWS Polly API for validation
- Test helpers and utilities for consistent testing patterns
- GitHub Actions CI/CD with automated test execution
