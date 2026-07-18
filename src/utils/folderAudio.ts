import { TFile, TFolder, type TAbstractFile } from "obsidian";
import { normalizeFolderPath } from "./chapters";

/**
 * The slice of Obsidian's Vault this helper needs. Typed structurally so the
 * helper stays trivially testable without standing up a full Vault.
 */
export interface FolderLookup {
  getRoot(): TFolder;
  getAbstractFileByPath(path: string): TAbstractFile | null;
}

/**
 * MP3 files sitting directly inside one vault folder.
 *
 * Resolves that single folder and reads its children rather than pulling every
 * file in the vault via `vault.getFiles()` and filtering down. Two reasons:
 *
 * 1. Access scope — the plugin only ever needs the audio in the folder it is
 *    currently showing, so it should only look there.
 * 2. Cost — this is O(folder) instead of O(vault), and the player's chapter
 *    list refreshes on every folder switch and note change.
 *
 * Uses `getAbstractFileByPath` rather than the tidier `getFolderByPath`, which
 * requires Obsidian 1.5.7 while the manifest's minAppVersion is 1.5.0.
 */
export function mp3FilesInFolder(
  vault: FolderLookup,
  folderPath: string,
): TFile[] {
  const normalized = normalizeFolderPath(folderPath);
  const folder =
    normalized === "/"
      ? vault.getRoot()
      : vault.getAbstractFileByPath(normalized);

  if (!(folder instanceof TFolder)) {
    return [];
  }

  return folder.children.filter(
    (child): child is TFile =>
      child instanceof TFile && child.extension === "mp3",
  );
}
