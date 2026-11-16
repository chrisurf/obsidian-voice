/**
 * ProfileEditorModal - view, edit, paste or import a speech profile.
 *
 * The top half is generated from the profile format's field list (FIELDS):
 * every field becomes the control its kind calls for (enum → dropdown,
 * boolean → toggle, duration → slider, text → text field, list → text area),
 * so new fields appear here without UI code. The bottom half is the profile's
 * text, editable directly; JSON or YAML is detected while typing, and the
 * profile is only saved when it is valid.
 */

import {
  type App,
  Modal,
  Notice,
  Setting,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import {
  FIELDS,
  getPath,
  parseDuration,
  parseWordList,
  type FieldDefinition,
} from "../profiles/schema";

/** "written: spoken" lines → pairs; the first ": " splits a line. */
function parsePairs(text: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(": ");
    if (at > 0) {
      pairs[line.slice(0, at).trim()] = line.slice(at + 2).trim();
    }
  }
  return pairs;
}
import { ProfileStore } from "../profiles/ProfileStore";
import { setProfileValue } from "../profiles/edit";
import { normalizeLanguageKey, resolveProfile } from "../profiles/resolve";
import type { ParsedProfile } from "../profiles/parse";

export interface ProfileEditorOptions {
  /** Profile key, or null to ask for one (new profile). */
  key: string | null;
  text: string;
  /** Open the file picker right away (the "Import" entry point). */
  importOnOpen?: boolean;
  /** Save the text under the key; resolves to the parse result. */
  onSave: (key: string, text: string) => Promise<ParsedProfile>;
}

export class ProfileEditorModal extends Modal {
  private key: string;
  private text: string;
  private parsed: ParsedProfile;
  private textArea!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private formEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;

  constructor(
    app: App,
    private options: ProfileEditorOptions,
  ) {
    super(app);
    this.key = options.key ?? "";
    this.text = options.text;
    this.parsed = ProfileStore.parse(this.text);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("voice-profile-editor");
    // Sizes the dialog itself (a class rather than `.modal:has(...)`).
    this.modalEl.addClass("voice-profile-editor-modal");
    this.titleEl.setText(
      this.options.key
        ? `Speech profile: ${this.options.key}`
        : "New speech profile",
    );

    if (this.options.key === null) {
      new Setting(contentEl)
        .setName("Language")
        .setDesc(
          'A language code such as de or en-US, or "default" for every language without its own profile.',
        )
        .addText((text) =>
          text
            .setPlaceholder("de")
            .setValue(this.key)
            .onChange((value) => {
              this.key = value.trim();
              this.updateStatus();
            }),
        );
    }

    this.formEl = contentEl.createDiv({ cls: "voice-profile-form" });
    this.renderForm();

    new Setting(contentEl)
      .setName("Profile file")
      .setDesc("YAML or JSON. Paste a profile here, or import a file.")
      .addButton((button) =>
        button.setButtonText("Import file…").onClick(() => this.importFile()),
      );
    this.textArea = contentEl.createEl("textarea", {
      cls: "voice-profile-text",
      attr: { spellcheck: "false", rows: "16" },
    });
    this.textArea.value = this.text;
    this.textArea.addEventListener("input", () => {
      this.text = this.textArea.value;
      this.parsed = ProfileStore.parse(this.text);
      this.updateStatus();
    });
    // Rebuild the quick settings once typing settles into a valid profile.
    this.textArea.addEventListener("change", () => this.renderForm());

    this.statusEl = contentEl.createDiv({ cls: "voice-profile-status" });

    new Setting(contentEl)
      .addButton((button) => {
        this.saveButton = button.buttonEl;
        button
          .setButtonText("Save")
          .setCta()
          .onClick(() => void this.save());
      })
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      );

    this.updateStatus();
    if (this.options.importOnOpen) {
      this.importFile();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** Quick settings: one control per supported field, from FIELDS. */
  private renderForm(): void {
    this.formEl.empty();
    const data = this.parsed.data;
    if (!data) {
      this.formEl.createDiv({
        cls: "voice-profile-form-note",
        text: "Fix the profile text below to edit its settings here.",
      });
      return;
    }
    for (const field of FIELDS) {
      this.renderField(field, getPath(data, field.path));
    }
  }

  private renderField(field: FieldDefinition, value: unknown): void {
    const setting = new Setting(this.formEl)
      .setName(field.label)
      .setDesc(
        value === undefined
          ? `${field.description} (not set: inherited)`
          : field.description,
      );
    const set = (next: unknown) => this.setValue(field.path, next);
    // What applies while this profile doesn't set the field: the built-in
    // value for its language, shown greyed in empty text fields.
    const inherited = getPath(
      resolveProfile(normalizeLanguageKey(this.key || "default"), {}),
      field.path,
    );

    switch (field.kind) {
      case "enum":
        setting.addDropdown((dropdown) => {
          if (value === undefined) {
            dropdown.addOption("", "Inherited");
          }
          for (const [id, label] of Object.entries(field.options ?? {})) {
            dropdown.addOption(id, label);
          }
          dropdown.setValue(typeof value === "string" ? value : "");
          dropdown.onChange((next) => next && set(next));
        });
        break;
      case "boolean":
        setting.addToggle((toggle) =>
          toggle.setValue(value === true).onChange((next) => set(next)),
        );
        break;
      case "duration": {
        const ms = parseDuration(value);
        setting.addSlider((slider) =>
          slider
            .setLimits(field.min ?? 0, field.max ?? 3000, 50)
            .setValue(ms ?? field.min ?? 0)
            .onChange((next) => set(`${next}ms`)),
        );
        break;
      }
      case "text":
        setting.addText((text) =>
          text
            .setPlaceholder(typeof inherited === "string" ? inherited : "")
            .setValue(typeof value === "string" ? value : "")
            .onChange((next) => set(next)),
        );
        break;
      case "list":
        // Comma-separated, the way the profile files write word lists.
        setting.addTextArea((area) =>
          area
            .setPlaceholder(
              Array.isArray(inherited) && inherited.length > 0
                ? inherited.join(", ")
                : "IT, API, URL",
            )
            .setValue(parseWordList(value).join(", "))
            .onChange((next) => set(parseWordList(next).join(", "))),
        );
        break;
      case "map":
        // One "written: spoken" pair per line.
        setting.addTextArea((area) =>
          area
            .setPlaceholder("JSON: jay-son")
            .setValue(
              Object.entries(value && typeof value === "object" ? value : {})
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join("\n"),
            )
            .onChange((next) => set(parsePairs(next))),
        );
        break;
    }
  }

  /** Write a quick-setting change into the text (keeping its comments). */
  private setValue(path: string, value: unknown): void {
    try {
      this.text = setProfileValue(
        this.text,
        path,
        value,
        parseYaml,
        stringifyYaml,
      );
    } catch (error) {
      new Notice(`Voice: could not update the profile (${String(error)})`);
      return;
    }
    this.textArea.value = this.text;
    this.parsed = ProfileStore.parse(this.text);
    this.updateStatus();
  }

  private updateStatus(): void {
    this.statusEl.empty();
    const { format, errors, warnings } = this.parsed;
    const formatName = format === "json" ? "JSON" : "YAML";
    if (errors.length === 0) {
      this.statusEl.createDiv({
        cls: "voice-profile-ok",
        text: `${formatName} · valid`,
      });
    } else {
      this.statusEl.createDiv({
        cls: "voice-profile-error",
        text: `${formatName} · ${errors.length} problem${errors.length === 1 ? "" : "s"}:`,
      });
    }
    const list = this.statusEl.createEl("ul");
    errors.forEach((e) =>
      list.createEl("li", { cls: "voice-profile-error", text: e }),
    );
    warnings.forEach((w) =>
      list.createEl("li", { cls: "voice-profile-warning", text: w }),
    );

    const keyOk = !!normalizeLanguageKey(this.key) && /^[\w-]+$/.test(this.key);
    this.saveButton.disabled = errors.length > 0 || !keyOk;
  }

  /** Pick a .yaml / .yml / .json file and load it into the editor. */
  private importFile(): void {
    const input = activeDocument.createElement("input");
    input.type = "file";
    input.accept = ".yaml,.yml,.json,application/json,text/yaml";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      void file.text().then((content) => {
        if (!this.key) {
          this.key = file.name.replace(/\.(ya?ml|json)$/i, "");
        }
        this.text = content;
        this.textArea.value = content;
        this.parsed = ProfileStore.parse(content);
        this.renderForm();
        this.updateStatus();
      });
    });
    input.click();
  }

  private async save(): Promise<void> {
    const result = await this.options.onSave(
      normalizeLanguageKey(this.key),
      this.text,
    );
    if (result.errors.length > 0) {
      this.parsed = result;
      this.updateStatus();
      return;
    }
    new Notice(
      `Voice: speech profile "${normalizeLanguageKey(this.key)}" saved.`,
    );
    this.close();
  }
}
