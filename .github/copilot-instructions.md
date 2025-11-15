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
│   ├── MarkdownHelper.ts     # Markdown processing
│   ├── AudioFileManager.ts   # MP3 download and embed management
│   ├── IconEventHandler.ts   # UI interactions
│   └── MobileControlBar.ts   # Mobile audio controls
├── processors/
│   ├── MarkdownToSSMLProcessor.ts  # Main pipeline orchestrator
│   ├── pipeline/
│   │   ├── CleanProcessor.ts       # Remove unwanted elements
│   │   ├── EnhanceProcessor.ts     # Add SSML structure
│   │   ├── XmlEscapeProcessor.ts   # XML character safety
│   │   ├── SSMLSerializer.ts       # AST to SSML conversion
│   │   ├── SSMLValidator.ts        # SSML validation
│   │   └── SSMLChunker.ts          # AWS size limit handling
│   └── config/
│       └── DefaultConfig.ts        # Default processor settings
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
- Markdown-to-SSML processing pipeline with AST transformations
- Automatic SSML chunking for large documents
- MP3 download with auto-embed functionality
- Audio embed filtering (prevents reading ![[audio.mp3]] aloud)
- Caching mechanism for audio content
- Mobile support (iOS/Android) with dedicated control bar
- Hotkey integration for all audio controls

## Content Processing Pipeline

The plugin uses a sophisticated Markdown-to-SSML pipeline:

1. **Parse** - unified/remark converts markdown to AST
2. **Clean** - Remove code blocks, images, audio embeds, HTML, wikilinks
3. **Enhance** - Add SSML prosody tags for headings, emphasis
4. **Escape** - XML character safety for AWS Polly
5. **Serialize** - Convert AST back to SSML string
6. **Validate** - Structure verification
7. **Chunk** - Split into AWS-compatible sizes (<3000 chars)

## AWS Integration

- Uses AWS Polly neural engine with 24kHz sample rate
- SSML-based synthesis with automatic chunking
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
