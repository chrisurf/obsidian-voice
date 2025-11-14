/**
 * XmlEscapeProcessor - Escapes XML special characters
 *
 * This processor ensures all text content is safely escaped for XML/SSML.
 * Must be run after all other enhancements but before serialization.
 */

import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";

/**
 * XML entities that need escaping
 */
const XML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escape XML special characters in a string
 */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ESCAPE_MAP[char]);
}

/**
 * Create an XML escape processor plugin
 */
export function xmlEscapeProcessor() {
  return function transformer(tree: Root): void {
    visit(tree, "text", (node) => {
      const textNode = node as Text;
      textNode.value = escapeXml(textNode.value);
    });
  };
}
