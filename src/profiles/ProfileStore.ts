/**
 * ProfileStore - reads and writes speech profile files.
 *
 * Profiles live in the plugin's own folder by default
 * (<config>/plugins/voice/profiles), or in a vault folder the user picks. Each
 * file is named after its key: default.yaml, de.yaml, de-DE.json, ... The text
 * is kept exactly as written; parsed data is cached for reading.
 */

import { type App, normalizePath, parseYaml, stringifyYaml } from "obsidian";
import { parseProfile, type ParsedProfile } from "./parse";
import { normalizeLanguageKey, type ProfileLayers } from "./resolve";
import { setProfileValue } from "./edit";

export interface StoredProfile {
  key: string;
  path: string;
  text: string;
  parsed: ParsedProfile;
}

const PROFILE_FILE = /^(.+)\.(ya?ml|json)$/i;

export class ProfileStore {
  private profiles = new Map<string, StoredProfile>();
  /** Bumped on every change, so readers can cache derived results. */
  version = 0;

  constructor(
    private app: App,
    private folder: () => string,
  ) {}

  /** Parse profile text (JSON or YAML). */
  static parse(text: string): ParsedProfile {
    return parseProfile(text, parseYaml);
  }

  get folderPath(): string {
    return normalizePath(this.folder());
  }

  /** (Re)read every profile file in the folder. */
  async load(): Promise<void> {
    this.profiles.clear();
    const adapter = this.app.vault.adapter;
    const folder = this.folderPath;
    if (await adapter.exists(folder)) {
      const { files } = await adapter.list(folder);
      for (const path of files) {
        const match = PROFILE_FILE.exec(path.split("/").pop() ?? "");
        if (!match) {
          continue;
        }
        const text = await adapter.read(path);
        const key = normalizeLanguageKey(match[1]);
        this.profiles.set(key, {
          key,
          path,
          text,
          parsed: ProfileStore.parse(text),
        });
      }
    }
    this.version++;
  }

  list(): StoredProfile[] {
    return [...this.profiles.values()].sort((a, b) =>
      a.key === "default"
        ? -1
        : b.key === "default"
          ? 1
          : a.key.localeCompare(b.key),
    );
  }

  get(key: string): StoredProfile | undefined {
    return this.profiles.get(normalizeLanguageKey(key));
  }

  /** The valid profiles' data by key, for resolveProfile(). */
  layers(): ProfileLayers {
    const layers: ProfileLayers = {};
    for (const profile of this.profiles.values()) {
      if (profile.parsed.data) {
        layers[profile.key] = profile.parsed.data;
      }
    }
    return layers;
  }

  /**
   * Save a profile's text under `key`. Nothing is written when the text has
   * errors; the parse result says why. The file extension follows the format.
   */
  async save(key: string, text: string): Promise<ParsedProfile> {
    const parsed = ProfileStore.parse(text);
    if (!parsed.data) {
      return parsed;
    }
    const normalized = normalizeLanguageKey(key);
    const adapter = this.app.vault.adapter;
    const folder = this.folderPath;
    if (!(await adapter.exists(folder))) {
      await adapter.mkdir(folder);
    }
    const path = normalizePath(
      `${folder}/${normalized}.${parsed.format === "json" ? "json" : "yaml"}`,
    );
    const previous = this.profiles.get(normalized);
    await adapter.write(path, text);
    if (
      previous &&
      previous.path !== path &&
      (await adapter.exists(previous.path))
    ) {
      await adapter.remove(previous.path);
    }
    this.profiles.set(normalized, { key: normalized, path, text, parsed });
    this.version++;
    return parsed;
  }

  async remove(key: string): Promise<void> {
    const profile = this.get(key);
    if (!profile) {
      return;
    }
    if (await this.app.vault.adapter.exists(profile.path)) {
      await this.app.vault.adapter.remove(profile.path);
    }
    this.profiles.delete(profile.key);
    this.version++;
  }

  /** Change one setting in a stored profile, keeping its comments. */
  async setValue(key: string, path: string, value: unknown): Promise<void> {
    const profile = this.get(key);
    if (!profile) {
      return;
    }
    const text = setProfileValue(
      profile.text,
      path,
      value,
      parseYaml,
      stringifyYaml,
    );
    await this.save(profile.key, text);
  }

  /**
   * Move every profile to the folder the settings now point at (after the
   * storage location changed). `from` is the previous folder.
   */
  async moveFrom(from: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    const source = normalizePath(from);
    if (source === this.folderPath || !(await adapter.exists(source))) {
      await this.load();
      return;
    }
    const target = this.folderPath;
    if (!(await adapter.exists(target))) {
      await adapter.mkdir(target);
    }
    const { files } = await adapter.list(source);
    for (const path of files) {
      const name = path.split("/").pop() ?? "";
      if (!PROFILE_FILE.test(name)) {
        continue;
      }
      const destination = normalizePath(`${target}/${name}`);
      if (!(await adapter.exists(destination))) {
        await adapter.write(destination, await adapter.read(path));
      }
      await adapter.remove(path);
    }
    await this.load();
  }
}
