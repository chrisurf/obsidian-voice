/**
 * EnhanceProcessor - Adds SSML structure for natural speech
 *
 * This processor transforms markdown structure into SSML tags:
 * - Headings → prosody with volume boost + breaks
 * - Bold → prosody with volume increase
 * - Italic → prosody with rate adjustment
 * - Paragraphs → breaks between them
 * - Lists → breaks and ordinal markers
 * - Abbreviations → sub tags for proper pronunciation
 * - Acronyms → say-as spell-out
 * - Numbers → say-as number
 */

import { visit } from "unist-util-visit";
import type {
  Root,
  Heading,
  Strong,
  Emphasis,
  Paragraph,
  ListItem,
  List,
  Text,
} from "mdast";
import type { Node, Parent } from "unist";
import type { EnhanceProcessorOptions } from "../../types/ProcessorTypes";
import type {
  SSMLBreak,
  SSMLProsody,
  SSMLSayAs,
  SSMLSub,
} from "../../types/SSMLNodes";

/**
 * Modification to apply after tree traversal
 */
interface Modification {
  parent: Parent;
  index: number;
  action: "insert" | "replace";
  node?: Node;
  nodes?: Node[];
}

/**
 * Common abbreviations that should be expanded
 */
const ABBREVIATIONS: Record<string, string> = {
  "Dr.": "Doctor",
  "Mr.": "Mister",
  "Mrs.": "Missus",
  "Ms.": "Miss",
  "Prof.": "Professor",
  "Sr.": "Senior",
  "Jr.": "Junior",
  "etc.": "et cetera",
  "e.g.": "for example",
  "i.e.": "that is",
  "vs.": "versus",
};

/**
 * Pattern to detect acronyms (2+ consecutive uppercase letters)
 */
const ACRONYM_PATTERN = /\b[A-Z]{2,}\b/g;

/**
 * Pattern to detect numbers (including formatted numbers)
 */
const NUMBER_PATTERN = /\b\d+([,\.]\d+)*\b/g;

/**
 * Create an enhance processor plugin
 */
export function enhanceProcessor(options: EnhanceProcessorOptions) {
  return function transformer(tree: Root): void {
    // Track if we're inside a list for ordinal markers
    let listItemIndex = 0;
    let currentList: List | null = null;

    // Collect modifications to apply after traversal to avoid infinite loops
    const modificationsToApply: Modification[] = [];

    visit(tree, (node, index, parent) => {
      if (index === undefined || !parent) {
        return;
      }

      // Handle headings - add prosody and breaks
      if (options.addHeadingEmphasis && node.type === "heading") {
        const heading = node as Heading;
        const breakTime = options.headingBreakTimes[heading.depth - 1] || 400;

        // Wrap heading content in prosody
        const prosodyNode: SSMLProsody = {
          type: "ssmlProsody",
          children: heading.children,
          data: {
            volume: options.headingVolumeBoost,
            rate: `${100 - heading.depth * 2}%`, // Slightly slower for higher headings
          },
        };

        // Replace heading children with prosody (type assertion needed for custom SSML node)
        heading.children = [
          prosodyNode as unknown as (typeof heading.children)[0],
        ];

        // Schedule break insertion after heading
        const breakNode: SSMLBreak = {
          type: "ssmlBreak",
          data: { time: `${breakTime}ms` },
        };
        modificationsToApply.push({
          parent: parent as Parent,
          index: index + 1,
          action: "insert",
          node: breakNode,
        });
      }

      // Handle bold text - add prosody
      if (node.type === "strong") {
        const strong = node as Strong;
        const prosodyNode: SSMLProsody = {
          type: "ssmlProsody",
          children: strong.children,
          data: {
            volume: options.boldVolumeBoost,
          },
        };
        (parent as Parent).children[index] = prosodyNode as unknown as Node;
      }

      // Handle italic text - add prosody
      if (node.type === "emphasis") {
        const emphasis = node as Emphasis;
        const prosodyNode: SSMLProsody = {
          type: "ssmlProsody",
          children: emphasis.children,
          data: {
            rate: options.italicRateAdjust,
          },
        };
        (parent as Parent).children[index] = prosodyNode as unknown as Node;
      }

      // Handle paragraphs - add breaks after them
      if (node.type === "paragraph") {
        const breakNode: SSMLBreak = {
          type: "ssmlBreak",
          data: { time: `${options.paragraphBreakTime}ms` },
        };
        modificationsToApply.push({
          parent: parent as Parent,
          index: index + 1,
          action: "insert",
          node: breakNode,
        });
      }

      // Handle lists - track current list
      if (node.type === "list") {
        currentList = node as List;
        listItemIndex = 0;
      }

      // Handle list items - add breaks and ordinals
      if (node.type === "listItem") {
        listItemIndex++;

        // Schedule break insertion before list item
        const breakNode: SSMLBreak = {
          type: "ssmlBreak",
          data: { time: `${options.listItemBreakTime}ms` },
        };
        modificationsToApply.push({
          parent: parent as Parent,
          index: index,
          action: "insert",
          node: breakNode,
        });

        // If ordered list, prepend ordinal
        if (currentList && currentList.ordered) {
          const ordinal = getOrdinalText(listItemIndex);
          const listItem = node as ListItem;
          if (
            listItem.children.length > 0 &&
            listItem.children[0].type === "paragraph"
          ) {
            const para = listItem.children[0] as Paragraph;
            const ordinalText: Text = {
              type: "text",
              value: `${ordinal}, `,
            };
            para.children.unshift(ordinalText);
          }
        }
      }

      // Handle text nodes - enhance with abbreviations, acronyms, numbers
      if (node.type === "text") {
        const textNode = node as Text;
        const newNodes = enhanceText(textNode, options);
        if (newNodes.length > 1) {
          // Schedule replacement with multiple nodes
          modificationsToApply.push({
            parent: parent as Parent,
            index: index,
            action: "replace",
            nodes: newNodes,
          });
        }
      }
    });

    // Apply all modifications after traversal (in reverse order to maintain indices)
    modificationsToApply.sort((a, b) => b.index - a.index);
    for (const mod of modificationsToApply) {
      if (mod.action === "insert" && mod.node) {
        mod.parent.children.splice(mod.index, 0, mod.node);
      } else if (mod.action === "replace" && mod.nodes) {
        mod.parent.children.splice(mod.index, 1, ...mod.nodes);
      }
    }
  };
}

/**
 * Text segment with SSML enhancement
 */
interface TextSegment {
  offset: number;
  node: SSMLSub | SSMLSayAs;
  length: number;
}

/**
 * Enhance a text node with SSML structures for special content
 * Returns array of nodes to replace the original text node
 */
function enhanceText(textNode: Text, options: EnhanceProcessorOptions): Node[] {
  const text = textNode.value;
  const segments: TextSegment[] = [];

  // Process abbreviations
  if (options.expandAbbreviations) {
    Object.entries(ABBREVIATIONS).forEach(([abbr, expansion]) => {
      const regex = new RegExp(abbr.replace(".", "\\."), "g");
      let match;
      while ((match = regex.exec(text)) !== null) {
        const textChild: Text = { type: "text", value: match[0] };
        const subNode: SSMLSub = {
          type: "ssmlSub",
          children: [textChild],
          data: { alias: expansion },
        };
        segments.push({
          offset: match.index,
          node: subNode,
          length: match[0].length,
        });
      }
    });
  }

  // Process acronyms
  if (options.spellOutAcronyms) {
    let match;
    const regex = new RegExp(ACRONYM_PATTERN);
    while ((match = regex.exec(text)) !== null) {
      const textChild: Text = { type: "text", value: match[0] };
      const sayAsNode: SSMLSayAs = {
        type: "ssmlSayAs",
        children: [textChild],
        data: { interpretAs: "characters" },
      };
      segments.push({
        offset: match.index,
        node: sayAsNode,
        length: match[0].length,
      });
    }
  }

  // Process numbers
  if (options.formatNumbers) {
    let match;
    const regex = new RegExp(NUMBER_PATTERN);
    while ((match = regex.exec(text)) !== null) {
      const textChild: Text = { type: "text", value: match[0] };
      const sayAsNode: SSMLSayAs = {
        type: "ssmlSayAs",
        children: [textChild],
        data: { interpretAs: "number" },
      };
      segments.push({
        offset: match.index,
        node: sayAsNode,
        length: match[0].length,
      });
    }
  }

  // If no segments, return original node
  if (segments.length === 0) {
    return [textNode];
  }

  // Sort segments by offset
  segments.sort((a, b) => a.offset - b.offset);

  // Build new children array
  const newNodes: Node[] = [];
  let currentPos = 0;

  for (const segment of segments) {
    // Add text before segment
    if (segment.offset > currentPos) {
      const textNode: Text = {
        type: "text",
        value: text.substring(currentPos, segment.offset),
      };
      newNodes.push(textNode);
    }
    // Add the segment node
    newNodes.push(segment.node);
    currentPos = segment.offset + segment.length;
  }

  // Add remaining text
  if (currentPos < text.length) {
    const textNode: Text = {
      type: "text",
      value: text.substring(currentPos),
    };
    newNodes.push(textNode);
  }

  return newNodes.length > 0 ? newNodes : [textNode];
}

/**
 * Get ordinal text for list items
 */
function getOrdinalText(index: number): string {
  const ordinals = [
    "First",
    "Second",
    "Third",
    "Fourth",
    "Fifth",
    "Sixth",
    "Seventh",
    "Eighth",
    "Ninth",
    "Tenth",
  ];

  if (index <= ordinals.length) {
    return ordinals[index - 1];
  }

  return `Number ${index}`;
}
