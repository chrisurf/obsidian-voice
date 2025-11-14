/**
 * Custom AST Node Types for SSML Generation
 *
 * These node types extend the standard mdast (Markdown AST) nodes
 * to represent SSML-specific structures during the transformation pipeline.
 */

import type { Node, Parent } from "unist";

/**
 * Base interface for all SSML nodes
 */
export interface SSMLNode extends Node {
  type: string;
  data?: {
    [key: string]: unknown;
  };
}

/**
 * SSML Break node - represents a pause in speech
 *
 * Corresponds to: <break time="500ms"/> or <break strength="medium"/>
 */
export interface SSMLBreak extends SSMLNode {
  type: "ssmlBreak";
  data: {
    time?: string; // e.g., "500ms", "1s"
    strength?: string; // e.g., "weak", "medium", "strong", "x-strong"
  };
}

/**
 * SSML Prosody node - controls volume, rate, and pitch
 *
 * Corresponds to: <prosody rate="95%" volume="loud">text</prosody>
 */
export interface SSMLProsody extends Parent, SSMLNode {
  type: "ssmlProsody";
  children: Node[];
  data: {
    rate?: string; // e.g., "95%", "slow", "fast"
    volume?: string; // e.g., "loud", "+2dB", "soft"
    pitch?: string; // e.g., "high", "+10%", "low"
  };
}

/**
 * SSML Say-As node - controls how text is interpreted
 *
 * Corresponds to: <say-as interpret-as="number">123</say-as>
 */
export interface SSMLSayAs extends Parent, SSMLNode {
  type: "ssmlSayAs";
  children: Node[];
  data: {
    interpretAs: string; // e.g., "number", "spell-out", "date", "time"
    format?: string; // Optional format for dates/times
  };
}

/**
 * SSML Sub node - replaces text with alternative pronunciation
 *
 * Corresponds to: <sub alias="Doctor">Dr.</sub>
 */
export interface SSMLSub extends Parent, SSMLNode {
  type: "ssmlSub";
  children: Node[];
  data: {
    alias: string; // The text to speak instead
  };
}

/**
 * SSML Paragraph node - represents a paragraph with spacing
 *
 * Corresponds to: <p>content</p>
 */
export interface SSMLParagraph extends SSMLNode {
  type: "ssmlParagraph";
  children: Node[];
}

/**
 * SSML Sentence node - represents a sentence with spacing
 *
 * Corresponds to: <s>content</s>
 */
export interface SSMLSentence extends SSMLNode {
  type: "ssmlSentence";
  children: Node[];
}

/**
 * SSML Lang node - specifies language for text segment
 *
 * Corresponds to: <lang xml:lang="fr-FR">Bonjour</lang>
 */
export interface SSMLLang extends Parent, SSMLNode {
  type: "ssmlLang";
  children: Node[];
  data: {
    lang: string; // e.g., "en-US", "fr-FR", "de-DE"
  };
}

/**
 * Union type of all custom SSML nodes
 */
export type SSMLNodeType =
  | SSMLBreak
  | SSMLProsody
  | SSMLSayAs
  | SSMLSub
  | SSMLParagraph
  | SSMLSentence
  | SSMLLang;

/**
 * Type guard to check if a node is an SSML node
 */
export function isSSMLNode(node: Node): node is SSMLNodeType {
  return node.type.startsWith("ssml");
}

/**
 * Type guard for SSMLBreak
 */
export function isSSMLBreak(node: Node): node is SSMLBreak {
  return node.type === "ssmlBreak";
}

/**
 * Type guard for SSMLProsody
 */
export function isSSMLProsody(node: Node): node is SSMLProsody {
  return node.type === "ssmlProsody";
}

/**
 * Type guard for SSMLSayAs
 */
export function isSSMLSayAs(node: Node): node is SSMLSayAs {
  return node.type === "ssmlSayAs";
}

/**
 * Type guard for SSMLSub
 */
export function isSSMLSub(node: Node): node is SSMLSub {
  return node.type === "ssmlSub";
}
