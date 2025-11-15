/**
 * CleanProcessor - Removes unsupported markdown elements
 *
 * This processor traverses the AST and removes or transforms elements
 * that shouldn't be spoken or can't be properly represented in speech:
 * - Code blocks (spoken code is confusing)
 * - Images (no visual content in speech)
 * - Frontmatter (metadata, not content)
 * - HTML tags (strip tags, keep content)
 * - Links (keep text, remove URLs)
 * - Horizontal rules (convert to breaks)
 */

import { visit, SKIP } from "unist-util-visit";
import type { Root, Link, InlineCode, Html, Text } from "mdast";
import type { Parent } from "unist";
import type { CleanProcessorOptions } from "../../types/ProcessorTypes";

/**
 * Create a clean processor plugin
 */
export function cleanProcessor(options: CleanProcessorOptions) {
  return function transformer(tree: Root): void {
    visit(tree, (node, index, parent) => {
      if (index === undefined || !parent) {
        return;
      }

      // Replace code blocks with "Code snippet" placeholder
      if (options.removeCodeBlocks && node.type === "code") {
        const placeholderNode: Text = {
          type: "text",
          value: "Code snippet.",
        };
        (parent as Parent).children[index] = placeholderNode;
        return SKIP;
      }

      // Remove inline code backticks but keep the text
      if (options.removeCodeBlocks && node.type === "inlineCode") {
        const inlineCodeNode = node as InlineCode;
        // Replace with plain text node
        const textNode: Text = {
          type: "text",
          value: inlineCodeNode.value,
        };
        (parent as Parent).children[index] = textNode;
        return SKIP;
      }

      // Remove images entirely
      if (options.removeImages && node.type === "image") {
        (parent as Parent).children.splice(index, 1);
        return index;
      }

      // Transform links: keep only the text, remove URL
      if (options.preserveLinkText && node.type === "link") {
        const linkNode = node as Link;
        // Replace link with its children (the link text)
        if (linkNode.children && linkNode.children.length > 0) {
          (parent as Parent).children.splice(index, 1, ...linkNode.children);
        } else {
          // If no children, remove the link
          (parent as Parent).children.splice(index, 1);
        }
        return index;
      }

      // Remove YAML/TOML frontmatter (using type assertion for extended node types)
      if (
        options.removeFrontmatter &&
        ((node as { type: string }).type === "yaml" ||
          (node as { type: string }).type === "toml")
      ) {
        (parent as Parent).children.splice(index, 1);
        return index;
      }

      // Handle HTML: strip tags but keep text content if any
      if (options.removeHTML && node.type === "html") {
        const htmlNode = node as Html;
        // Try to extract text from simple HTML tags
        const textContent = extractTextFromHTML(htmlNode.value);
        if (textContent) {
          const textNode: Text = {
            type: "text",
            value: textContent,
          };
          (parent as Parent).children[index] = textNode;
        } else {
          // No text content, remove entirely
          (parent as Parent).children.splice(index, 1);
        }
        return index;
      }

      // Convert horizontal rules to SSML breaks
      if (node.type === "thematicBreak") {
        (parent as Parent).children[index] = {
          type: "ssmlBreak",
          data: {
            time: "1s",
          },
        };
        return SKIP;
      }

      // Handle Obsidian-specific wikilinks [[page]] or [[page|alias]]
      // Also remove audio embeds and emojis from text
      if (node.type === "text") {
        const textNode = node as { type: "text"; value: string };
        textNode.value = removeAudioEmbeds(textNode.value);
        textNode.value = cleanWikiLinks(textNode.value);
        textNode.value = removeEmojis(textNode.value);
      }
    });
  };
}

/**
 * Extract text content from simple HTML
 * This is a basic implementation - doesn't handle complex HTML
 */
function extractTextFromHTML(html: string): string {
  // Remove HTML tags but keep content
  // This is a simple regex-based approach for basic HTML
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Remove styles
    .replace(/<[^>]+>/g, "") // Remove tags
    .trim();
}

/**
 * Clean Obsidian wikilinks from text
 * [[Page]] -> Page
 * [[Page|Alias]] -> Alias
 * [[Page#Section]] -> Page Section
 */
function cleanWikiLinks(text: string): string {
  return (
    text
      // Handle aliased links: [[source|alias]] -> alias
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      // Handle section links: [[page#section]] -> page section
      .replace(/\[\[([^\]|]+)#([^\]]+)\]\]/g, "$1 $2")
      // Handle simple links: [[page]] -> page
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
  );
}

/**
 * Remove audio embeds from text
 * ![[filename.mp3]] -> (removed)
 * ![[path/to/file.wav]] -> (removed)
 */
function removeAudioEmbeds(text: string): string {
  // Match audio embed syntax: ![[filename.ext]] where ext is an audio format
  // Requires at least one character in the filename to prevent matching empty embeds
  return text.replace(
    /!\[\[([^\]]+)\.(mp3|wav|ogg|m4a|flac|aac|wma)\]\]/gi,
    "",
  );
}

/**
 * Remove emojis from text
 * Uses Unicode ranges to detect and remove emoji characters
 */
function removeEmojis(text: string): string {
  // Comprehensive emoji regex covering most common emoji ranges
  return text.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E0}-\u{1F1FF}]|[\u{E0020}-\u{E007F}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu,
    "",
  );
}
