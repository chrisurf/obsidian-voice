/**
 * SSMLSerializer - Converts AST to SSML string
 *
 * This serializer traverses the enhanced AST and generates valid SSML output.
 * It handles both standard markdown nodes and custom SSML nodes.
 */

import type { Node, Parent } from "unist";
import type { Root, Text } from "mdast";
import {
  isSSMLBreak,
  isSSMLProsody,
  isSSMLSayAs,
  isSSMLSub,
  type SSMLBreak,
  type SSMLProsody,
  type SSMLSayAs,
  type SSMLSub,
} from "../../types/SSMLNodes";

/**
 * Serialize an AST to SSML string
 */
export function serializeToSSML(tree: Root): string {
  const content = serializeNode(tree);
  // Wrap everything in <speak> tags
  return `<speak>${content}</speak>`;
}

/**
 * Serialize a single node
 */
function serializeNode(node: Node): string {
  // Handle text nodes
  if (node.type === "text") {
    const textNode = node as Text;
    return textNode.value;
  }

  // Handle SSML Break
  if (isSSMLBreak(node)) {
    return serializeBreak(node);
  }

  // Handle SSML Prosody
  if (isSSMLProsody(node)) {
    return serializeProsody(node);
  }

  // Handle SSML Say-As
  if (isSSMLSayAs(node)) {
    return serializeSayAs(node);
  }

  // Handle SSML Sub
  if (isSSMLSub(node)) {
    return serializeSub(node);
  }

  // Handle parent nodes (nodes with children)
  if ("children" in node && Array.isArray((node as Parent).children)) {
    const parent = node as Parent;
    return parent.children.map((child) => serializeNode(child)).join("");
  }

  // Unknown node type - just skip it
  return "";
}

/**
 * Serialize SSML Break node
 */
function serializeBreak(node: SSMLBreak): string {
  const { time, strength } = node.data;

  if (time) {
    return `<break time="${time}"/>`;
  }

  if (strength) {
    return `<break strength="${strength}"/>`;
  }

  return "<break/>";
}

/**
 * Serialize SSML Prosody node
 */
function serializeProsody(node: SSMLProsody): string {
  const { rate, volume, pitch } = node.data;
  const attrs: string[] = [];

  if (rate) {
    attrs.push(`rate="${rate}"`);
  }

  if (volume) {
    attrs.push(`volume="${volume}"`);
  }

  if (pitch) {
    attrs.push(`pitch="${pitch}"`);
  }

  const attrString = attrs.length > 0 ? " " + attrs.join(" ") : "";
  const children = node.children.map((child) => serializeNode(child)).join("");

  return `<prosody${attrString}>${children}</prosody>`;
}

/**
 * Serialize SSML Say-As node
 */
function serializeSayAs(node: SSMLSayAs): string {
  const { interpretAs, format } = node.data;
  let attrString = `interpret-as="${interpretAs}"`;

  if (format) {
    attrString += ` format="${format}"`;
  }

  const children = node.children.map((child) => serializeNode(child)).join("");

  return `<say-as ${attrString}>${children}</say-as>`;
}

/**
 * Serialize SSML Sub node
 */
function serializeSub(node: SSMLSub): string {
  const { alias } = node.data;
  const children = node.children.map((child) => serializeNode(child)).join("");

  return `<sub alias="${alias}">${children}</sub>`;
}
