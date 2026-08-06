const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function isSingleEmojiGrapheme(value: string): boolean {
  if (value.length > 32) return false;

  const segments = [...segmenter.segment(value)];
  if (segments.length !== 1) return false;

  return /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u.test(
    value,
  );
}
