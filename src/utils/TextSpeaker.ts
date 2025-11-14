import { AwsPollyService } from "../service/AwsPollyService";
import { MarkdownHelper } from "./MarkdownHelper";
import { IconEventHandler } from "./IconEventHandler";
import { MarkdownToSSMLProcessor } from "../processors/MarkdownToSSMLProcessor";
import { Notice } from "obsidian";

/**
 * TextSpeaker - Orchestrates text-to-speech conversion
 *
 * Now uses the new MarkdownToSSMLProcessor pipeline for robust content processing
 */
export class TextSpeaker {
  private pollyService: AwsPollyService;
  private markdownHelper: MarkdownHelper;
  private iconEventHandler: IconEventHandler;
  private ssmlProcessor: MarkdownToSSMLProcessor;

  constructor(
    pollyService: AwsPollyService,
    markdownHelper: MarkdownHelper,
    iconEventHandler: IconEventHandler,
  ) {
    this.pollyService = pollyService;
    this.markdownHelper = markdownHelper;
    this.iconEventHandler = iconEventHandler;

    // Initialize the new SSML processor
    this.ssmlProcessor = new MarkdownToSSMLProcessor({
      voiceType: "neural", // TODO: Make this configurable from settings
    });
  }

  async speakText(speed?: number): Promise<void> {
    this.iconEventHandler.ribbonIconHandler();

    if (this.pollyService.isPlaying()) {
      this.pollyService.pauseAudio();
    } else {
      try {
        // Get raw markdown content
        const rawText = await this.markdownHelper.getMarkdownView();

        // Show processing notice for immediate feedback
        const processingNotice = new Notice("Processing text...", 2000);

        // Process through the new pipeline
        const result = await this.ssmlProcessor.process(rawText);

        // Hide processing notice
        processingNotice.hide();

        // Check for errors
        if (!result.isValid) {
          console.error("SSML validation errors:", result.errors);
          new Notice(
            `Voice Plugin: SSML validation failed\n${result.errors.join("\n")}`,
          );
          return;
        }

        // Show warnings if any
        if (result.warnings.length > 0) {
          console.warn("SSML warnings:", result.warnings);
        }

        // Send SSML to Polly (already includes <speak> tags)
        await this.pollyService.playSSMLAudio(result.ssml, speed);
      } catch (error) {
        console.error("Error in text-to-speech processing:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        new Notice(`Voice Plugin Error: ${errorMessage}`);
      }
    }
  }
}
