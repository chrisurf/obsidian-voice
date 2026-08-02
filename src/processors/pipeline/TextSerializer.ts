/**
 * TextSerializer - Converts a (cleaned) AST to plain spoken text
 *
 * Unlike the SSMLSerializer, this produces text for engines that do not support
 * full SSML. Structural pauses are emitted in the style the active provider
 * understands (see PauseStyle):
 *
 * - "none" (default): block elements are separated by blank lines so the engine
 *   pauses naturally at sentence/paragraph boundaries. Used for engines that
 *   read unknown markup literally (e.g. OpenAI).
 * - "break-tags": structural boundaries emit ElevenLabs-style
 *   `<break time="x.xs"/>` tags, supported by ElevenLabs multilingual_v2 /
 *   turbo v2.5 / flash v2.5.
 * - "minimax": structural boundaries emit MiniMax's native `<#x#>` pause markers
 *   (x = seconds). MiniMax does NOT understand `<break>` tags — it would read
 *   them aloud (issue #85) — and requires that pause markers never appear
 *   consecutively or at the very start/end, which the post-processing enforces.
 *
 * Breaks are only inserted at block boundaries (headings, paragraphs, list
 * items, horizontal rules) — not per sentence — to keep prosody stable.
 *
 * It is meant to run on a tree that has already passed through the
 * CleanProcessor (links flattened, code/inline-code turned into text, images
 * and frontmatter removed). It intentionally does NOT run the EnhanceProcessor,
 * so no SSML prosody/say-as nodes are expected — only standard mdast nodes plus
 * the `ssmlBreak` placeholders the cleaner emits for horizontal rules.
 */

import type { Node, Parent } from "unist";
import type { Text, Code, InlineCode } from "mdast";
import type { PauseStyle } from "../../types/ProcessorTypes";

export interface TextSerializerOptions {
  /** Which pause markup (if any) to emit at block boundaries. Default "none". */
  pauseStyle?: PauseStyle;
}

// Pause lengths (seconds) per block type, kept modest to preserve stability.
const BREAK_HEADING = 0.5;
const BREAK_PARAGRAPH = 0.35;
const BREAK_LIST_ITEM = 0.2;
const BREAK_RULE = 0.8;

/**
 * Serialize an AST to spoken text.
 */
export function serializeToText(
  tree: Node,
  options: TextSerializerOptions = {},
): string {
  const style = options.pauseStyle ?? "none";
  const raw = serializeNode(tree, style);

  if (style === "break-tags") {
    // Break tags carry the pauses; flatten whitespace to single spaces and
    // merge any consecutive breaks (e.g. paragraph + list-item) into one so
    // stacked pauses don't destabilize the engine's prosody.
    return raw
      .replace(/\s+/g, " ")
      .replace(
        /(?:<break time="[^"]+"\s*\/>\s*){2,}/g,
        '<break time="0.4s" /> ',
      )
      .trim();
  }

  if (style === "minimax") {
    // MiniMax `<#x#>` markers carry the pauses. Its rules: markers may not be
    // consecutive and may not sit at the very start/end (an isolated pause is
    // ignored, or the second of a pair is dropped), so merge stacks and trim
    // any leading/trailing markers.
    return raw
      .replace(/\s+/g, " ")
      .replace(/(?:<#[\d.]+#>\s*){2,}/g, "<#0.4#> ")
      .replace(/^\s*(?:<#[\d.]+#>\s*)+/, "")
      .replace(/(?:\s*<#[\d.]+#>)+\s*$/, "")
      .trim();
  }

  // "none": newline boundaries only.
  return raw
    .replace(/[ \t]+/g, " ") // collapse runs of spaces/tabs
    .replace(/ *\n */g, "\n") // trim spaces around newlines
    .replace(/\n{3,}/g, "\n\n") // at most one blank line between blocks
    .trim();
}

/** True when the style emits inline pause markup (rather than newlines). */
function usesMarkers(style: PauseStyle): boolean {
  return style !== "none";
}

/** Render a block-boundary pause in the active style. */
function pauseMarker(style: PauseStyle, seconds: number): string {
  if (style === "minimax") {
    return ` <#${seconds}#> `;
  }
  // "break-tags"
  return ` <break time="${seconds}s" /> `;
}

/**
 * Serialize a single node to text.
 */
function serializeNode(node: Node, style: PauseStyle): string {
  const marked = usesMarkers(style);

  switch (node.type) {
    case "text":
      return (node as Text).value;

    case "inlineCode":
      return (node as InlineCode).value;

    case "code":
      return (node as Code).value;

    case "heading": {
      // End headings with a sentence stop so the engine pauses, then a
      // structural pause before the following block.
      const text = serializeChildren(node, style).trim();
      if (!text) {
        return "";
      }
      const stop = /[.!?:]$/.test(text) ? "" : ".";
      return `${text}${stop}${
        marked ? pauseMarker(style, BREAK_HEADING) : "\n\n"
      }`;
    }

    case "paragraph":
      return `${serializeChildren(node, style)}${
        marked ? pauseMarker(style, BREAK_PARAGRAPH) : "\n\n"
      }`;

    case "blockquote":
      return `${serializeChildren(node, style)}${
        marked ? pauseMarker(style, BREAK_PARAGRAPH) : "\n\n"
      }`;

    case "listItem":
      return `${serializeChildren(node, style).trim()}${
        marked ? pauseMarker(style, BREAK_LIST_ITEM) : "\n"
      }`;

    case "list":
      return `${serializeChildren(node, style)}${marked ? "" : "\n"}`;

    case "tableCell":
      return `${serializeChildren(node, style)}, `;

    case "tableRow":
      return `${serializeChildren(node, style).trim()}${
        marked ? pauseMarker(style, BREAK_LIST_ITEM) : "\n"
      }`;

    case "table":
      return `${serializeChildren(node, style)}${marked ? "" : "\n"}`;

    case "break":
      return " ";

    // Horizontal rules become ssmlBreak in the cleaner; treat as a longer pause.
    case "thematicBreak":
    case "ssmlBreak":
      return marked ? pauseMarker(style, BREAK_RULE) : "\n\n";

    default:
      // strong, emphasis, delete, link, root and any other parent: keep text
      return serializeChildren(node, style);
  }
}

/**
 * Serialize the children of a parent node, if any.
 */
function serializeChildren(node: Node, style: PauseStyle): string {
  if ("children" in node && Array.isArray((node as Parent).children)) {
    return (node as Parent).children
      .map((child) => serializeNode(child, style))
      .join("");
  }
  return "";
}
