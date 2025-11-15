import { App, TFile, Notice, normalizePath } from "obsidian";

/**
 * AudioFileManager - Handles saving audio files and managing audio embeds
 *
 * Responsibilities:
 * - Save MP3 files to vault
 * - Detect and parse front matter
 * - Insert audio embed tags at correct position
 * - Validate filename synchronization
 */
export class AudioFileManager {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Save audio blob as MP3 file in the same directory as the active file
   * @param audioBlob - The audio data to save
   * @returns The created/modified TFile or null on error
   */
  async saveAudioFile(audioBlob: Blob): Promise<TFile | null> {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return null;
      }

      // Construct MP3 filename based on active file
      const fileName = activeFile.basename;
      const fileDir = activeFile.parent?.path || "";
      const audioFileName = `${fileName}.mp3`;
      const audioFilePath = normalizePath(
        fileDir ? `${fileDir}/${audioFileName}` : audioFileName,
      );

      // Convert Blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Check if file exists
      const existingFile = this.app.vault.getAbstractFileByPath(audioFilePath);

      let audioFile: TFile;
      if (existingFile instanceof TFile) {
        // Overwrite existing file
        await this.app.vault.modifyBinary(existingFile, arrayBuffer);
        audioFile = existingFile;
        new Notice(`Updated: ${audioFileName}`);
      } else {
        // Create new file
        audioFile = await this.app.vault.createBinary(
          audioFilePath,
          arrayBuffer,
        );
        new Notice(`Created: ${audioFileName}`);
      }

      return audioFile;
    } catch (error) {
      console.error("Error saving audio file:", error);
      new Notice(`Error saving audio file: ${error.message}`);
      return null;
    }
  }

  /**
   * Insert audio embed tag into the active document
   * Handles front matter detection and duplicate checking
   * @param audioFileName - Name of the audio file (without path)
   */
  async insertAudioEmbed(audioFileName: string): Promise<void> {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return;
      }

      // Read current content
      const content = await this.app.vault.read(activeFile);

      // Check if audio embed already exists
      const embedTag = `![[${audioFileName}]]`;
      if (content.includes(embedTag)) {
        // Silently skip if embed already exists
        return;
      }

      // Find front matter boundaries
      const insertPosition = this.findInsertPosition(content);

      // Insert the embed tag
      const newContent =
        content.slice(0, insertPosition) +
        embedTag +
        "\n" +
        content.slice(insertPosition);

      // Save the modified content
      await this.app.vault.modify(activeFile, newContent);
    } catch (error) {
      console.error("Error inserting audio embed:", error);
      new Notice(`Error inserting audio embed: ${error.message}`);
    }
  }

  /**
   * Find the correct position to insert audio embed
   * Returns position after front matter (if exists) or at start
   * @param content - Document content
   * @returns Position index where embed should be inserted
   */
  private findInsertPosition(content: string): number {
    // Check for front matter at the start of the document
    // Pattern: starts with ---, has content, ends with ---
    const frontMatterRegex = /^---\n([\s\S]*?)\n---\n/;
    const match = content.match(frontMatterRegex);

    if (match) {
      // Insert after front matter
      const frontMatterEnd = match[0].length;
      return frontMatterEnd;
    }

    // No front matter, insert at beginning
    return 0;
  }

  /**
   * Download audio file and insert embed in one operation
   * @param audioBlob - The audio data to save
   */
  async downloadAndEmbed(audioBlob: Blob): Promise<void> {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return;
      }

      const fileName = activeFile.basename;
      const audioFileName = `${fileName}.mp3`;

      // Save the audio file
      const savedFile = await this.saveAudioFile(audioBlob);
      if (!savedFile) {
        return; // Error already shown in saveAudioFile
      }

      // Insert the embed tag
      await this.insertAudioEmbed(audioFileName);
    } catch (error) {
      console.error("Error in downloadAndEmbed:", error);
      new Notice(`Error downloading audio: ${error.message}`);
    }
  }
}
