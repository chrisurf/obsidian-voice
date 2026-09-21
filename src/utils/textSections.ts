/**
 * Split markdown into heading-based sections for progressive TTS playback.
 *
 * Each ATX heading (`#` … `######`) starts a new section titled with that
 * heading's text. Content before the first heading is kept as its own section
 * ("Introduction"). Fenced code blocks are not scanned for headings.
 */

export interface MarkdownSection {
  /** Display title for the player's chapter list. */
  title: string;
  /** Markdown body of the section, including the heading line when present. */
  markdown: string;
}

const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Split a markdown note into titled sections at ATX headings.
 * A note with no headings returns a single untitled section.
 */
export function splitMarkdownByHeading(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const buckets: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } = { title: "", lines: [] };
  let inFence = false;

  for (const line of lines) {
    const fence = line.trimStart();
    if (fence.startsWith("```") || fence.startsWith("~~~")) {
      inFence = !inFence;
      current.lines.push(line);
      continue;
    }

    const heading = !inFence ? ATX_HEADING.exec(line) : null;
    if (heading) {
      if (current.title || current.lines.some((item) => item.trim())) {
        buckets.push(current);
      }
      current = { title: heading[2].trim(), lines: [line] };
      continue;
    }

    current.lines.push(line);
  }

  if (current.title || current.lines.some((item) => item.trim())) {
    buckets.push(current);
  }

  if (buckets.length === 0) {
    return [{ title: "", markdown: markdown.trim() }];
  }

  if (buckets.length > 1 && !buckets[0].title) {
    buckets[0].title = "Introduction";
  }

  return buckets.map((bucket) => ({
    title: bucket.title,
    markdown: bucket.lines.join("\n").trim(),
  }));
}
