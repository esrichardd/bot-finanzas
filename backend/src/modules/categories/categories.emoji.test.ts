import { describe, expect, it } from "vitest";
import { isSingleEmojiGrapheme } from "./categories.emoji.js";

describe("isSingleEmojiGrapheme", () => {
  it.each(["🚗", "❤️", "❤️‍🩹", "👨‍👩‍👧‍👦", "✈️", "🇨🇴", "1️⃣"])(
    "accepts %s",
    (value) => expect(isSingleEmojiGrapheme(value)).toBe(true),
  );

  it.each(["", "texto", "🚗🚗", "a🚗", "🚗 "])("rejects %s", (value) => {
    expect(isSingleEmojiGrapheme(value)).toBe(false);
  });
});
