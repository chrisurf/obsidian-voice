import type { App } from "obsidian";
import { ProfileStore } from "../src/profiles/ProfileStore";

/** An in-memory stand-in for Obsidian's vault adapter. */
function memoryApp(): { app: App; files: Map<string, string> } {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const adapter = {
    exists: async (path: string) => files.has(path) || folders.has(path),
    mkdir: async (path: string) => void folders.add(path),
    list: async (path: string) => ({
      files: [...files.keys()].filter(
        (f) =>
          f.startsWith(`${path}/`) && !f.slice(path.length + 1).includes("/"),
      ),
      folders: [],
    }),
    read: async (path: string) => files.get(path) ?? "",
    write: async (path: string, text: string) => void files.set(path, text),
    remove: async (path: string) => void files.delete(path),
  };
  return { app: { vault: { adapter } } as unknown as App, files };
}

describe("Speech profile store Unit", () => {
  it("saves, reloads and lists profiles, default first", async () => {
    const { app, files } = memoryApp();
    const store = new ProfileStore(app, () => "plugins/voice/profiles");
    await store.save("de_de", "voiceProfile: 1\ncontent:\n  urls: skip\n");
    await store.save("default", '{"voiceProfile": 1}');
    expect([...files.keys()].sort()).toEqual([
      "plugins/voice/profiles/de-DE.yaml",
      "plugins/voice/profiles/default.json",
    ]);

    const reloaded = new ProfileStore(app, () => "plugins/voice/profiles");
    await reloaded.load();
    expect(reloaded.list().map((p) => p.key)).toEqual(["default", "de-DE"]);
    expect(reloaded.layers()["de-DE"]).toEqual({
      voiceProfile: 1,
      content: { urls: "skip" },
    });
  });

  it("refuses to save a profile with errors", async () => {
    const { app, files } = memoryApp();
    const store = new ProfileStore(app, () => "p");
    const result = await store.save("de", "content:\n  urls: skip\n");
    expect(result.errors[0]).toMatch(/voiceProfile/);
    expect(files.size).toBe(0);
  });

  it("replaces the file when the format changes", async () => {
    const { app, files } = memoryApp();
    const store = new ProfileStore(app, () => "p");
    await store.save("de", "voiceProfile: 1\n");
    await store.save("de", '{"voiceProfile": 1}');
    expect([...files.keys()]).toEqual(["p/de.json"]);
  });

  it("changes one value and keeps the comments", async () => {
    const { app, files } = memoryApp();
    const store = new ProfileStore(app, () => "p");
    await store.save(
      "default",
      "voiceProfile: 1\n# mine\ncontent:\n  urls: read\n",
    );
    await store.setValue("default", "content.urls", "skip");
    expect(files.get("p/default.yaml")).toBe(
      "voiceProfile: 1\n# mine\ncontent:\n  urls: skip\n",
    );
    expect(store.layers().default).toEqual({
      voiceProfile: 1,
      content: { urls: "skip" },
    });
  });

  it("removes profiles and moves them to a new folder", async () => {
    const { app, files } = memoryApp();
    let folder = "plugin/profiles";
    const store = new ProfileStore(app, () => folder);
    await store.save("default", "voiceProfile: 1\n");
    await store.save("de", "voiceProfile: 1\n");
    await store.remove("de");
    expect([...files.keys()]).toEqual(["plugin/profiles/default.yaml"]);

    folder = "Voice/Profiles";
    await store.moveFrom("plugin/profiles");
    expect([...files.keys()]).toEqual(["Voice/Profiles/default.yaml"]);
    expect(store.list().map((p) => p.key)).toEqual(["default"]);
  });
});
