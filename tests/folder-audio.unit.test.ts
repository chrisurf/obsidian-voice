import { TFile, TFolder, type TAbstractFile } from "obsidian";
import { mp3FilesInFolder, type FolderLookup } from "../src/utils/folderAudio";

function file(path: string, extension: string): TFile {
  const f = new TFile();
  f.path = path;
  f.name = path.split("/").pop() ?? path;
  f.basename = (f.name.split(".")[0] ?? f.name) as string;
  f.extension = extension;
  return f;
}

function folder(path: string, children: TAbstractFile[]): TFolder {
  const d = new TFolder();
  d.path = path;
  d.name = path.split("/").pop() ?? path;
  d.children = children;
  return d;
}

/**
 * Vault stub that only resolves the folder it is asked for. `getFiles` is
 * deliberately absent: the helper must not reach for a vault-wide listing.
 */
function vault(folders: Record<string, TFolder>, root = folder("/", [])) {
  const lookup: FolderLookup & { lookups: string[] } = {
    lookups: [],
    getRoot: () => root,
    getAbstractFileByPath(path: string) {
      lookup.lookups.push(path);
      return folders[path] ?? null;
    },
  };
  return lookup;
}

describe("folderAudio - Unit", () => {
  it("returns only the MP3s directly inside the requested folder", () => {
    const audio = folder("Audio", [
      file("Audio/one.mp3", "mp3"),
      file("Audio/note.md", "md"),
      file("Audio/two.mp3", "mp3"),
      folder("Audio/Nested", [file("Audio/Nested/deep.mp3", "mp3")]),
    ]);

    const result = mp3FilesInFolder(vault({ Audio: audio }), "Audio");

    expect(result.map((f) => f.path)).toEqual([
      "Audio/one.mp3",
      "Audio/two.mp3",
    ]);
  });

  it("resolves the requested folder instead of listing the whole vault", () => {
    const audio = folder("Audio", [file("Audio/one.mp3", "mp3")]);
    const v = vault({ Audio: audio });

    mp3FilesInFolder(v, "Audio");

    expect(v.lookups).toEqual(["Audio"]);
  });

  it("reads the vault root for '/' without a path lookup", () => {
    const root = folder("/", [file("root.mp3", "mp3"), file("root.md", "md")]);
    const v = vault({}, root);

    expect(mp3FilesInFolder(v, "/").map((f) => f.path)).toEqual(["root.mp3"]);
    expect(v.lookups).toEqual([]);
  });

  it("treats an empty path as the vault root", () => {
    const root = folder("/", [file("root.mp3", "mp3")]);

    expect(mp3FilesInFolder(vault({}, root), "").map((f) => f.path)).toEqual([
      "root.mp3",
    ]);
  });

  it("returns nothing when the folder is missing or is a file", () => {
    const v = vault({ "Audio/one.mp3": undefined as unknown as TFolder });

    expect(mp3FilesInFolder(v, "Nope")).toEqual([]);
    expect(mp3FilesInFolder(v, "Audio/one.mp3")).toEqual([]);
  });
});
