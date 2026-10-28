import assert from "node:assert/strict";
/** Check captured text spans, not merely characters present in the frame. */
export function assertReadable(frame: any, labels: readonly string[]) {
  const spans = frame.lines.flatMap((line: any) => line.spans);
  const luminance = (color: any) =>
    [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
      const channel = color.buffer[index] / 255;
      return (
        sum +
        weight *
          (channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4)
      );
    }, 0);
  for (const label of labels) {
    const matching = spans.filter((span: any) => span.text.includes(label));
    assert.ok(matching.length, `missing captured span: ${label}`);
    for (const span of matching) {
      const fg = luminance(span.fg),
        bg = luminance(span.bg);
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      assert.ok(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)} < 4.5`);
    }
  }
}
