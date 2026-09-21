import type { SpeechProvider } from "../service/SpeechProvider";
import { MarkdownHelper } from "./MarkdownHelper";
import { IconEventHandler } from "./IconEventHandler";
import { MarkdownToSSMLProcessor } from "../processors/MarkdownToSSMLProcessor";
import { MarkdownToTextProcessor } from "../processors/MarkdownToTextProcessor";
import {
  NO_NOTE_MESSAGE,
  EMPTY_NOTE_MESSAGE,
  READ_ERROR_MESSAGE,
  friendlySpeechError,
} from "./speechFeedback";
import { Notice } from "obsidian";
import { splitMarkdownByHeading } from "./textSections";

/**
 * TextSpeaker - Orchestrates text-to-speech conversion
 *
 * Processes the active note and hands the result to the active speech
 * provider. Providers declare which input they need via `inputFormat`:
 * - "ssml" (AWS Polly) → MarkdownToSSMLProcessor
 * - "text" (ElevenLabs) → MarkdownToTextProcessor
 */
export class TextSpeaker {
  private provider: SpeechProvider;
  private markdownHelper: MarkdownHelper;
  private iconEventHandler: IconEventHandler;
  private ssmlProcessor: MarkdownToSSMLProcessor;
  private textProcessor: MarkdownToTextProcessor;
  private spellOutAcronyms: boolean;
  private readCodeBlocks: boolean;
  private skipUrls: boolean;

  constructor(
    provider: SpeechProvider,
    markdownHelper: MarkdownHelper,
    iconEventHandler: IconEventHandler,
    spellOutAcronyms: boolean = false,
    readCodeBlocks: boolean = false,
    skipUrls: boolean = false,
  ) {
    this.provider = provider;
    this.markdownHelper = markdownHelper;
    this.iconEventHandler = iconEventHandler;
    this.spellOutAcronyms = spellOutAcronyms;
    this.readCodeBlocks = readCodeBlocks;
    this.skipUrls = skipUrls;

    // Shared content options for both pipelines. When code blocks should be
    // read, keep them in the spoken output; otherwise the cleaner replaces
    // them with a short placeholder. URLs are stripped when skipUrls is on.
    const contentOptions = {
      removeCodeBlocks: !this.readCodeBlocks,
      skipUrls: this.skipUrls,
    };

    // SSML pipeline (AWS Polly)
    this.ssmlProcessor = new MarkdownToSSMLProcessor({
      voiceType: "neural", // TODO: Make this configurable from settings
      spellOutAcronyms: this.spellOutAcronyms,
      ...contentOptions,
    });

    // Plain-text pipeline (ElevenLabs and other non-SSML providers). It also
    // needs the acronym setting so it can title-case acronyms when spell-out is
    // off, keeping pronunciation consistent with the SSML providers. The pause
    // style follows the active provider so each engine gets pause markup it
    // understands (ElevenLabs `<break>`, MiniMax `<#x#>`, others newline-only) —
    // TextSpeaker is rebuilt on provider change, so this stays in sync.
    this.textProcessor = new MarkdownToTextProcessor(
      {
        ...contentOptions,
        spellOutAcronyms: this.spellOutAcronyms,
      },
      { pauseStyle: this.provider.textPauseStyle },
    );
  }

  async speakText(speed?: number): Promise<void> {
    this.iconEventHandler.ribbonIconHandler();

    if (this.provider.isPlaying()) {
      this.provider.pauseAudio();
      return;
    }

    // Guard: Prevent concurrent operations
    if (this.provider.isOperationInProgress()) {
      return;
    }

    // Start operation and get unique request ID
    const requestId = this.provider.startOperation();

    try {
      // Get the note text to read (or a reason it couldn't be read)
      const read = await this.markdownHelper.getMarkdownView();

      // Validate request still active after async operation
      if (!this.provider.isCurrentRequest(requestId)) {
        return;
      }

      // Friendly feedback instead of reading an error string aloud: no note
      // open, an unreadable note, or a note with no text to speak.
      if (!read.ok) {
        new Notice(
          read.reason === "no-note" ? NO_NOTE_MESSAGE : READ_ERROR_MESSAGE,
        );
        return;
      }
      const rawText = read.text;
      if (rawText.trim() === "") {
        new Notice(EMPTY_NOTE_MESSAGE);
        return;
      }

      // Show processing notice for immediate feedback
      const processingNotice = new Notice("Processing text...", 2000);

      const activeFilePath = this.markdownHelper.getActiveFilePath();

      try {
        if (this.provider.inputFormat === "text") {
          const sections = splitMarkdownByHeading(rawText);
          const parts: { title: string; text: string }[] = [];
          for (const section of sections) {
            const text = await this.processContent(section.markdown);
            if (text && text.trim()) {
              parts.push({
                title: section.title || "Note",
                text,
              });
            }
          }
          processingNotice.hide();
          if (!this.provider.isCurrentRequest(requestId)) {
            return;
          }
          if (parts.length === 0) {
            new Notice(EMPTY_NOTE_MESSAGE);
            return;
          }
          await this.provider.speakNoteSections(
            parts,
            speed,
            activeFilePath || undefined,
          );
        } else {
          const content = await this.processContent(rawText);
          processingNotice.hide();
          if (!this.provider.isCurrentRequest(requestId)) {
            return;
          }
          if (content === null) {
            return;
          }
          await this.provider.speak(
            content,
            speed,
            activeFilePath || undefined,
          );
        }
      } catch (speakError) {
        if (speakError instanceof Error && speakError.name === "AbortError") {
          return;
        }
        console.error("Speech synthesis failed:", speakError);
        return;
      }

      // Auto-save the generated audio to the note if the user enabled it
      await this.iconEventHandler.maybeAutoDownloadAudio();
    } catch (error) {
      // Check if it was a cancellation
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error("Error in text-to-speech processing:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(friendlySpeechError(errorMessage));
    } finally {
      // Always cleanup operation, even if cancelled or error occurred
      this.provider.endOperation(requestId);
    }
  }

  /**
   * Produce the content string the active provider expects, or null if
   * processing failed (a user notice is shown in that case).
   */
  private async processContent(rawText: string): Promise<string | null> {
    if (this.provider.inputFormat === "text") {
      return this.textProcessor.process(rawText);
    }

    const result = await this.ssmlProcessor.process(rawText);

    if (!result.isValid) {
      console.error("SSML validation errors:", result.errors);
      new Notice(
        friendlySpeechError(
          `SSML validation failed: ${result.errors.join("; ")}`,
        ),
      );
      return null;
    }

    if (result.warnings.length > 0) {
      console.warn("SSML warnings:", result.warnings);
    }

    return result.ssml;
  }
}
