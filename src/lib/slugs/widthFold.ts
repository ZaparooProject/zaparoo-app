/**
 * golang.org/x/text/width.Fold as code point ranges.
 *
 * Generated from the widthFold table in __fixtures__/parity.json.gz (which
 * go-slugs exports from width.Fold); the parity test checks this table
 * against it for every code point. Each entry is [first, last, delta]: every
 * code point in first..last folds to itself plus delta. All entries are in
 * the BMP and map one code point to one code point.
 */
const widthFoldRanges: readonly (readonly [number, number, number])[] = [
  [0x3000, 0x3000, -12256],
  [0xff01, 0xff5e, -65248],
  [0xff5f, 0xff60, -54746],
  [0xff61, 0xff61, -53087],
  [0xff62, 0xff63, -53078],
  [0xff64, 0xff64, -53091],
  [0xff65, 0xff65, -52842],
  [0xff66, 0xff66, -52852],
  [0xff67, 0xff67, -52934],
  [0xff68, 0xff68, -52933],
  [0xff69, 0xff69, -52932],
  [0xff6a, 0xff6a, -52931],
  [0xff6b, 0xff6b, -52930],
  [0xff6c, 0xff6c, -52873],
  [0xff6d, 0xff6d, -52872],
  [0xff6e, 0xff6e, -52871],
  [0xff6f, 0xff6f, -52908],
  [0xff70, 0xff70, -52852],
  [0xff71, 0xff71, -52943],
  [0xff72, 0xff72, -52942],
  [0xff73, 0xff73, -52941],
  [0xff74, 0xff74, -52940],
  [0xff75, 0xff76, -52939],
  [0xff77, 0xff77, -52938],
  [0xff78, 0xff78, -52937],
  [0xff79, 0xff79, -52936],
  [0xff7a, 0xff7a, -52935],
  [0xff7b, 0xff7b, -52934],
  [0xff7c, 0xff7c, -52933],
  [0xff7d, 0xff7d, -52932],
  [0xff7e, 0xff7e, -52931],
  [0xff7f, 0xff7f, -52930],
  [0xff80, 0xff80, -52929],
  [0xff81, 0xff81, -52928],
  [0xff82, 0xff82, -52926],
  [0xff83, 0xff83, -52925],
  [0xff84, 0xff84, -52924],
  [0xff85, 0xff8a, -52923],
  [0xff8b, 0xff8b, -52921],
  [0xff8c, 0xff8c, -52919],
  [0xff8d, 0xff8d, -52917],
  [0xff8e, 0xff8e, -52915],
  [0xff8f, 0xff93, -52913],
  [0xff94, 0xff94, -52912],
  [0xff95, 0xff95, -52911],
  [0xff96, 0xff9b, -52910],
  [0xff9c, 0xff9c, -52909],
  [0xff9d, 0xff9d, -52906],
  [0xff9e, 0xff9f, -52997],
  [0xffa0, 0xffa0, -52796],
  [0xffa1, 0xffbe, -52848],
  [0xffc2, 0xffc7, -52851],
  [0xffca, 0xffcf, -52853],
  [0xffd2, 0xffd7, -52855],
  [0xffda, 0xffdc, -52857],
  [0xffe0, 0xffe1, -65342],
  [0xffe2, 0xffe2, -65334],
  [0xffe3, 0xffe3, -65332],
  [0xffe4, 0xffe4, -65342],
  [0xffe5, 0xffe5, -65344],
  [0xffe6, 0xffe6, -57149],
  [0xffe8, 0xffe8, -56038],
  [0xffe9, 0xffec, -56921],
  [0xffed, 0xffed, -55885],
  [0xffee, 0xffee, -55843],
];

const widthFoldMap = new Map<number, string>();
for (const [first, last, delta] of widthFoldRanges) {
  for (let c = first; c <= last; c++) {
    widthFoldMap.set(c, String.fromCharCode(c + delta));
  }
}

// Every folded code point is U+3000 or in U+FF01..U+FFEE.
const widthFoldCandidate = /[\u3000\uff01-\uffee]/;

/** width.Fold.String(s). */
export function widthFold(s: string): string {
  if (!widthFoldCandidate.test(s)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += widthFoldMap.get(c) ?? s.charAt(i);
  }
  return out;
}
