/**
 * skipMarkers - skip text enclosed by user-chosen marker pairs.
 *
 * Runs on plain mdast text-node values AFTER markdown structure has been
 * parsed away, so it can never touch markdown syntax (headings, links, code
 * blocks, ...). Matching is literal (no user regex anywhere); one level of
 * same-pair nesting is supported. An opener without a matching closer is left
 * untouched — the fail-safe direction is always "skip nothing" rather than
 * deleting real prose.
 */

export interface MarkerPair {
  open: string;
  close: string;
}

/** Built-in, user-facing enclosure presets. `id` is persisted in settings. */
export const SKIP_ENCLOSURE_PRESETS: {
  id: string;
  label: string;
  pair: MarkerPair;
}[] = [
  {
    id: "paren",
    label: "English parentheses ( … )",
    pair: { open: "(", close: ")" },
  },
  {
    id: "fullwidth-paren",
    label: "中文圆括号 （ … ）",
    pair: { open: "（", close: "）" },
  },
  {
    id: "square",
    label: "Square brackets [ … ]",
    pair: { open: "[", close: "]" },
  },
  {
    id: "lenticular",
    label: "方头括号 【 … 】",
    pair: { open: "【", close: "】" },
  },
  {
    id: "book-title",
    label: "书名号 《 … 》",
    pair: { open: "《", close: "》" },
  },
  {
    id: "curly",
    label: "Curly braces { … }",
    pair: { open: "{", close: "}" },
  },
  {
    id: "obsidian-comment",
    label: "Obsidian comments %% … %% (inline)",
    pair: { open: "%%", close: "%%" },
  },
];

/** Resolve enabled preset ids + validated custom pairs into marker pairs. */
export function buildMarkerPairs(
  enabledPresetIds: string[],
  customPairs: MarkerPair[],
): MarkerPair[] {
  const presets = SKIP_ENCLOSURE_PRESETS.filter((preset) =>
    enabledPresetIds.includes(preset.id),
  ).map((preset) => preset.pair);
  // Same open/close delimiters ARE allowed (**bold**, *italic*, `code`,
  // %%comment%%) — removeEnclosed handles them via depth counting.
  const custom = (customPairs ?? [])
    .filter(
      (pair) => pair && pair.open.trim() !== "" && pair.close.trim() !== "",
    )
    .map((pair) => ({ open: pair.open.trim(), close: pair.close.trim() }));
  return [...presets, ...custom];
}

/**
 * Markdown emphasis/strong/inline-code delimiters are consumed by the parser,
 * so text wrapped in them only exists as AST nodes (strong / emphasis /
 * inlineCode), never as literal characters in text nodes. When a configured
 * pair uses one of these delimiters, CleanProcessor drops the matching node
 * instead of relying on the text-level scanner.
 */
export interface SyntaxNodeSkip {
  strong: boolean;
  emphasis: boolean;
  inlineCode: boolean;
}

export function syntaxNodeSkip(pairs: MarkerPair[]): SyntaxNodeSkip {
  const has = (open: string, close: string): boolean =>
    pairs.some((pair) => pair.open === open && pair.close === close);
  return {
    strong: has("**", "**") || has("__", "__"),
    emphasis: has("*", "*") || has("_", "_"),
    inlineCode: has("`", "`"),
  };
}

/**
 * Remove every balanced enclosed span, markers included.
 *
 * - Multi-character markers are supported.
 * - Same-pair nesting is tracked so "(a (b) c)" is removed as a whole.
 * - An opener with no matching closer is kept verbatim.
 * - Runs of spaces left by a removal are collapsed; structural whitespace
 *   (newlines/tabs) is preserved.
 */
export function removeEnclosed(text: string, pairs: MarkerPair[]): string {
  if (!pairs.length) {
    return text;
  }

  let out = "";
  let i = 0;

  while (i < text.length) {
    // Earliest opener at or after i across every enabled pair.
    let next: { start: number; pair: MarkerPair } | null = null;
    for (const pair of pairs) {
      const idx = text.indexOf(pair.open, i);
      if (idx !== -1 && (next === null || idx < next.start)) {
        next = { start: idx, pair };
      }
    }

    if (!next) {
      out += text.slice(i);
      break;
    }

    const { start, pair } = next;
    out += text.slice(i, start);

    // Walk to the matching close, counting nested same-pair openers.
    let depth = 1;
    let j = start + pair.open.length;
    let end = -1;

    while (j < text.length) {
      const closeIdx = text.indexOf(pair.close, j);
      if (closeIdx === -1) {
        break;
      }
      const openIdx =
        pair.open === pair.close ? -1 : text.indexOf(pair.open, j);
      if (openIdx !== -1 && openIdx < closeIdx) {
        depth++;
        j = openIdx + pair.open.length;
      } else {
        depth--;
        if (depth === 0) {
          end = closeIdx + pair.close.length;
          break;
        }
        j = closeIdx + pair.close.length;
      }
    }

    if (end === -1) {
      // Unmatched opener: keep it and continue right after it.
      out += pair.open;
      i = start + pair.open.length;
    } else {
      i = end;
    }
  }

  return out.replace(/[ \t]{2,}/g, " ");
}
