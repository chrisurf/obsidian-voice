/**
 * Dropping bare web addresses from spoken text ("skip URLs"). Link labels are
 * handled elsewhere and kept; only the address itself goes.
 */

/** Remove URLs, leaving the sentence around them well-formed. */
export function removeUrls(text: string): string {
  // Strip the URL, then collapse any double spaces it leaves behind and the
  // space it leaves before punctuation ("see https://x." → "see."). Leading
  // and trailing spaces are kept so words stay separated from adjacent inline
  // nodes (e.g. "A normal " + link + " link").
  return (
    text
      // A sentence's punctuation right after an address is not part of it.
      .replace(/(?:https?:\/\/|www\.)\S*[^\s.,;:!?)\]]/gi, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:!?])/g, "$1")
  );
}

interface TextLike {
  type: string;
  value?: string;
}

/**
 * Merge runs of adjacent text nodes and tidy them like removeUrls does. A bare
 * address is its own (autolink) node, so dropping it leaves "see " and "." as
 * separate texts — this joins them into "see.".
 */
export function mergeTextRuns<T extends TextLike>(children: T[]): T[] {
  const merged: T[] = [];
  for (const child of children) {
    const last = merged[merged.length - 1];
    if (child.type === "text" && last?.type === "text") {
      last.value = `${last.value ?? ""}${child.value ?? ""}`;
    } else {
      merged.push(child);
    }
  }
  for (const node of merged) {
    if (node.type === "text" && node.value !== undefined) {
      node.value = node.value
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([.,;:!?])/g, "$1");
    }
  }
  return merged.filter((node) => node.type !== "text" || node.value !== "");
}
