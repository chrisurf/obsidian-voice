/**
 * Change one setting in a profile's text, keeping the rest of the file as the
 * user wrote it. For YAML the value is replaced in place — a single line, or
 * the whole block of a multi-line value (a folded word list, a map of pairs) —
 * so comments and layout elsewhere survive; only when the key does not exist
 * yet is the file rewritten from its parsed data.
 */

import { detectFormat, type YamlParser } from "./parse";
import { setPath } from "./schema";

export type YamlStringifier = (value: unknown) => string;

/** A scalar as YAML writes it: quoted only when it has to be. */
function yamlScalar(value: unknown): string {
  if (typeof value === "string") {
    return /^[\w.%+-]+$/.test(value) &&
      !/^(true|false|null|yes|no|on|off)$/i.test(value)
      ? value
      : JSON.stringify(value);
  }
  return String(value);
}

/** Free text as YAML writes it, e.g. "for example" or "z. B.". */
function yamlText(value: string): string {
  const plain =
    /^[^\s#:'"{}[\],&*!|>%@`-][^#]*$/.test(value) &&
    !/:(\s|$)/.test(value) &&
    !/\s$/.test(value) &&
    !/^(true|false|null|yes|no|on|off|~|[-+]?\d[\d.]*)$/i.test(value);
  return plain ? value : JSON.stringify(value);
}

/** True for a map of pairs (as opposed to a scalar or a list). */
function isPairs(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * The lines replacing a key's line (and its block): `head` is the key with
 * its indentation, `comment` a trailing comment to keep.
 */
function valueLines(
  head: string,
  indent: string,
  value: unknown,
  comment: string,
): string[] {
  if (isPairs(value)) {
    const pairs = Object.entries(value);
    if (pairs.length === 0) {
      return [`${head}: {}${comment}`];
    }
    return [
      `${head}:${comment}`,
      ...pairs.map(
        ([k, v]) => `${indent}  ${yamlText(k)}: ${yamlText(String(v))}`,
      ),
    ];
  }
  return [`${head}: ${yamlScalar(value)}${comment}`];
}

/** Index after the last line of the block that belongs to the key at `line`. */
function keyBlockEnd(lines: string[], line: number, keyIndent: number): number {
  let end = line + 1;
  for (let i = line + 1; i < lines.length; i++) {
    if (!lines[i].trim()) {
      continue; // blank lines belong to the block only if it goes on
    }
    if ((/^(\s*)/.exec(lines[i])?.[1].length ?? 0) <= keyIndent) {
      break;
    }
    end = i + 1;
  }
  return end;
}

/**
 * Replace the value of `path` ("content.acronyms") in place when the key is
 * already on a line of its own; null when it isn't found that way.
 */
export function replaceYamlInPlace(
  text: string,
  path: string,
  value: unknown,
): string | null {
  const keys = path.split(".");
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;
  let indent = -1;
  for (let depth = 0; depth < keys.length; depth++) {
    const key = keys[depth];
    const isLast = depth === keys.length - 1;
    let found = -1;
    let commented = -1;
    for (let i = start; i < end; i++) {
      const match = /^(\s*)(#\s*)?([^\s#][^:]*?)\s*:(.*)$/.exec(lines[i]);
      if (!match) {
        continue;
      }
      const lineIndent = match[1].length;
      if (!match[2] && lineIndent <= indent) {
        break; // left the parent block
      }
      if (match[3] !== key || (indent < 0 && lineIndent !== 0)) {
        continue;
      }
      if (match[2]) {
        // A commented-out setting ("# pause: 800ms"): usable for the last key.
        if (isLast && commented < 0 && lineIndent > indent) {
          commented = i;
        }
        continue;
      }
      found = i;
      indent = lineIndent;
      break;
    }
    if (isLast && found < 0 && commented >= 0) {
      // Uncomment it in place, keeping its hint comment.
      const match = /^(\s*)#\s*([^:]+):\s*([^#]*?)(\s*#.*)?$/.exec(
        lines[commented],
      );
      if (!match) {
        return null;
      }
      if (isPairs(value)) {
        return null; // a commented-out example block; rewrite the file instead
      }
      lines[commented] =
        `${match[1]}${match[2]}: ${yamlScalar(value)}${match[4] ?? ""}`;
      return lines.join("\n");
    }
    if (found < 0) {
      return null;
    }
    if (isLast) {
      // Key, its value on the line (if any), and a trailing comment. A value
      // of ">-" or "|" (or none) means the value continues on the lines below.
      const match = /^(\s*)([^:]+?)\s*:\s*([^#]*?)(\s*#.*)?$/.exec(
        lines[found],
      );
      if (!match) {
        return null;
      }
      const [, keyIndent, name, , comment = ""] = match;
      const end = keyBlockEnd(lines, found, keyIndent.length);
      lines.splice(
        found,
        end - found,
        ...valueLines(`${keyIndent}${name}`, keyIndent, value, comment),
      );
      return lines.join("\n");
    }
    // Narrow the search to this key's block.
    start = found + 1;
    let blockEnd = start;
    while (blockEnd < end) {
      const line = lines[blockEnd];
      if (line.trim() && !line.trim().startsWith("#")) {
        const lineIndent = /^(\s*)/.exec(line)?.[1].length ?? 0;
        if (lineIndent <= indent) {
          break;
        }
      }
      blockEnd++;
    }
    end = blockEnd;
  }
  return null;
}

export function setProfileValue(
  text: string,
  path: string,
  value: unknown,
  parseYaml: YamlParser,
  stringifyYaml: YamlStringifier,
): string {
  if (detectFormat(text) === "json") {
    const data = JSON.parse(text) as Record<string, unknown>;
    setPath(data, path, value);
    return `${JSON.stringify(data, null, 2)}\n`;
  }
  const inPlace = replaceYamlInPlace(text, path, value);
  if (inPlace !== null) {
    return inPlace;
  }
  const data = (parseYaml(text) ?? {}) as Record<string, unknown>;
  setPath(data, path, value);
  return stringifyYaml(data);
}
