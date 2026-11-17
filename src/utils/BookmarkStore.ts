import { App, Notice, TFile } from "obsidian";
import {
  addBookmark,
  removeBookmark,
  renameBookmark,
  type AddResult,
  type Bookmark,
} from "./bookmarks";
import {
  readChapters,
  UnsupportedTagError,
  writeChapters,
} from "./id3Chapters";
import type { LoadedReading } from "../service/SpeechProvider";

/** What a bookmark is set in: a saved MP3, or a reading not saved yet. */
export type BookmarkTarget =
  | { kind: "file"; path: string }
  | { kind: "reading"; reading: LoadedReading };

/** What the store needs from the plugin. */
export interface BookmarkHost {
  /** Bookmarks not yet written, by path (persisted with the settings). */
  getJournal(): Record<string, { startMs: number; title: string }[]>;
  setJournal(
    journal: Record<string, { startMs: number; title: string }[]>,
  ): Promise<void>;
  /** The file is loaded in the player and playing. */
  isPlaying(path: string): boolean;
  /** The file was rewritten: reload it if it is loaded in the player. */
  reloadIfLoaded(path: string): void;
}

/** Wait this long after the last change before writing the MP3. */
const WRITE_DELAY_MS = 2000;
/** A file change this soon after our own write is that write. */
const OWN_WRITE_MS = 3000;

/**
 * Keeps the bookmarks of the audio files and writes them into the MP3s as
 * ID3v2 chapters.
 *
 * Writing an MP3 means writing the whole file (and syncing it again), so
 * changes are collected and written a moment after the last one — never
 * while the file plays, since that would cut it; it is written when it is
 * paused, stopped or replaced. Until then, the bookmarks are kept with the
 * settings so none are lost if Obsidian closes first.
 *
 * A reading that is not saved yet keeps its bookmarks in memory; saving it
 * writes them into the new file (see bytesForSave).
 */
export class BookmarkStore {
  private files = new Map<string, Bookmark[]>();
  private loading = new Map<string, Promise<Bookmark[]>>();
  private dirty = new Set<string>();
  private ownWrites = new Map<string, number>();
  private reading: {
    id: number;
    path: string | null;
    list: Bookmark[];
    /** The file the reading was saved as; its bookmarks live there now. */
    savedAs: string | null;
  } | null = null;
  private timer: number | null = null;
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private nextId = 0;

  constructor(
    private app: App,
    private host: BookmarkHost,
  ) {
    // Bookmarks that were not written before Obsidian closed.
    for (const [path, list] of Object.entries(host.getJournal())) {
      this.files.set(
        path,
        list.map((b) => ({ ...b, id: this.newId() })),
      );
      this.dirty.add(path);
    }
  }

  /** Call after a change (to re-render bookmarks). Returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The bookmarks of a target, or null while a file is still being read. */
  get(target: BookmarkTarget): Bookmark[] | null {
    const path = this.filePath(target);
    if (path === null) {
      return this.readingFor(target)?.list ?? [];
    }
    const list = this.files.get(path);
    if (!list) {
      void this.load(path);
      return null;
    }
    return list;
  }

  /** A file's bookmarks if they are known, without reading the file. */
  peek(path: string): Bookmark[] | null {
    return this.files.get(path) ?? null;
  }

  /** Read a file's bookmarks (once; later calls reuse them). */
  load(path: string): Promise<Bookmark[]> {
    const known = this.files.get(path);
    if (known) {
      return Promise.resolve(known);
    }
    let pending = this.loading.get(path);
    if (!pending) {
      pending = this.readFile(path).finally(() => this.loading.delete(path));
      this.loading.set(path, pending);
    }
    return pending;
  }

  /** The file a target's bookmarks are stored in, or null for a reading. */
  filePath(target: BookmarkTarget): string | null {
    if (target.kind === "file") {
      return target.path;
    }
    return this.readingFor(target)?.savedAs ?? null;
  }

  async add(target: BookmarkTarget, startMs: number): Promise<AddResult> {
    const list = await this.listFor(target);
    const result = addBookmark(list, startMs, this.newId());
    if (result.added) {
      this.update(target, result.list);
    }
    return result;
  }

  async rename(
    target: BookmarkTarget,
    id: string,
    title: string,
  ): Promise<void> {
    this.update(target, renameBookmark(await this.listFor(target), id, title));
  }

  async remove(target: BookmarkTarget, id: string): Promise<void> {
    this.update(target, removeBookmark(await this.listFor(target), id));
  }

  /**
   * Write the changed files that are not playing (all of them with `force`,
   * e.g. when the plugin unloads).
   */
  flush(force = false): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    for (const path of [...this.dirty]) {
      if (force || !this.host.isPlaying(path)) {
        this.dirty.delete(path);
        this.writing = this.writing.then(() => this.write(path));
      }
    }
    return this.writing;
  }

  /**
   * The bytes to save for a generated reading: with the bookmarks set while
   * it played, written as chapters. From then on its bookmarks are stored in
   * the saved file.
   */
  async bytesForSave(
    blob: Blob,
    path: string,
    reading: LoadedReading | null,
  ): Promise<ArrayBuffer> {
    const bytes = await blob.arrayBuffer();
    const own = reading ? this.readingFor({ kind: "reading", reading }) : null;
    const isMp3 = path.toLowerCase().endsWith(".mp3");
    // The saved file replaces whatever was stored at that path.
    this.forget(path);
    if (!own || !isMp3) {
      return bytes;
    }
    own.savedAs = path;
    this.files.set(path, own.list);
    this.emit();
    return own.list.length > 0 ? writeChapters(bytes, own.list) : bytes;
  }

  /** A file was renamed or moved: its bookmarks follow it. */
  renamed(oldPath: string, newPath: string): void {
    const list = this.files.get(oldPath);
    if (list) {
      this.files.delete(oldPath);
      this.files.set(newPath, list);
    }
    if (this.dirty.delete(oldPath)) {
      this.dirty.add(newPath);
      void this.journal(newPath, list ?? null, oldPath);
    }
    if (this.reading?.savedAs === oldPath) {
      this.reading.savedAs = newPath;
    }
    this.emit();
  }

  /** A file was deleted, or changed by someone else: drop what we know. */
  forget(path: string): void {
    this.files.delete(path);
    if (this.dirty.delete(path)) {
      void this.journal(path, null);
    }
    if (this.reading?.savedAs === path) {
      this.reading.savedAs = null;
    }
    this.emit();
  }

  /** A file changed on disk: re-read it unless the change was ours. */
  modified(path: string): void {
    const ownWrite = this.ownWrites.get(path);
    if (ownWrite !== undefined && Date.now() - ownWrite < OWN_WRITE_MS) {
      return;
    }
    if (this.files.has(path) && !this.dirty.has(path)) {
      this.files.delete(path);
      this.emit();
    }
  }

  private async listFor(target: BookmarkTarget): Promise<Bookmark[]> {
    const path = this.filePath(target);
    if (path !== null) {
      return this.load(path);
    }
    return this.readingFor(target, true)?.list ?? [];
  }

  private update(target: BookmarkTarget, list: Bookmark[]): void {
    const path = this.filePath(target);
    if (path === null) {
      const reading = this.readingFor(target, true);
      if (reading) {
        reading.list = list;
      }
    } else {
      this.files.set(path, list);
      this.dirty.add(path);
      void this.journal(path, list);
      this.schedule();
    }
    this.emit();
  }

  /**
   * The bookmarks of a generated reading. Only the reading in the player has
   * them: a new reading starts without (with `create`, it replaces the old).
   */
  private readingFor(target: BookmarkTarget, create = false) {
    if (target.kind !== "reading") {
      return null;
    }
    const { reading } = target;
    if (this.reading?.id !== reading.id) {
      if (!create) {
        return null;
      }
      this.reading = {
        id: reading.id,
        path: reading.path,
        list: [],
        savedAs: null,
      };
    }
    return this.reading;
  }

  private schedule(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, WRITE_DELAY_MS);
  }

  private async readFile(path: string): Promise<Bookmark[]> {
    const file = this.app.vault.getAbstractFileByPath(path);
    let list: Bookmark[] = [];
    if (file instanceof TFile && file.extension.toLowerCase() === "mp3") {
      try {
        list = readChapters(await this.app.vault.readBinary(file)).map((b) => ({
          ...b,
          id: this.newId(),
        }));
      } catch (error) {
        console.error("Voice: could not read bookmarks", error);
      }
    }
    // A change made while reading wins.
    const current = this.files.get(path);
    if (current) {
      return current;
    }
    this.files.set(path, list);
    this.emit();
    return list;
  }

  private async write(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    const list = this.files.get(path);
    if (!(file instanceof TFile) || !list) {
      await this.journal(path, null);
      return;
    }
    try {
      const bytes = writeChapters(await this.app.vault.readBinary(file), list);
      this.ownWrites.set(path, Date.now());
      await this.app.vault.modifyBinary(file, bytes);
      this.ownWrites.set(path, Date.now());
      if (!this.dirty.has(path)) {
        await this.journal(path, null);
      }
      this.host.reloadIfLoaded(path);
    } catch (error) {
      if (error instanceof UnsupportedTagError) {
        new Notice(
          `Bookmarks can't be saved in ${file.name}: ${error.message}`,
        );
        await this.journal(path, null);
        return;
      }
      console.error("Voice: could not save bookmarks", error);
      new Notice(
        `Could not save the bookmarks in ${file.name}. They are kept and saved next time.`,
      );
    }
  }

  /** Keep (or, with null, drop) a file's unwritten bookmarks. */
  private async journal(
    path: string,
    list: Bookmark[] | null,
    dropPath?: string,
  ): Promise<void> {
    const journal = { ...this.host.getJournal() };
    if (dropPath !== undefined) {
      delete journal[dropPath];
    }
    if (list) {
      journal[path] = list.map(({ startMs, title }) => ({ startMs, title }));
    } else if (path in journal) {
      delete journal[path];
    } else if (dropPath === undefined) {
      return;
    }
    await this.host.setJournal(journal);
  }

  private newId(): string {
    return `bm${++this.nextId}`;
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
