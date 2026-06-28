import { AudioFileManager } from "../src/utils/AudioFileManager";
import { TFile, TFolder } from "./mocks/obsidian";

/**
 * End-to-end save-path test: drives the real AudioFileManager against a fake
 * vault to verify the MP3 actually lands in the requested target folder
 * (issue #57 regression — saving to a custom folder).
 */

function makeFakeApp(existingFolders: string[]) {
  const store = new Map<string, TFile | TFolder>();

  // Vault root + a markdown note "Untitled.md" at the root.
  const root = new TFolder();
  root.path = "/";
  const note = new TFile();
  note.path = "Untitled.md";
  note.basename = "Untitled";
  note.parent = root;

  for (const path of existingFolders) {
    const folder = new TFolder();
    folder.path = path;
    store.set(path, folder);
  }

  const createdFolders: string[] = [];
  const createdFiles: string[] = [];

  const vault = {
    getAbstractFileByPath: (p: string) => store.get(p) ?? null,
    createFolder: jest.fn(async (p: string) => {
      const folder = new TFolder();
      folder.path = p;
      store.set(p, folder);
      createdFolders.push(p);
      return folder;
    }),
    createBinary: jest.fn(async (p: string) => {
      const file = new TFile();
      file.path = p;
      store.set(p, file);
      createdFiles.push(p);
      return file;
    }),
    modifyBinary: jest.fn(async () => {}),
    read: jest.fn(async () => ""),
    modify: jest.fn(async () => {}),
  };

  const app = {
    vault,
    workspace: { getActiveFile: () => note },
  };

  return { app, vault, createdFolders, createdFiles };
}

const fakeBlob = {
  arrayBuffer: async () => new ArrayBuffer(8),
} as unknown as Blob;

describe("Unit Tests - Custom Audio Folder Save Path", () => {
  test("saves the MP3 into an existing custom folder", async () => {
    const { app, createdFiles, createdFolders } = makeFakeApp(["Mathematics"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manager = new AudioFileManager(app as any);

    await manager.downloadAndEmbed(fakeBlob, false, "Mathematics");

    expect(createdFiles).toContain("Mathematics/Untitled.mp3");
    expect(createdFolders).toEqual([]); // folder already existed
  });

  test("creates a missing custom folder, then saves into it", async () => {
    const { app, createdFiles, createdFolders } = makeFakeApp([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manager = new AudioFileManager(app as any);

    await manager.downloadAndEmbed(fakeBlob, false, "Home");

    expect(createdFolders).toContain("Home");
    expect(createdFiles).toContain("Home/Untitled.mp3");
  });

  test("falls back to the note's folder when no target is given", async () => {
    const { app, createdFiles } = makeFakeApp([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manager = new AudioFileManager(app as any);

    await manager.downloadAndEmbed(fakeBlob, false);

    // Note lives at the root, so the MP3 should be saved at the root.
    expect(createdFiles).toContain("Untitled.mp3");
  });
});
