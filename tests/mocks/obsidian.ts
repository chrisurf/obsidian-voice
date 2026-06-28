/**
 * Minimal mock of the Obsidian API for unit tests.
 *
 * Only the surface used by the services under test is implemented. `requestUrl`
 * is a jest mock that tests configure with mockResolvedValue / mockImplementation.
 */

export const requestUrl = jest.fn();

export class Notice {
  constructor(_message?: string, _timeout?: number) {}
  hide(): void {}
}

export class Plugin {}

export class PluginSettingTab {}

export class Setting {}

export class Modal {
  open(): void {}
  close(): void {}
  onClose(): void {}
}

export class SuggestModal<T> {
  inputEl = {
    addEventListener: (): void => {},
    dispatchEvent: (): boolean => true,
  };
  constructor(_app?: unknown) {}
  setPlaceholder(): void {}
  setInstructions(): void {}
  open(): void {}
  close(): void {}
  onClose(): void {}
  getSuggestions(_query: string): T[] {
    return [];
  }
}

export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export class App {}

export const Platform = { isMobile: false };

export function setIcon(): void {}

export class Menu {
  addItem(): this {
    return this;
  }
  showAtMouseEvent(): void {}
}

export function normalizePath(path: string): string {
  return path;
}
