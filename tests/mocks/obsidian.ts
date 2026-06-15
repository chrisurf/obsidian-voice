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
