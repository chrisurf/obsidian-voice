import {
  friendlySpeechError,
  PREPARE_ERROR_MESSAGE,
  NO_NOTE_MESSAGE,
  EMPTY_NOTE_MESSAGE,
  READ_ERROR_MESSAGE,
} from "../src/utils/speechFeedback";

describe("Unit Tests - Speech feedback", () => {
  describe("friendlySpeechError", () => {
    test("replaces SSML chunking internals with a friendly message", () => {
      const raw =
        "SSML chunking failed: Chunk 1 has unbalanced tags (31 open, 29 close)";
      expect(friendlySpeechError(raw)).toBe(PREPARE_ERROR_MESSAGE);
    });

    test("replaces SSML validation internals with a friendly message", () => {
      expect(friendlySpeechError("SSML validation failed: bad node")).toBe(
        PREPARE_ERROR_MESSAGE,
      );
    });

    test("replaces a bare unbalanced-tag message", () => {
      expect(friendlySpeechError("Chunk 2 has unbalanced tags")).toBe(
        PREPARE_ERROR_MESSAGE,
      );
    });

    test("passes through actionable provider messages unchanged", () => {
      const credential = "Azure Speech: invalid key or region (401)";
      const quota = "Azure Speech: rate or quota limit reached (429)";
      expect(friendlySpeechError(credential)).toBe(credential);
      expect(friendlySpeechError(quota)).toBe(quota);
    });
  });

  describe("messages", () => {
    test("all user-facing messages are non-empty and distinct", () => {
      const messages = [
        NO_NOTE_MESSAGE,
        EMPTY_NOTE_MESSAGE,
        READ_ERROR_MESSAGE,
        PREPARE_ERROR_MESSAGE,
      ];
      messages.forEach((m) => expect(m.length).toBeGreaterThan(0));
      expect(new Set(messages).size).toBe(messages.length);
    });
  });
});
