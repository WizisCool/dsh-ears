/**
 * Voice-input shortcut logic.
 * Canonical chord format: lowercase, '+' separated modifiers in order ctrl, alt, shift, meta, then key.
 */

export type ShortcutModifier = 'ctrl' | 'alt' | 'shift' | 'meta'

export const SHORTCUT_MODIFIERS: readonly ShortcutModifier[] = ['ctrl', 'alt', 'shift', 'meta']

export const SHORTCUT_MAX_LENGTH = 64

/** Key tokens that type or act on text; never valid as a bare shortcut. */
const TEXT_ACTION_TOKENS = new Set([
  'space', 'enter', 'tab', 'backspace', 'delete',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'home', 'end', 'pageup', 'pagedown', 'insert',
  'backquote', 'semicolon', 'period', 'comma', 'minus', 'equal',
  'bracketleft', 'bracketright', 'backslash', 'slash', 'quote', 'intlbackslash'
])

/** Reserved browser/OS chords that produce a collision warning. */
const RESERVED_CHORDS = new Set<string>([
  'f1', 'f3', 'f4', 'f5', 'f6', 'f10', 'f11', 'f12', 'ctrl+f5',
  'alt', 'meta',
  'ctrl+space', 'alt+space', 'alt+tab', 'ctrl+tab', 'ctrl+shift+tab',
  'alt+f4', 'ctrl+alt+delete',
  'meta+space', 'meta+backquote',
  'ctrl+enter', 'meta+enter'
])

for (let index = 0; index < 26; index += 1) {
  const letter = String.fromCharCode(97 + index)
  RESERVED_CHORDS.add(`ctrl+${letter}`)
  RESERVED_CHORDS.add(`meta+${letter}`)
}
for (const letter of 'tnprijksdwqf') RESERVED_CHORDS.add(`ctrl+shift+${letter}`)
for (const letter of 'nwqacphs') RESERVED_CHORDS.add(`shift+meta+${letter}`)
for (let index = 0; index <= 9; index += 1) {
  RESERVED_CHORDS.add(`ctrl+${index}`)
  RESERVED_CHORDS.add(`meta+${index}`)
}

export interface ParsedShortcut {
  readonly modifiers: readonly ShortcutModifier[]
  readonly key: string
}

const KEY_TOKEN_BY_CODE: Record<string, string> = {
  Space: 'space',
  Backquote: 'backquote',
  Semicolon: 'semicolon',
  Period: 'period',
  Comma: 'comma',
  Minus: 'minus',
  Equal: 'equal',
  BracketLeft: 'bracketleft',
  BracketRight: 'bracketright',
  Backslash: 'backslash',
  Slash: 'slash',
  Quote: 'quote',
  IntlBackslash: 'intlbackslash',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Insert: 'insert'
}

for (let index = 1; index <= 12; index += 1) KEY_TOKEN_BY_CODE[`F${index}`] = `f${index}`
for (let index = 0; index < 26; index += 1) {
  const letter = String.fromCharCode(65 + index)
  KEY_TOKEN_BY_CODE[`Key${letter}`] = letter.toLowerCase()
}
for (let index = 0; index <= 9; index += 1) KEY_TOKEN_BY_CODE[`Digit${index}`] = String(index)

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'
])

const CODE_BY_KEY_TOKEN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(KEY_TOKEN_BY_CODE).map(([code, token]) => [token, code])
)

function isModifierToken(token: string): token is ShortcutModifier {
  return (SHORTCUT_MODIFIERS as readonly string[]).includes(token)
}

function mergeModifiers(
  left: readonly ShortcutModifier[],
  right: readonly ShortcutModifier[]
): readonly ShortcutModifier[] {
  return SHORTCUT_MODIFIERS.filter((modifier) => left.includes(modifier) || right.includes(modifier))
}

/** Map a modifier keydown/keyup to its canonical token. */
export function modifierTokenFromEvent(event: { readonly key?: string; readonly code?: string }): ShortcutModifier | null {
  if (event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight') return 'ctrl'
  if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') return 'alt'
  if (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') return 'shift'
  if (event.key === 'Meta' || event.code === 'MetaLeft' || event.code === 'MetaRight') return 'meta'
  return null
}

/** Parse a canonical chord into modifiers and key token; null on malformed input. */
export function parseShortcut(chord: string): ParsedShortcut | null {
  if (typeof chord !== 'string') return null
  if (chord.trim() === '' || chord.length > SHORTCUT_MAX_LENGTH) return null
  const tokens = chord.trim().toLowerCase().split('+').filter((token) => token !== '')
  if (tokens.length === 0) return null
  if (tokens.every(isModifierToken)) {
    const modifiers: ShortcutModifier[] = []
    for (const token of tokens) {
      if (!modifiers.includes(token)) modifiers.push(token)
    }
    return { modifiers, key: '' }
  }
  const last = tokens[tokens.length - 1]
  if (!(last in CODE_BY_KEY_TOKEN)) return null
  const modifiers: ShortcutModifier[] = []
  for (const token of tokens.slice(0, -1)) {
    if (!isModifierToken(token)) return null
    if (!modifiers.includes(token)) modifiers.push(token)
  }
  return { modifiers, key: last }
}

/** Rebuild a canonical chord from any valid token order; null on malformed input. */
export function normalizeShortcut(chord: string): string | null {
  const parsed = parseShortcut(chord)
  if (parsed === null) return null
  return canonicalChord(parsed)
}

function canonicalChord(parsed: ParsedShortcut): string {
  const parts: string[] = SHORTCUT_MODIFIERS.filter((modifier) => parsed.modifiers.includes(modifier))
  if (parsed.key !== '') parts.push(parsed.key)
  return parts.join('+')
}

export function shortcutFromModifiers(modifiers: readonly ShortcutModifier[]): string | null {
  if (modifiers.length === 0) return null
  return canonicalChord({ modifiers, key: '' })
}

export type ShortcutRejectReason = 'typing-key' | 'invalid'

/** Determine whether a shortcut chord should be rejected as invalid or a bare typing key. */
export function shortcutRejectReason(chord: string): ShortcutRejectReason | null {
  if (typeof chord !== 'string' || chord.trim() === '' || chord.length > SHORTCUT_MAX_LENGTH) return 'invalid'
  const parsed = parseShortcut(chord)
  if (parsed === null) return 'invalid'
  if (parsed.key === '') return parsed.modifiers.length === 0 ? 'invalid' : null
  if (/^[a-z]$/.test(parsed.key) || /^[0-9]$/.test(parsed.key)) {
    if (parsed.modifiers.length === 0 || parsed.modifiers.includes('alt')) return 'typing-key'
    return null
  }
  if (parsed.modifiers.length === 0 && TEXT_ACTION_TOKENS.has(parsed.key)) return 'typing-key'
  return null
}

export function isValidStoredShortcut(chord: string): boolean {
  return shortcutRejectReason(chord) === null
}

/** True when the chord is valid but collides with a browser/OS-reserved combination. */
export function isReservedShortcut(chord: string): boolean {
  const normalized = normalizeShortcut(chord)
  return normalized !== null && RESERVED_CHORDS.has(normalized)
}

type ModifierSourceEvent = {
  readonly code?: string
  readonly key?: string
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  readonly getModifierState?: (key: string) => boolean
}

/** Read held modifiers from a keyboard event. */
export function modifiersFromEvent(event: ModifierSourceEvent, fromKey = false): readonly ShortcutModifier[] {
  const modifiers: ShortcutModifier[] = []
  if (isCtrlDown(event, fromKey)) modifiers.push('ctrl')
  if (isAltDown(event, fromKey)) modifiers.push('alt')
  if (isShiftDown(event, fromKey)) modifiers.push('shift')
  if (isMetaDown(event, fromKey)) modifiers.push('meta')
  return modifiers
}

function isCtrlDown(event: ModifierSourceEvent, fromKey: boolean): boolean {
  return event.ctrlKey || event.getModifierState?.('Control') === true
    || (fromKey && (event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight'))
}

function isAltDown(event: ModifierSourceEvent, fromKey: boolean): boolean {
  return event.altKey || event.getModifierState?.('Alt') === true
    || (fromKey && (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight'))
}

function isShiftDown(event: ModifierSourceEvent, fromKey: boolean): boolean {
  return event.shiftKey || event.getModifierState?.('Shift') === true
    || (fromKey && (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight'))
}

function isMetaDown(event: ModifierSourceEvent, fromKey: boolean): boolean {
  return event.metaKey || event.getModifierState?.('Meta') === true
    || (fromKey && (event.key === 'Meta' || event.code === 'MetaLeft' || event.code === 'MetaRight'))
}

/** Build the canonical chord from a keydown; null when the event carries no capturable key. */
export function shortcutFromEvent(event: ModifierSourceEvent & { readonly code: string }): string | null {
  const key = KEY_TOKEN_BY_CODE[event.code]
  if (key === undefined) return null
  return canonicalChord({ modifiers: modifiersFromEvent(event), key })
}

/** Merge remembered held modifiers with the current event (macOS Control can vanish from the second keydown). */
export function shortcutFromEventAndHeld(
  event: ModifierSourceEvent & { readonly code: string },
  held: readonly ShortcutModifier[]
): string | null {
  const key = KEY_TOKEN_BY_CODE[event.code]
  if (key === undefined) return null
  return canonicalChord({ modifiers: mergeModifiers(held, modifiersFromEvent(event)), key })
}

export interface ShortcutRecorderState {
  readonly held: readonly ShortcutModifier[]
  readonly peak: readonly ShortcutModifier[]
}

export const EMPTY_SHORTCUT_RECORDER: ShortcutRecorderState = { held: [], peak: [] }

export type ShortcutRecorderInput = ModifierSourceEvent & {
  readonly type: 'keydown' | 'keyup'
  readonly key: string
  readonly code: string
  readonly repeat?: boolean
}

export type ShortcutRecorderDecision =
  | { kind: 'ignore'; state: ShortcutRecorderState }
  | { kind: 'cancel'; state: ShortcutRecorderState }
  | { kind: 'update'; state: ShortcutRecorderState }
  | { kind: 'commit'; state: ShortcutRecorderState; chord: string }

/** Advance the shortcut recorder state based on a key event. */
export function reduceShortcutRecorder(
  state: ShortcutRecorderState,
  event: ShortcutRecorderInput
): ShortcutRecorderDecision {
  if (event.type === 'keydown') {
    if (event.key === 'Escape') return { kind: 'cancel', state: EMPTY_SHORTCUT_RECORDER }
    if (event.repeat) return { kind: 'ignore', state }
    if (isModifierKeyEvent(event)) {
      const token = modifierTokenFromEvent(event)
      const held = mergeModifiers(
        mergeModifiers(state.held, modifiersFromEvent(event, true)),
        token === null ? [] : [token]
      )
      const peak = held.length >= state.peak.length ? held : state.peak
      return { kind: 'update', state: { held, peak } }
    }
    const chord = shortcutFromEventAndHeld(event, state.held)
    if (chord === null) return { kind: 'ignore', state }
    return { kind: 'commit', state: EMPTY_SHORTCUT_RECORDER, chord }
  }
  if (event.repeat || !isModifierKeyEvent(event)) return { kind: 'ignore', state }
  const released = modifierTokenFromEvent(event)
  const held = SHORTCUT_MODIFIERS.filter((modifier) => {
    if (released !== null && modifier === released) return false
    return state.held.includes(modifier) || modifiersFromEvent(event).includes(modifier)
  })
  if (held.length > 0) return { kind: 'update', state: { held, peak: state.peak } }
  const chord = shortcutFromModifiers(state.peak)
  if (chord === null) return { kind: 'ignore', state }
  return { kind: 'commit', state: EMPTY_SHORTCUT_RECORDER, chord }
}

/** True when a keydown event matches the stored chord, with strict modifier equality. */
export function matchesShortcut(chord: string, event: ModifierSourceEvent & { readonly code: string }): boolean {
  const parsed = parseShortcut(chord)
  if (parsed === null) return false
  const modifierKey = MODIFIER_CODES.has(event.code)
  if (parsed.key === '') {
    if (!modifierKey) return false
  } else if (event.code !== CODE_BY_KEY_TOKEN[parsed.key]) return false
  const held = modifiersFromEvent(event, modifierKey)
  const want = (modifier: ShortcutModifier): boolean => parsed.modifiers.includes(modifier)
  return (SHORTCUT_MODIFIERS as readonly ShortcutModifier[]).every((modifier) => held.includes(modifier) === want(modifier))
}

/** True when the pressed key is a modifier key itself. */
export function isModifierKeyEvent(event: { readonly key: string; readonly code?: string }): boolean {
  return modifierTokenFromEvent(event) !== null
}

const MODIFIER_LABELS: Readonly<Record<ShortcutModifier, Readonly<Record<'mac' | 'win' | 'linux', string>>>> = {
  ctrl: { mac: '⌃', win: 'Ctrl', linux: 'Ctrl' },
  alt: { mac: '⌥', win: 'Alt', linux: 'Alt' },
  shift: { mac: '⇧', win: 'Shift', linux: 'Shift' },
  meta: { mac: '⌘', win: 'Win', linux: 'Super' }
}

const KEY_LABELS: Record<string, string> = {
  space: 'Space',
  backquote: '`',
  semicolon: ';',
  period: '.',
  comma: ',',
  minus: '-',
  equal: '=',
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
  slash: '/',
  quote: "'",
  intlbackslash: '\\',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  pageup: 'Page Up',
  pagedown: 'Page Down'
}

for (let index = 1; index <= 12; index += 1) KEY_LABELS[`f${index}`] = `F${index}`

/** Render a canonical-order modifier list for live capture feedback (no key yet). */
export function formatModifierChord(modifiers: readonly ShortcutModifier[], platform: 'mac' | 'win' | 'linux'): string {
  return modifiers.map((modifier) => MODIFIER_LABELS[modifier][platform]).join(platform === 'mac' ? '' : '+')
}

/** Render a stored chord for display; platform only changes the primary modifier labels. */
export function formatShortcut(chord: string, platform: 'mac' | 'win' | 'linux'): string {
  const parsed = parseShortcut(chord)
  if (parsed === null) return chord
  const modifierText = parsed.modifiers.map((modifier) => MODIFIER_LABELS[modifier][platform]).join(platform === 'mac' ? '' : '+')
  if (parsed.key === '') return modifierText
  const keyLabel = KEY_LABELS[parsed.key] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key)
  if (modifierText === '') return keyLabel
  return platform === 'mac' ? `${modifierText}${keyLabel}` : `${modifierText}+${keyLabel}`
}
