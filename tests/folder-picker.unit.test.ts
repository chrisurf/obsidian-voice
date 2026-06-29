import { FolderPickerModal } from "../src/ui/FolderPickerModal";

/**
 * Regression test for the custom-folder save bug (issue #57): the picker must
 * resolve with the chosen folder even when Obsidian fires onClose around the
 * same time as onChooseSuggestion. Previously a competing resolve(null) in
 * onClose could win the race, so handleDownloadAudio saw a "cancel" and never
 * saved the MP3.
 */

function makeDeps() {
  const app = {
    vault: { getAllLoadedFiles: () => [] },
  };
  const plugin = {
    settings: {
      favoriteAudioFolders: [] as string[],
      defaultAudioFolder: "",
    },
    saveSettings: jest.fn(async () => {}),
  };
  // The constructor is private at the type level only; instantiate for testing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modal: any = new (FolderPickerModal as any)(app, plugin);
  let resolved: string | null | undefined;
  modal.resolve = (v: string | null) => {
    resolved = v;
  };
  return { modal, getResolved: () => resolved };
}

describe("Unit Tests - Folder Picker resolution", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Obsidian always has a global `window`; the node test env does not.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = globalThis;
  });
  afterEach(() => {
    jest.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
  });

  test("a choice wins even when onClose fires first", () => {
    const { modal, getResolved } = makeDeps();

    // Simulate the racy order: modal closes, then the click's choice lands.
    modal.onClose();
    modal.onChooseSuggestion({
      kind: "folder",
      path: "Mathematics",
      isFavorite: false,
    });

    expect(getResolved()).toBe("Mathematics");

    // The deferred cancel must not override the already-settled choice.
    jest.runAllTimers();
    expect(getResolved()).toBe("Mathematics");
  });

  test("a choice wins in the normal order too", () => {
    const { modal, getResolved } = makeDeps();

    modal.onChooseSuggestion({ kind: "create", path: "Home" });
    modal.onClose();
    jest.runAllTimers();

    expect(getResolved()).toBe("Home");
  });

  test("closing without a choice resolves to a cancel (null)", () => {
    const { modal, getResolved } = makeDeps();

    modal.onClose();
    jest.runAllTimers();

    expect(getResolved()).toBeNull();
  });
});
