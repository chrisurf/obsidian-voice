import { AwsPollyService } from "../service/AwsPollyService";
import { MarkdownHelper } from "./MarkdownHelper";
import { RegExHelper } from "./RegExHelper";
import { IconEventHandler } from "./IconEventHandler";

export class TextSpeaker {
  private pollyService: AwsPollyService;
  private markdownHelper: MarkdownHelper;
  private iconEventHandler: IconEventHandler;

  constructor(
    pollyService: AwsPollyService,
    markdownHelper: MarkdownHelper,
    iconEventHandler: IconEventHandler,
  ) {
    this.pollyService = pollyService;
    this.markdownHelper = markdownHelper;
    this.iconEventHandler = iconEventHandler;
  }

  async speakText(speed?: number): Promise<void> {
    this.iconEventHandler.ribbonIconHandler();
    if (this.pollyService.isPlaying()) {
      this.pollyService.pauseAudio();
    } else {
      const rawText = await this.markdownHelper.getMarkdownView();
      const cleanedText = new RegExHelper(rawText).getcleanContent();
      await this.pollyService.playCachedAudio(cleanedText, speed);
    }
  }
}
