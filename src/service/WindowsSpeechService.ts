/*
 * This provider is desktop-and-Windows only (gated by isWindowsDesktop). It
 * intentionally uses Node's child_process/fs/os/path to drive PowerShell, so
 * the cross-platform "no Node builtins" lint rule does not apply here.
 */
/* eslint-disable import/no-nodejs-modules */
import { spawn } from "child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
/* eslint-enable import/no-nodejs-modules */
import type { VoiceOption, VoiceSettings } from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";
import { WINTTS_SCRIPT } from "./winttsScript";

/**
 * Windows native (offline) Text-to-Speech.
 *
 * Uses the speech engine built into Windows — no API key and no network. Text
 * is handed to a bundled PowerShell bridge (see winttsScript.ts) that renders
 * MP3 chunks via `Windows.Media.SpeechSynthesis` (modern "OneCore" voices) or
 * `System.Speech` (legacy "SAPI" desktop voices) and transcodes them to MP3
 * through the WinRT `MediaTranscoder` (WAV fallback when a system has no MP3
 * encoder). Real MP3 output matters because the rest of the plugin saves and
 * embeds `.mp3` audio.
 *
 * Desktop + Windows only: every entry point is gated by {@link isWindowsDesktop}
 * and reports a clear message elsewhere (mobile, macOS, Linux).
 *
 * The provider takes the plain-text pipeline output (which carries literal
 * `<break time="Xs"/>` pause markers) and rebuilds it into an SSML document, so
 * the native engine — which understands SSML — honours the pauses instead of
 * reading the markers aloud.
 */

// Conservative per-request size. Windows synthesis has no hard input limit, but
// smaller chunks lower first-audio latency and keep progress reporting smooth.
const MAX_CHUNK_CHARS = 4000;

// Abort synthesis if PowerShell produces no stdout for this long (a hung engine
// or a blocked script should not wedge the player forever).
const STDOUT_INACTIVITY_TIMEOUT_MS = 120_000;

// Private-use sentinel wrapping a pause duration in milliseconds. Break markers
// are converted to this space-free token *before* chunking, so the chunker
// never splits a marker or emits its inner spaces as separate words, then back
// to real SSML <break> tags *after* per-chunk XML escaping.
const PAUSE_SENTINEL = String.fromCharCode(0xe000);

/** Raw voice record emitted by the PowerShell bridge's `list` mode. */
interface WindowsRawVoice {
  engine?: string;
  name?: string;
  lang?: string;
  gender?: string;
}

/**
 * True when running in the Obsidian **desktop** app on **Windows**, where
 * `powershell.exe` and Node's child_process/fs are available.
 */
export function isWindowsDesktop(): boolean {
  return (
    typeof process !== "undefined" &&
    process.platform === "win32" &&
    typeof require === "function"
  );
}

/** Absolute path to Windows PowerShell 5.1 (never pwsh 7 — it lacks WinRT). */
function windowsPowershellExe(): string {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  return join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

/** Temp working directory for the bridge script and per-request audio. */
function winttsBaseDir(): string {
  return join(tmpdir(), "obsidian-voice-wintts");
}

/**
 * Write the PowerShell bridge to the temp dir (only when missing or changed)
 * and return its path. The script is embedded in the bundle so the plugin
 * folder still ships nothing but `main.js`.
 */
function ensureWinttsScript(): string {
  const dir = winttsBaseDir();
  mkdirSync(dir, { recursive: true });
  const scriptPath = join(dir, "wintts.ps1");
  let current: string | null = null;
  try {
    current = readFileSync(scriptPath, "utf8");
  } catch {
    current = null;
  }
  if (current !== WINTTS_SCRIPT) {
    writeFileSync(scriptPath, WINTTS_SCRIPT, "utf8");
  }
  return scriptPath;
}

/**
 * Normalize a serializer pause duration ("0.35s", "400ms") to whole
 * milliseconds for the SSML `<break time>` sent to the Windows engine.
 */
export function windowsBreakToMs(duration: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(duration.trim());
  if (!match) {
    return 350;
  }
  const value = parseFloat(match[1]);
  return Math.round(match[2] === "s" ? value * 1000 : value);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turn plain-text pipeline output (carrying `<break time="Xs"/>` markers) into
 * one SSML document per chunk. Markers become space-free sentinels first so the
 * chunker keeps them intact, then real `<break>` tags after XML-escaping the
 * spoken text around them.
 */
export function buildWindowsSsmlChunks(
  text: string,
  lang: string,
  maxLen: number = MAX_CHUNK_CHARS,
): string[] {
  const marked = text.replace(
    /<break\s+time="([^"]+)"\s*\/>/g,
    (_m, dur: string) =>
      `${PAUSE_SENTINEL}${windowsBreakToMs(dur)}${PAUSE_SENTINEL}`,
  );
  const sentinelBreak = new RegExp(
    `${PAUSE_SENTINEL}(\\d+)${PAUSE_SENTINEL}`,
    "g",
  );
  return chunkPlainText(marked, maxLen).map((chunk) => {
    const body = escapeXml(chunk).replace(
      sentinelBreak,
      (_m, ms: string) => `<break time="${ms}ms"/>`,
    );
    return (
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
      `xml:lang="${escapeXml(lang)}">${body}</speak>`
    );
  });
}

/**
 * Map the bridge's raw voice list into the plugin's VoiceOption catalog. Each
 * voice id is `<engine>|<name>` (e.g. "onecore|Microsoft Hortense") so the
 * synthesis path knows which engine to use; the label drops the "Microsoft "
 * prefix and appends the gender when known.
 */
export function parseWindowsVoices(raw: unknown): VoiceOption[] {
  let list: unknown = raw;
  if (!Array.isArray(list)) {
    list = list ? [list] : [];
  }
  const seen = new Set<string>();
  const voices: VoiceOption[] = [];
  for (const entry of list as WindowsRawVoice[]) {
    const name = entry?.name ? String(entry.name) : "";
    if (!name) {
      continue;
    }
    const engine = entry.engine === "sapi" ? "sapi" : "onecore";
    const id = `${engine}|${name}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const gender =
      entry.gender && entry.gender !== "NotSet" && entry.gender !== "Neutral"
        ? ` (${entry.gender})`
        : "";
    voices.push({
      id,
      label: `${name.replace(/^Microsoft\s+/, "")}${gender}`,
      lang: entry.lang ? String(entry.lang) : "en-US",
    });
  }
  return voices;
}

/** Parse a `CHUNK <index> <format> <path>` protocol line, or null. */
export function parseChunkLine(
  line: string,
): { index: number; format: string; path: string } | null {
  const match = /^CHUNK (\d+) (\w+) (.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return { index: Number(match[1]), format: match[2], path: match[3] };
}

/**
 * Spawn the bridge in Windows PowerShell 5.1 and stream its line protocol to
 * `onLine`. Resolves on `DONE`; rejects on an `ERROR` line, spawn failure,
 * unexpected exit, abort, or stdout inactivity.
 */
function runWinttsProcess(
  fileArgs: string[],
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      windowsPowershellExe(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ...fileArgs,
      ],
      { windowsHide: true },
    );

    let settled = false;
    let stdoutBuffer = "";
    let stderrTail = "";
    let sawDone = false;
    let inactivityTimer: number | null = null;

    const finish = (fn: (value?: unknown) => void, value?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (inactivityTimer !== null) {
        window.clearTimeout(inactivityTimer);
      }
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };

    const onAbort = (): void => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";
      finish(reject as (value?: unknown) => void, abortError);
    };

    const resetInactivity = (): void => {
      if (inactivityTimer !== null) {
        window.clearTimeout(inactivityTimer);
      }
      inactivityTimer = window.setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        finish(
          reject as (value?: unknown) => void,
          new Error(
            "Windows speech synthesis timed out (no response from PowerShell).",
          ),
        );
      }, STDOUT_INACTIVITY_TIMEOUT_MS);
    };

    resetInactivity();

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    child.on("error", (err: Error) => {
      finish(
        reject as (value?: unknown) => void,
        new Error(`Could not start Windows PowerShell: ${err.message}`),
      );
    });

    child.stderr.on("data", (data: Buffer) => {
      stderrTail = (stderrTail + String(data)).slice(-2000);
    });

    child.stdout.on("data", (data: Buffer) => {
      resetInactivity();
      stdoutBuffer += String(data);
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        if (line.startsWith("ERROR")) {
          try {
            child.kill();
          } catch {
            /* already gone */
          }
          finish(
            reject as (value?: unknown) => void,
            new Error(
              line.slice(5).trim() || "Windows speech synthesis failed.",
            ),
          );
          return;
        }
        if (line === "DONE") {
          sawDone = true;
          finish(resolve);
          return;
        }
        onLine(line);
      }
    });

    child.on("close", (code: number | null) => {
      if (sawDone) {
        return;
      }
      finish(
        reject as (value?: unknown) => void,
        new Error(
          `Windows PowerShell exited unexpectedly (code ${code})` +
            (stderrTail ? `: ${stderrTail.trim()}` : ""),
        ),
      );
    });
  });
}

export class WindowsSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  // The cached voice catalog from the last successful scan, or null to fall
  // back to a single "system default voice" entry.
  private dynamicVoices: VoiceOption[] | null;

  constructor(voice: string, speed?: number, voiceCatalog?: VoiceOption[]) {
    super(voice, speed);
    this.dynamicVoices =
      voiceCatalog && voiceCatalog.length > 0 ? voiceCatalog : null;
  }

  /**
   * Enumerate the OneCore (modern) and SAPI (legacy desktop) voices installed
   * on this PC via the bundled PowerShell bridge.
   */
  static async listVoices(): Promise<VoiceOption[]> {
    if (!isWindowsDesktop()) {
      throw new Error(
        "Windows native speech is only available in the desktop app on Windows.",
      );
    }
    const scriptPath = ensureWinttsScript();
    let rawJson: string | null = null;
    await runWinttsProcess([scriptPath, "-Mode", "list"], (line) => {
      if (line.startsWith("VOICES ")) {
        rawJson = line.slice(7);
      }
    });
    if (!rawJson) {
      throw new Error("The Windows voice scan returned no result.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error("The Windows voice scan returned invalid data.");
    }
    return parseWindowsVoices(parsed);
  }

  getVoiceOptions(): VoiceOption[] {
    if (this.dynamicVoices && this.dynamicVoices.length > 0) {
      return this.dynamicVoices;
    }
    return [{ id: "", label: "System default voice", lang: "en-US" }];
  }

  updateCredentials(settings: VoiceSettings): void {
    this.dynamicVoices =
      settings.windowsVoiceCatalog && settings.windowsVoiceCatalog.length > 0
        ? settings.windowsVoiceCatalog
        : null;
  }

  /** Language of the active voice (for the SSML `xml:lang` attribute). */
  private langForActiveVoice(): string {
    const active = this.dynamicVoices?.find((v) => v.id === this.voice);
    return active?.lang || "en-US";
  }

  /**
   * Synthesize and play the note with the built-in Windows speech engine.
   * Fully offline: the SSML is handed to the PowerShell bridge, which renders
   * MP3 chunks and reports their paths; the chunks are concatenated into a
   * single blob and played through the shared audio element.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Windows speech synthesis already in progress.");
    }
    if (!isWindowsDesktop()) {
      const error = new Error(
        "Windows native speech is only available in the desktop app on Windows.",
      );
      this.reportError(error);
      throw error;
    }

    const text = content.trim();
    if (!text) {
      return;
    }

    this.isLoading = true;
    const requestDir = join(
      winttsBaseDir(),
      `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    );
    try {
      this.reportProgress(0, 1);
      const scriptPath = ensureWinttsScript();
      mkdirSync(requestDir, { recursive: true });

      const chunks = buildWindowsSsmlChunks(text, this.langForActiveVoice());
      const separatorIndex = this.voice ? this.voice.indexOf("|") : -1;
      const engine =
        separatorIndex > 0 ? this.voice.slice(0, separatorIndex) : "onecore";
      const voiceName =
        separatorIndex > 0 ? this.voice.slice(separatorIndex + 1) : "";

      const jobPath = join(requestDir, "job.json");
      writeFileSync(
        jobPath,
        JSON.stringify({
          engine,
          voice: voiceName,
          format: "mp3",
          ssml: true,
          outDir: requestDir,
          chunks,
        }),
        "utf8",
      );

      const chunkFiles: { format: string; path: string }[] = [];
      let received = 0;
      await runWinttsProcess(
        [scriptPath, "-Mode", "speak", "-JobFile", jobPath],
        (line) => {
          const chunk = parseChunkLine(line);
          if (!chunk) {
            return;
          }
          chunkFiles[chunk.index] = { format: chunk.format, path: chunk.path };
          received++;
          this.reportProgress((received / chunks.length) * 0.9, 1);
        },
        this.abortController?.signal,
      );

      const audioBlobs: BlobPart[] = [];
      let allMp3 = true;
      for (let i = 0; i < chunks.length; i++) {
        const chunkFile = chunkFiles[i];
        if (!chunkFile) {
          throw new Error(
            `Windows speech synthesis produced no audio for part ${i + 1}.`,
          );
        }
        if (chunkFile.format !== "mp3") {
          allMp3 = false;
        }
        const buffer = readFileSync(chunkFile.path);
        if (!buffer || buffer.byteLength === 0) {
          throw new Error("Windows speech synthesis returned empty audio.");
        }
        audioBlobs.push(
          new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        );
      }

      this.reportProgress(0.95, 1);
      const finalBlob = new Blob(audioBlobs, {
        type: allMp3 ? "audio/mpeg" : "audio/wav",
      });
      this.playBlob(finalBlob, speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in Windows speech speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
      try {
        rmSync(requestDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  /**
   * "Credentials" for the native engine are just a working Windows PowerShell
   * plus at least one installed voice. Returns the detected voices so the
   * settings tab can cache the full catalog (mirrors the Azure catalog flow).
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!isWindowsDesktop()) {
      return {
        isValid: false,
        error:
          "Windows native speech is only available in the desktop app on Windows.",
      };
    }
    try {
      const voices = await WindowsSpeechService.listVoices();
      if (voices.length === 0) {
        return {
          isValid: false,
          error:
            "No Windows voices found. Add voices under Windows Settings → Time & Language → Speech.",
        };
      }
      return { isValid: true, voiceCount: voices.length, voices };
    } catch (error) {
      console.error("Windows voice scan error:", error);
      return { isValid: false, error: this.getErrorMessage(error) };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);
      if (message.includes("Could not start Windows PowerShell")) {
        return "Could not start Windows PowerShell (powershell.exe), which is required for the native Windows voices.";
      }
      if (message.includes("transcode unavailable")) {
        return "Windows could not encode MP3 audio (the Media Feature Pack may be missing).";
      }
      if (message.includes("only available")) {
        return message;
      }
      if (message.includes("timed out")) {
        return "Windows speech synthesis timed out. Please try again.";
      }
      return `Windows speech error: ${message}`;
    }
    return "Windows speech error. Please try again.";
  }
}
