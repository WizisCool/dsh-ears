/**
 * CJK scripts and full-width punctuation carry no inter-word spaces, so two
 * segments meeting on such a character join directly. Everything else keeps
 * the half-width space that Latin text relies on; mixed-script boundaries
 * also keep the space for readability.
 */
const CJK_BOUNDARY_HEAD = /^(?:\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|[\u3000-\u303f\u30fc\uff01-\uff20\uff3b-\uff40\uff5b-\uff65\u2014\u2026])/u
const CJK_BOUNDARY_TAIL = /(?:\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|[\u3000-\u303f\u30fc\uff01-\uff20\uff3b-\uff40\uff5b-\uff65\u2014\u2026])$/u

/**
 * Join two streamed speech segments or draft appends, inserting a separator
 * space only where the writing system expects one.
 */
export function joinSpacedSegments(current: string, next: string): string {
  if (next === '') return current
  if (current === '') return next
  if (/\s$/.test(current) || /^\s/.test(next)) return current + next
  if (CJK_BOUNDARY_TAIL.test(current) && CJK_BOUNDARY_HEAD.test(next)) return current + next
  return `${current} ${next}`
}
