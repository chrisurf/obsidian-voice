/**
 * TextSerializer - Converts a (cleaned) AST to plain spoken text
 *
 * Unlike the SSMLSerializer, this produces text for engines that do not support
 * full SSML (e.g. ElevenLabs). Two pause styles are supported:
 *
 * - Newline boundaries (default): block elements are separated by blank lines
 *   so the engine pauses naturally at sentence/paragraph boundaries.
 * - Break tags (`pauseTags: true`): structural boundaries emit ElevenLabs-style
 *   `<break time="x.xs"/>` tags for more deliberate, natural pauses. These tags
 *   are supported by ElevenLabs multilingual_v2 / turbo v2.5 / flash v2.5.
 *   Breaks are only inserted at block boundaries (headings, paragraphs, list
 *   items, horizontal rules) — not per sentence — to keep prosody stable.
 *
 * It is meant to run on a tree that has already passed through the
 * CleanProcessor (links flattened, code/inline-code turned into text, images
 * and frontmatter removed). It intentionally does NOT run the EnhanceProcessor,
 * so no SSML prosody/say-as nodes are expected — only standard mdast nodes plus
 * the `ssmlBreak` placeholders the cleaner emits for horizontal rules.
 */

import type { Node, Parent } from "unist";
import type { Text, Code, InlineCode } from "mdast";

export interface TextSerializerOptions {
  /** Emit ElevenLabs <break> tags at block boundaries for natural pauses. */
  pauseTags?: boolean;
}

// Pause lengths (seconds) per block type, kept modest to preserve stability.
const BREAK_HEADING = "0.5s";
const BREAK_PARAGRAPH = "0.35s";
const BREAK_LIST_ITEM = "0.2s";
const BREAK_RULE = "0.8s";

/**
 * Serialize an AST to spoken text
 */
export function serializeToText(
  tree: Node,
  options: TextSerializerOptions = {},
): string {
  const pauseTags = options.pauseTags ?? false;
  const raw = serializeNode(tree, pauseTags);

  if (pauseTags) {
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

  return raw
    .replace(/[ \t]+/g, " ") // collapse runs of spaces/tabs
    .replace(/ *\n */g, "\n") // trim spaces around newlines
    .replace(/\n{3,}/g, "\n\n") // at most one blank line between blocks
    .trim();
}

function breakTag(time: string): string {
  return ` <break time="${time}" /> `;
}

/**
 * Serialize a single node to text
 */
function serializeNode(node: Node, pauseTags: boolean): string {
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
      const text = serializeChildren(node, pauseTags).trim();
      if (!text) {
        return "";
      }
      const stop = /[.!?:]$/.test(text) ? "" : ".";
      return `${text}${stop}${pauseTags ? breakTag(BREAK_HEADING) : "\n\n"}`;
    }

    case "paragraph":
      return `${serializeChildren(node, pauseTags)}${
        pauseTags ? breakTag(BREAK_PARAGRAPH) : "\n\n"
      }`;

    case "blockquote":
      return `${serializeChildren(node, pauseTags)}${
        pauseTags ? breakTag(BREAK_PARAGRAPH) : "\n\n"
      }`;

    case "listItem":
      return `${serializeChildren(node, pauseTags).trim()}${
        pauseTags ? breakTag(BREAK_LIST_ITEM) : "\n"
      }`;

    case "list":
      return `${serializeChildren(node, pauseTags)}${pauseTags ? "" : "\n"}`;

    case "tableCell":
      return `${serializeChildren(node, pauseTags)}, `;

    case "tableRow":
      return `${serializeChildren(node, pauseTags).trim()}${pauseTags ? breakTag(BREAK_LIST_ITEM) : "\n"}`;

    case "table":
      return `${serializeChildren(node, pauseTags)}${pauseTags ? "" : "\n"}`;

    case "break":
      return " ";

    // Horizontal rules become ssmlBreak in the cleaner; treat as a longer pause.
    case "thematicBreak":
    case "ssmlBreak":
      return pauseTags ? breakTag(BREAK_RULE) : "\n\n";

    default:
      // strong, emphasis, delete, link, root and any other parent: keep text
      return serializeChildren(node, pauseTags);
  }
}

/**
 * Serialize the children of a parent node, if any
 */
function serializeChildren(node: Node, pauseTags: boolean): string {
  if ("children" in node && Array.isArray((node as Parent).children)) {
    return (node as Parent).children
      .map((child) => serializeNode(child, pauseTags))
      .join("");
  }
  return "";
}
