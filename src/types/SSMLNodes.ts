/**
 * Custom AST Node Types for SSML Generation
 *
 * These node types extend the standard mdast (Markdown AST) nodes
 * to represent SSML-specific structures during the transformation pipeline.
 */

import type { Node, Parent } from "unist";
import type { PhrasingContent } from "mdast";

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
  // Phrasing-level children (like mdast's own Emphasis/Strong). Typing this as
  // `PhrasingContent[]` rather than the looser `Node[]` keeps bare unist nodes
  // out of the mdast tree once this node is registered below, so tree walkers
  // (unist-util-visit) still narrow mdast node types cleanly.
  children: PhrasingContent[];
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
  children: PhrasingContent[];
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
  children: PhrasingContent[];
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
 * Register the inline SSML nodes with mdast's type system.
 *
 * `@types/mdast` documents exactly this pattern: custom nodes are declared as
 * first-class members of the AST by adding them to the relevant *content map*.
 * Every SSML wrapper the EnhanceProcessor produces replaces phrasing-level
 * content (a heading's inline children, bold/italic inners, acronyms, numbers,
 * abbreviations), so they belong in `PhrasingContentMap`.
 *
 * The payoff: `EnhanceProcessor` can assign an SSML node straight into a
 * heading's `children` (typed `PhrasingContent[]`) with no `as unknown as …`
 * double assertion — the node is genuinely part of the union now. This also
 * removes the scanner's "unnecessary assertion" finding at its root, since the
 * assertion no longer exists rather than merely being suppressed.
 */
declare module "mdast" {
  interface PhrasingContentMap {
    ssmlProsody: SSMLProsody;
    ssmlSayAs: SSMLSayAs;
    ssmlSub: SSMLSub;
  }
}

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
