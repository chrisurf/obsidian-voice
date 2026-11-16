/**
 * Shared plain-text chunker for text-input TTS providers (ElevenLabs, OpenAI).
 *
 * Splits text into chunks under a character limit, preferring paragraph, then
 * sentence, then word boundaries so the synthesized audio stays natural and no
 * single request exceeds the provider's per-call input limit.
 */

/**
 * Split text into chunks under the given character limit, preferring paragraph
 * then sentence then word boundaries. The limit can also be a function of the
 * chunk index, e.g. small first chunks so streamed playback starts quickly.
 */
export function chunkPlainText(
  text: string,
  limit: number | ((index: number) => number),
): string[] {
  const chunks: string[] = [];
  let current = "";
  const maxLenAt = typeof limit === "number" ? () => limit : limit;
  // The limit of the chunk being filled.
  const max = () => maxLenAt(chunks.length);

  if (text.length <= max()) {
    return [text];
  }

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  const addPiece = (piece: string, separator: string) => {
    if (!piece) return;
    if (current && (current + separator + piece).length > max()) {
      flush();
    }
    current = current ? current + separator + piece : piece;
  };

  const paragraphs = text.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    // A chunk that is still less than half full (e.g. just a heading) is
    // topped up with the next paragraph's sentences rather than sent almost
    // empty: a tiny first chunk would play out before the next one is ready.
    const topUp =
      current.length > 0 &&
      current.length < max() / 2 &&
      (current + "\n\n" + paragraph).length > max();
    if (paragraph.length <= max() && !topUp) {
      addPiece(paragraph, "\n\n");
      continue;
    }

    // Paragraph too long (or topping up): split into sentences. Avoid regex
    // lookbehind (unsupported on iOS < 16.4) by matching sentence runs incl.
    // their terminator instead.
    if (!topUp) {
      flush();
    }
    const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
    let separator = "\n\n";
    for (const sentence of sentences) {
      if (sentence.length <= max()) {
        addPiece(sentence, separator);
        separator = " ";
        continue;
      }
      separator = " ";

      // Sentence too long: hard-split by words.
      flush();
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if (current && (current + " " + word).length > max()) {
          flush();
        }
        current = current ? current + " " + word : word;
      }
    }
  }

  flush();
  return chunks.length ? chunks : [text];
}
