/**
 * LexiconProcessor - applies a speech profile's pronunciation lexicon to the
 * text of a (cleaned) Markdown AST, so "KI" or "z. B." are said the way the
 * profile wants. Runs on text nodes only, after cleaning, so link targets and
 * dropped URLs are never touched.
 */

import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { LexiconEntry } from "../../profiles/schema";
import { applyLexicon } from "../../profiles/lexicon";

export function lexiconProcessor(entries: LexiconEntry[]) {
  return function transformer(tree: Root): void {
    if (entries.length === 0) {
      return;
    }
    visit(tree, "text", (node) => {
      node.value = applyLexicon(node.value, entries);
    });
  };
}
