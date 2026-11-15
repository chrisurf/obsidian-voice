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
import type { Text, Code, InlineCode, List } from "mdast";
import type { PauseStyle } from "../../types/ProcessorTypes";
import type { ListItemEnd, ListNumbering } from "../../profiles/schema";

export interface TextSerializerOptions {
  /** Which pause markup (if any) to emit at block boundaries. Default "none". */
  pauseStyle?: PauseStyle;
  /** Read the wrapped lines of a paragraph as one (no pause at a line break). */
  joinLineBreaks?: boolean;
  /** Close list items / table rows lacking punctuation (default "none"). */
  listItemEnd?: ListItemEnd;
  /** Announce numbered list items (default "none"). */
  listNumbering?: ListNumbering;
  /** Words for "ordinal" numbering, in order. */
  ordinals?: string[];
  /** Pause lengths in seconds for the pause markers (markup styles only). */
  pauses?: { heading?: number; paragraph?: number; listItem?: number };
}

// Pause lengths (seconds) per block type, kept modest to preserve stability.
const BREAK_HEADING = 0.5;
const BREAK_PARAGRAPH = 0.35;
const BREAK_LIST_ITEM = 0.2;
const BREAK_RULE = 0.8;

/** Everything serializeNode needs, resolved from the options once. */
interface Context {
  style: PauseStyle;
  joinLineBreaks: boolean;
  itemEnd: ListItemEnd;
  numbering: ListNumbering;
  ordinals: string[];
  heading: number;
  paragraph: number;
  listItem: number;
}

/** Punctuation that already closes a list item or table row. */
const CLOSED = /[.!?:;,]$/;

/** Close text with the configured punctuation unless it already has some. */
function closeItem(text: string, end: ListItemEnd): string {
  if (end === "none" || !text || CLOSED.test(text)) {
    return text;
  }
  return `${text}${end === "stop" ? "." : ","}`;
}

/**
 * Serialize an AST to spoken text.
 */
export function serializeToText(
  tree: Node,
  options: TextSerializerOptions = {},
): string {
  const style = options.pauseStyle ?? "none";
  const ctx: Context = {
    style,
    joinLineBreaks: options.joinLineBreaks ?? false,
    itemEnd: options.listItemEnd ?? "none",
    numbering: options.listNumbering ?? "none",
    ordinals: options.ordinals ?? [],
    heading: options.pauses?.heading ?? BREAK_HEADING,
    paragraph: options.pauses?.paragraph ?? BREAK_PARAGRAPH,
    listItem: options.pauses?.listItem ?? BREAK_LIST_ITEM,
  };
  const raw = serializeNode(tree, ctx);

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
function serializeNode(node: Node, ctx: Context): string {
  const { style } = ctx;
  const marked = usesMarkers(style);

  switch (node.type) {
    case "text": {
      const value = (node as Text).value;
      // A line wrapped inside a paragraph is not a pause: joining it keeps the
      // engine from stopping mid-sentence where there is no punctuation.
      return ctx.joinLineBreaks ? value.replace(/[ \t]*\n[ \t]*/g, " ") : value;
    }

    case "inlineCode":
      return (node as InlineCode).value;

    case "code":
      return (node as Code).value;

    case "heading": {
      // End headings with a sentence stop so the engine pauses, then a
      // structural pause before the following block.
      const text = serializeChildren(node, ctx).trim();
      if (!text) {
        return "";
      }
      const stop = /[.!?:]$/.test(text) ? "" : ".";
      return `${text}${stop}${
        marked ? pauseMarker(style, ctx.heading) : "\n\n"
      }`;
    }

    case "paragraph":
      return `${serializeChildren(node, ctx)}${
        marked ? pauseMarker(style, ctx.paragraph) : "\n\n"
      }`;

    case "blockquote":
      return `${serializeChildren(node, ctx)}${
        marked ? pauseMarker(style, ctx.paragraph) : "\n\n"
      }`;

    case "listItem":
      return `${closeItem(serializeChildren(node, ctx).trim(), ctx.itemEnd)}${
        marked ? pauseMarker(style, ctx.listItem) : "\n"
      }`;

    case "list": {
      const list = node as List;
      const items = list.children.map((item, i) => {
        const text = serializeNode(item, ctx);
        if (!list.ordered || ctx.numbering === "none") {
          return text;
        }
        const n = (list.start ?? 1) + i;
        const label =
          ctx.numbering === "ordinal" && ctx.ordinals[n - 1]
            ? ctx.ordinals[n - 1]
            : `${n}`;
        return `${label}, ${text}`;
      });
      return `${items.join("")}${marked ? "" : "\n"}`;
    }

    case "tableCell":
      return `${serializeChildren(node, ctx).trim()}, `;

    case "tableRow": {
      // Cells are separated by commas; the row closes like a list item.
      const row = serializeChildren(node, ctx).trim().replace(/,$/, "");
      return `${ctx.itemEnd === "none" ? `${row},` : closeItem(row, ctx.itemEnd)}${
        marked ? pauseMarker(style, ctx.listItem) : "\n"
      }`;
    }

    case "table":
      return `${serializeChildren(node, ctx)}${marked ? "" : "\n"}`;

    case "break":
      return " ";

    // Horizontal rules become ssmlBreak in the cleaner; treat as a longer pause.
    case "thematicBreak":
    case "ssmlBreak":
      return marked ? pauseMarker(style, BREAK_RULE) : "\n\n";

    default:
      // strong, emphasis, delete, link, root and any other parent: keep text
      return serializeChildren(node, ctx);
  }
}

/**
 * Serialize the children of a parent node, if any.
 */
function serializeChildren(node: Node, ctx: Context): string {
  if ("children" in node && Array.isArray((node as Parent).children)) {
    return (node as Parent).children
      .map((child) => serializeNode(child, ctx))
      .join("");
  }
  return "";
}
