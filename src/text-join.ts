/**
 * CJK scripts carry no inter-word spaces, and full-width punctuation is
 * already self-delimiting, so segments meeting on such characters join
 * directly. Everything else keeps the half-width space that Latin text
 * relies on; mixed-script boundaries also keep the space for readability.
 */
const CJK_SCRIPT = '\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana}|\\p{Script=Hangul}'
// Full-width punctuation only; full-width digits (０-９) are content
// characters, not delimiters.
const FULL_WIDTH_PUNCTUATION = '[\\u3000-\\u303f\\u30fc\\uff01-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65\\u2014\\u2026]'
const FULL_WIDTH_PUNCTUATION_HEAD = new RegExp(`^${FULL_WIDTH_PUNCTUATION}`, 'u')
const FULL_WIDTH_PUNCTUATION_TAIL = new RegExp(`${FULL_WIDTH_PUNCTUATION}$`, 'u')
const CJK_SCRIPT_HEAD = new RegExp(`^(?:${CJK_SCRIPT})`, 'u')
const CJK_SCRIPT_TAIL = new RegExp(`(?:${CJK_SCRIPT})$`, 'u')

/**
 * Join two streamed speech segments or draft appends, inserting a separator
 * space only where the writing system expects one.
 */
export function joinSpacedSegments(current: string, next: string): string {
  if (next === '') return current
  if (current === '') return next
  if (/\s$/.test(current) || /^\s/.test(next)) return current + next
  // Full-width punctuation delimits on its own, so either side joins without
  // a space; a plain CJK-to-CJK script boundary does too.
  if (FULL_WIDTH_PUNCTUATION_TAIL.test(current) || FULL_WIDTH_PUNCTUATION_HEAD.test(next)) return current + next
  if (CJK_SCRIPT_TAIL.test(current) && CJK_SCRIPT_HEAD.test(next)) return current + next
  return `${current} ${next}`
}
