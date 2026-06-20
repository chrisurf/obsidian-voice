/**
 * Shared plain-text chunker for text-input TTS providers (ElevenLabs, OpenAI).
 *
 * Splits text into chunks under a character limit, preferring paragraph, then
 * sentence, then word boundaries so the synthesized audio stays natural and no
 * single request exceeds the provider's per-call input limit.
 */

/**
 * Split text into chunks under the given character limit, preferring paragraph
 * then sentence then word boundaries.
 */
export function chunkPlainText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) {
    return [text];
  }

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  const addPiece = (piece: string, separator: string) => {
    if (!piece) return;
    if (current && (current + separator + piece).length > maxLen) {
      flush();
    }
    current = current ? current + separator + piece : piece;
  };

  const paragraphs = text.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLen) {
      addPiece(paragraph, "\n\n");
      continue;
    }

    // Paragraph too long: split into sentences. Avoid regex lookbehind
    // (unsupported on iOS < 16.4) by matching sentence runs incl. their
    // terminator instead.
    flush();
    const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
    for (const sentence of sentences) {
      if (sentence.length <= maxLen) {
        addPiece(sentence, " ");
        continue;
      }

      // Sentence too long: hard-split by words.
      flush();
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if (current && (current + " " + word).length > maxLen) {
          flush();
        }
        current = current ? current + " " + word : word;
      }
    }
  }

  flush();
  return chunks.length ? chunks : [text];
}
