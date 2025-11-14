/**
 * SSMLChunker - Intelligently splits SSML into Polly-compatible chunks
 *
 * AWS Polly limits:
 * - SSML text content: 3000 billable characters (text inside tags that gets spoken)
 * - Total SSML: Additional overhead from tags
 *
 * Strategy:
 * - Split at sentence boundaries (<s> or <p> tags)
 * - Preserve SSML tag integrity
 * - Use 2500 char limit for safety (allows ~500 chars for SSML markup)
 * - Wrap each chunk in <speak> tags
 */

export interface SSMLChunk {
  ssml: string;
  index: number;
  total: number;
}

/**
 * Chunk SSML into Polly-compatible segments
 */
export function chunkSSML(
  ssml: string,
  maxChunkSize: number = 2500, // Conservative limit for text content + SSML tags
): SSMLChunk[] {
  // Remove outer <speak> tags if present
  let content = ssml.trim();
  if (content.startsWith("<speak>") && content.endsWith("</speak>")) {
    content = content.slice(7, -8).trim();
  }

  // If content is already small enough, return as single chunk
  if (content.length + 15 <= maxChunkSize) {
    // +15 for <speak></speak>
    return [
      {
        ssml: `<speak>${content}</speak>`,
        index: 0,
        total: 1,
      },
    ];
  }

  // Split at sentence/paragraph boundaries
  const chunks = smartSplit(content, maxChunkSize);

  return chunks.map((chunk, index) => ({
    ssml: `<speak>${chunk}</speak>`,
    index,
    total: chunks.length,
  }));
}

/**
 * Smart split that tries to preserve sentence boundaries
 */
function smartSplit(content: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  // Split by paragraph breaks first (they're the largest logical units)
  const paragraphs = content.split(/(<break\s+time="[^"]+ms"\/>)/);

  for (const segment of paragraphs) {
    // Check if adding this segment would exceed limit
    if (currentChunk.length + segment.length + 15 > maxSize) {
      // If current chunk has content, save it
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // If segment itself is too large, split it further
      if (segment.length + 15 > maxSize) {
        const subChunks = splitLargeSegment(segment, maxSize);
        chunks.push(...subChunks.slice(0, -1));
        currentChunk = subChunks[subChunks.length - 1];
      } else {
        currentChunk = segment;
      }
    } else {
      currentChunk += segment;
    }
  }

  // Add final chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}

/**
 * Split a large segment that doesn't fit in one chunk
 * Try to split at prosody boundaries, then at sentence boundaries
 */
function splitLargeSegment(segment: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let remaining = segment;

  while (remaining.length + 15 > maxSize) {
    // Try to find a good split point
    let splitPoint = findSplitPoint(remaining, maxSize - 15);

    if (splitPoint === -1) {
      // No good split point found, force split at maxSize
      splitPoint = maxSize - 15;
    }

    chunks.push(remaining.substring(0, splitPoint));
    remaining = remaining.substring(splitPoint);
  }

  if (remaining.trim()) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Find the best split point in a string
 * Priority: </prosody>, </p>, </s>, sentence end, space
 */
function findSplitPoint(text: string, maxPos: number): number {
  if (maxPos >= text.length) {
    return text.length;
  }

  // Look for good split points working backwards from maxPos
  const searchText = text.substring(0, maxPos);

  // Priority 1: End of prosody tag
  let splitPoint = searchText.lastIndexOf("</prosody>");
  if (splitPoint !== -1) {
    return splitPoint + 10; // Include the closing tag
  }

  // Priority 2: End of paragraph tag
  splitPoint = searchText.lastIndexOf("</p>");
  if (splitPoint !== -1) {
    return splitPoint + 4;
  }

  // Priority 3: End of sentence tag
  splitPoint = searchText.lastIndexOf("</s>");
  if (splitPoint !== -1) {
    return splitPoint + 4;
  }

  // Priority 4: Break tag (natural pause point)
  splitPoint = searchText.lastIndexOf("/>");
  if (
    splitPoint !== -1 &&
    text.substring(Math.max(0, splitPoint - 20), splitPoint).includes("<break")
  ) {
    return splitPoint + 2;
  }

  // Priority 5: Sentence ending with punctuation
  const sentenceEnd = /[.!?]\s+/.exec(searchText);
  if (sentenceEnd && sentenceEnd.index > maxPos * 0.7) {
    return sentenceEnd.index + sentenceEnd[0].length;
  }

  // Priority 6: Last space
  splitPoint = searchText.lastIndexOf(" ");
  if (splitPoint > maxPos * 0.5) {
    return splitPoint + 1;
  }

  // No good split point found
  return -1;
}

/**
 * Validate that chunked SSML maintains proper structure
 */
export function validateChunks(chunks: SSMLChunk[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const chunk of chunks) {
    // Check each chunk is properly wrapped
    if (!chunk.ssml.startsWith("<speak>") || !chunk.ssml.endsWith("</speak>")) {
      errors.push(
        `Chunk ${chunk.index} is not properly wrapped in <speak> tags`,
      );
    }

    // Check chunk size
    if (chunk.ssml.length > 6000) {
      errors.push(
        `Chunk ${chunk.index} exceeds 6000 characters: ${chunk.ssml.length}`,
      );
    }

    // Basic tag balance check
    // Count opening tags (excluding self-closing)
    const allOpenTags = chunk.ssml.match(/<[^/][^>]*>/g) || [];
    const selfClosing = (chunk.ssml.match(/<[^>]+\/>/g) || []).length;
    const openTags = allOpenTags.length - selfClosing;
    const closeTags = (chunk.ssml.match(/<\/[^>]+>/g) || []).length;

    // Opening tags should match closing tags
    if (openTags !== closeTags) {
      errors.push(
        `Chunk ${chunk.index} has unbalanced tags (${openTags} open, ${closeTags} close)`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
