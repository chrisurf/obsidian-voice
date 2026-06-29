import { App, TFile, Notice, normalizePath } from "obsidian";
import { suggestFreeBaseName } from "./audioFolders";
import { normalizeFolderPath } from "./chapters";
import type { ConflictChoice } from "../ui/FileConflictModal";

/** Asks the user how to resolve a same-name conflict in the target folder. */
export type ConflictResolver = (info: {
  fileName: string;
  folder: string;
  suggested: string;
}) => Promise<ConflictChoice>;

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
   * Save a freshly generated blob to a folder, or move an existing MP3 into it,
   * prompting via `resolveConflict` when a file of the same name already exists.
   * Used by the folder picker: synthesized audio is saved (and embedded when
   * requested); an already-saved file (a loaded chapter) is moved with its
   * embeds/links updated.
   */
  async saveOrMove(params: {
    kind: "save" | "move";
    blob?: Blob;
    sourceFile?: TFile;
    baseName: string;
    folder: string;
    embed: boolean;
    resolveConflict: ConflictResolver;
  }): Promise<void> {
    try {
      const dir = this.resolveSaveDir(params.folder, "");
      await this.ensureFolderExists(dir);

      const pathFor = (base: string): string =>
        normalizePath(dir ? `${dir}/${base}.mp3` : `${base}.mp3`);
      const sourcePath = params.sourceFile?.path;

      // Resolve same-name conflicts (a rename can still collide, so loop).
      let baseName = params.baseName;
      for (;;) {
        const existing = this.app.vault.getAbstractFileByPath(
          pathFor(baseName),
        );
        const collides =
          existing instanceof TFile && existing.path !== sourcePath;
        if (!collides) {
          break;
        }
        const choice = await params.resolveConflict({
          fileName: `${baseName}.mp3`,
          folder: dir === "" ? "the vault root" : dir,
          suggested: suggestFreeBaseName(
            baseName,
            this.mp3BaseNamesInFolder(dir),
          ),
        });
        if (choice.action === "cancel") {
          return;
        }
        if (choice.action === "rename") {
          baseName = choice.baseName;
          continue;
        }
        break; // replace → keep the name and overwrite below
      }

      const finalPath = pathFor(baseName);

      if (params.kind === "move") {
        await this.performMove(params.sourceFile, finalPath);
        return;
      }

      await this.writeBlob(params.blob, finalPath);
      if (params.embed) {
        await this.insertAudioEmbed(`${baseName}.mp3`);
      }
    } catch (error) {
      console.error("Error saving/moving audio:", error);
      new Notice(`Error saving audio: ${error.message}`);
    }
  }

  /** Move an existing file to finalPath, replacing any file already there. */
  private async performMove(
    source: TFile | undefined,
    finalPath: string,
  ): Promise<void> {
    if (!source || source.path === finalPath) {
      return;
    }
    const existing = this.app.vault.getAbstractFileByPath(finalPath);
    if (existing instanceof TFile && existing.path !== source.path) {
      // fileManager.trashFile() would be preferable but requires a newer
      // Obsidian than the plugin's minAppVersion (1.5.0).
      // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file
      await this.app.vault.delete(existing);
    }
    // fileManager.renameFile updates embeds/links that point at the file.
    await this.app.fileManager.renameFile(source, finalPath);
    new Notice(`Moved: ${finalPath}`);
  }

  /** Create or overwrite the MP3 at finalPath with the blob's bytes. */
  private async writeBlob(
    blob: Blob | undefined,
    finalPath: string,
  ): Promise<void> {
    if (!blob) {
      return;
    }
    const arrayBuffer = await blob.arrayBuffer();
    const existing = this.app.vault.getAbstractFileByPath(finalPath);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, arrayBuffer);
      new Notice(`Updated: ${finalPath}`);
    } else {
      await this.app.vault.createBinary(finalPath, arrayBuffer);
      new Notice(`Created: ${finalPath}`);
    }
  }

  /** Base names (no extension) of the MP3s already in a vault folder. */
  private mp3BaseNamesInFolder(dir: string): string[] {
    const target = normalizeFolderPath(dir === "" ? "/" : dir);
    return this.app.vault
      .getFiles()
      .filter(
        (f) =>
          f.extension === "mp3" &&
          normalizeFolderPath(f.parent?.path ?? "/") === target,
      )
      .map((f) => f.basename);
  }

  /**
   * Save audio blob as an MP3 file.
   * @param audioBlob - The audio data to save
   * @param targetFolder - Vault-relative folder to save into ("/" or "" = vault
   *   root). When omitted, the MP3 is saved next to the active note, preserving
   *   the original behaviour.
   * @returns The created/modified TFile or null on error
   */
  async saveAudioFile(
    audioBlob: Blob,
    targetFolder?: string,
  ): Promise<TFile | null> {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return null;
      }

      // Construct MP3 filename based on active file
      const fileName = activeFile.basename;
      const fileDir = this.resolveSaveDir(
        targetFolder,
        activeFile.parent?.path || "",
      );
      const audioFileName = `${fileName}.mp3`;
      const audioFilePath = normalizePath(
        fileDir ? `${fileDir}/${audioFileName}` : audioFileName,
      );

      // Make sure the destination folder exists before writing into it
      // (custom folders may not have been created yet).
      await this.ensureFolderExists(fileDir);

      // Convert Blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Check if file exists
      const existingFile = this.app.vault.getAbstractFileByPath(audioFilePath);

      let audioFile: TFile;
      if (existingFile instanceof TFile) {
        // Overwrite existing file
        await this.app.vault.modifyBinary(existingFile, arrayBuffer);
        audioFile = existingFile;
        new Notice(`Updated: ${audioFilePath}`);
      } else {
        // Create new file
        audioFile = await this.app.vault.createBinary(
          audioFilePath,
          arrayBuffer,
        );
        new Notice(`Created: ${audioFilePath}`);
      }

      return audioFile;
    } catch (error) {
      console.error("Error saving audio file:", error);
      new Notice(`Error saving audio file: ${error.message}`);
      return null;
    }
  }

  /**
   * Resolve the destination folder for a save.
   * - `undefined` target → next to the active note (original behaviour).
   * - "/" or "" target → the vault root.
   * - otherwise → the given vault-relative folder.
   */
  private resolveSaveDir(
    targetFolder: string | undefined,
    noteFolder: string,
  ): string {
    const dir = targetFolder === undefined ? noteFolder : targetFolder;
    const trimmed = dir.trim();
    // Normalize the vault root ("/" — how Obsidian reports a root note's parent)
    // to "" so paths never become "//file.mp3".
    return trimmed === "/" ? "" : trimmed;
  }

  /**
   * Create the destination folder (and any missing parents) if it does not
   * already exist. No-op for the vault root.
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath) {
      return;
    }
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing) {
      return;
    }
    await this.app.vault.createFolder(folderPath);
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
   * Download audio file and, when requested, insert the embed tag.
   * @param audioBlob - The audio data to save
   * @param embed - Whether to also insert the `![[file.mp3]]` embed in the
   *   note. Defaults to true to preserve the legacy save-and-embed behaviour.
   * @param targetFolder - Vault-relative folder to save into. When omitted, the
   *   MP3 is saved next to the active note. The embed still resolves by file
   *   name, so it works regardless of the folder.
   */
  async downloadAndEmbed(
    audioBlob: Blob,
    embed: boolean = true,
    targetFolder?: string,
  ): Promise<void> {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return;
      }

      const fileName = activeFile.basename;
      const audioFileName = `${fileName}.mp3`;

      // Save the audio file
      const savedFile = await this.saveAudioFile(audioBlob, targetFolder);
      if (!savedFile) {
        return; // Error already shown in saveAudioFile
      }

      // Insert the embed tag only when embedding is enabled
      if (embed) {
        await this.insertAudioEmbed(audioFileName);
      }
    } catch (error) {
      console.error("Error in downloadAndEmbed:", error);
      new Notice(`Error downloading audio: ${error.message}`);
    }
  }
}
