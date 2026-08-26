const CHINESE_ORDINAL = /第[一二三四五六七八九十]/g
// Exclude narrative sequence ordinals (第一天, 第二批, 第一步) from list splitting.
const FALSE_ORDINAL_TAIL = /^(名|时间|反应|印象|人称|天|日|夜|周|月|年|季度|批|轮|次|个|步|阶段)/
const ORDINAL_TAIL = /^(点|是)?[，,、.\s]*/
const INLINE_ARABIC_ITEM = /(?<=\S)\s+(?=[2-9]\.\s|[1-9]\d\.\s)/g

/**
 * Turn spoken Chinese ordinals (第一/第二) or a one-line `1. … 2. …` run
 * into a real numbered list. Used as a layout safety net after the built-in
 * polish prompt, because models often punctuate 第一…第二… without line breaks.
 */
export function applySpokenEnumerationLayout(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return trimmed
  const fromChinese = layoutChineseOrdinals(trimmed)
  return breakInlineArabicItems(fromChinese)
}

function layoutChineseOrdinals(text: string): string {
  const markers: Array<{ index: number; length: number }> = []
  CHINESE_ORDINAL.lastIndex = 0
  for (let match = CHINESE_ORDINAL.exec(text); match !== null; match = CHINESE_ORDINAL.exec(text)) {
    const after = text.slice(match.index + match[0].length)
    if (FALSE_ORDINAL_TAIL.test(after)) continue
    markers.push({ index: match.index, length: match[0].length })
  }
  if (markers.length < 2) return text
  if (hasMultilineNumberedList(text)) return text

  const leadIn = text.slice(0, markers[0].index).trim()
  const items: string[] = []
  for (const [index, marker] of markers.entries()) {
    const start = marker.index + marker.length
    const end = markers[index + 1]?.index ?? text.length
    const item = text.slice(start, end).replace(ORDINAL_TAIL, '').replace(/[。；;]+$/u, '').trim()
    if (item !== '') items.push(item)
  }
  if (items.length < 2) return text

  const list = items.map((item, index) => `${index + 1}. ${item}`).join('\n')
  if (leadIn === '') return list
  const prefix = /[：:]$/.test(leadIn) ? leadIn : `${leadIn}：`
  return `${prefix}\n${list}`
}

function breakInlineArabicItems(text: string): string {
  if (hasMultilineNumberedList(text)) return text
  return text.replace(INLINE_ARABIC_ITEM, '\n')
}

function hasMultilineNumberedList(text: string): boolean {
  return text.split(/\n+/u).filter((line) => /^\d+\.\s+\S/.test(line)).length >= 2
}
