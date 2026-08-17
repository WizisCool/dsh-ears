import { describe, expect, it } from 'vitest'
import {
  formatModifierChord,
  formatShortcut,
  isModifierKeyEvent,
  isReservedShortcut,
  isValidStoredShortcut,
  matchesShortcut,
  modifiersFromEvent,
  normalizeShortcut,
  parseShortcut,
  shortcutFromEvent,
  shortcutFromEventAndHeld,
  shortcutRejectReason
} from '../src/shortcut.js'

function keyEvent(code: string, modifiers: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}, key = code): { code: string; key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean } {
  return {
    code,
    key,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
    metaKey: modifiers.meta ?? false
  }
}

describe('shortcut parse and normalize', () => {
  it('parses canonical chords and rebuilds canonical order', () => {
    expect(parseShortcut('ctrl+shift+space')).toEqual({ modifiers: ['ctrl', 'shift'], key: 'space' })
    expect(parseShortcut('shift+ctrl+space')).toEqual({ modifiers: ['shift', 'ctrl'], key: 'space' })
    expect(normalizeShortcut('shift+ctrl+space')).toBe('ctrl+shift+space')
    expect(normalizeShortcut('meta+alt+f9')).toBe('alt+meta+f9')
  })

  it('rejects malformed chords', () => {
    expect(parseShortcut('')).toBeNull()
    expect(parseShortcut('ctrl+')).toEqual({ modifiers: ['ctrl'], key: '' })
    expect(parseShortcut('ctrl+shift')).toEqual({ modifiers: ['ctrl', 'shift'], key: '' })
    expect(normalizeShortcut('shift+ctrl')).toBe('ctrl+shift')
    expect(parseShortcut('ctrl+unknown-key')).toBeNull()
    expect(parseShortcut('f13')).toBeNull()
    expect(parseShortcut('ctrl+ctrl+space')).toEqual({ modifiers: ['ctrl'], key: 'space' })
  })

  it('treats non-string input as malformed (mid-deploy host/client skew guard)', () => {
    expect(parseShortcut(undefined as unknown as string)).toBeNull()
    expect(shortcutRejectReason(undefined as unknown as string)).toBe('invalid')
    expect(isValidStoredShortcut(undefined as unknown as string)).toBe(false)
    expect(matchesShortcut(undefined as unknown as string, keyEvent('Space'))).toBe(false)
  })
})

describe('shortcut rejection rules', () => {
  it('accepts the default and function-key chords', () => {
    expect(shortcutRejectReason('ctrl+shift+space')).toBeNull()
    expect(isValidStoredShortcut('ctrl+shift+space')).toBe(true)
    expect(shortcutRejectReason('f9')).toBeNull()
    expect(shortcutRejectReason('ctrl+backquote')).toBeNull()
    expect(shortcutRejectReason('ctrl+alt+shift+semicolon')).toBeNull()
  })

  it('accepts modifier-only chords and rejects malformed ones', () => {
    expect(shortcutRejectReason('ctrl')).toBeNull()
    expect(shortcutRejectReason('shift+meta')).toBeNull()
    expect(isValidStoredShortcut('alt')).toBe(true)
    expect(shortcutRejectReason('')).toBe('invalid')
    expect(shortcutRejectReason('ctrl+unknown-key')).toBe('invalid')
    expect(shortcutRejectReason('ctrl+shift+space'.repeat(10))).toBe('invalid')
  })

  it('rejects bare and Alt/Option letters and digits but accepts Ctrl/Shift/Meta with them', () => {
    expect(shortcutRejectReason('a')).toBe('typing-key')
    expect(shortcutRejectReason('1')).toBe('typing-key')
    expect(shortcutRejectReason('alt+a')).toBe('typing-key')
    expect(shortcutRejectReason('ctrl+alt+a')).toBe('typing-key')
    expect(shortcutRejectReason('ctrl+a')).toBeNull()
    expect(shortcutRejectReason('ctrl+shift+s')).toBeNull()
    expect(shortcutRejectReason('ctrl+shift+a')).toBeNull()
    expect(shortcutRejectReason('meta+1')).toBeNull()
    expect(shortcutRejectReason('ctrl+shift+f5')).toBeNull()
  })

  it('rejects bare text-action and punctuation keys but allows them with modifiers', () => {
    expect(shortcutRejectReason('space')).toBe('typing-key')
    expect(shortcutRejectReason('enter')).toBe('typing-key')
    expect(shortcutRejectReason('semicolon')).toBe('typing-key')
    expect(shortcutRejectReason('arrowright')).toBe('typing-key')
    expect(shortcutRejectReason('ctrl+space')).toBeNull()
    expect(shortcutRejectReason('ctrl+enter')).toBeNull()
    expect(shortcutRejectReason('ctrl+semicolon')).toBeNull()
  })
})

describe('reserved shortcut warnings', () => {
  it('warns for browser and OS reserved chords but keeps them valid', () => {
    expect(isReservedShortcut('f5')).toBe(true)
    expect(isReservedShortcut('ctrl+space')).toBe(true)
    expect(isReservedShortcut('alt+space')).toBe(true)
    expect(isReservedShortcut('alt+tab')).toBe(true)
    expect(isReservedShortcut('ctrl+tab')).toBe(true)
    expect(isReservedShortcut('meta+space')).toBe(true)
    expect(isReservedShortcut('ctrl+enter')).toBe(true)
    expect(isReservedShortcut('ctrl+a')).toBe(true)
    expect(isReservedShortcut('ctrl+1')).toBe(true)
    expect(isReservedShortcut('meta+c')).toBe(true)
    expect(isReservedShortcut('ctrl+shift+t')).toBe(true)
    expect(isReservedShortcut('meta+shift+n')).toBe(true)
  })

  it('does not warn for the default or ordinary chords', () => {
    expect(isReservedShortcut('ctrl+shift+space')).toBe(false)
    expect(isReservedShortcut('f9')).toBe(false)
    expect(isReservedShortcut('ctrl+backquote')).toBe(false)
    expect(isReservedShortcut('ctrl+alt+semicolon')).toBe(false)
    expect(isReservedShortcut('ctrl+shift+a')).toBe(false)
    expect(isReservedShortcut('alt')).toBe(true)
    expect(isReservedShortcut('meta')).toBe(true)
    expect(isReservedShortcut('ctrl')).toBe(false)
    expect(isReservedShortcut('ctrl+shift')).toBe(false)
  })
})

describe('shortcut matching from events', () => {
  it('matches strict modifier equality against KeyboardEvent fields', () => {
    expect(matchesShortcut('ctrl+shift+space', keyEvent('Space', { ctrl: true, shift: true }))).toBe(true)
    expect(matchesShortcut('ctrl+shift+space', keyEvent('Space', { ctrl: true, shift: true, alt: true }))).toBe(false)
    expect(matchesShortcut('ctrl+shift+space', keyEvent('Space', { ctrl: true }))).toBe(false)
    expect(matchesShortcut('f9', keyEvent('F9'))).toBe(true)
    expect(matchesShortcut('f9', keyEvent('F9', { shift: true }))).toBe(false)
    expect(matchesShortcut('ctrl+semicolon', keyEvent('Semicolon', { ctrl: true }))).toBe(true)
    expect(matchesShortcut('ctrl+shift+space', keyEvent('KeyS', { ctrl: true, shift: true }))).toBe(false)
    expect(matchesShortcut('ctrl', keyEvent('ControlLeft', { ctrl: true }, 'Control'))).toBe(true)
    expect(matchesShortcut('ctrl+shift', keyEvent('ShiftLeft', { ctrl: true, shift: true }, 'Shift'))).toBe(true)
    expect(matchesShortcut('ctrl', keyEvent('KeyA', { ctrl: true }))).toBe(false)
    expect(matchesShortcut('ctrl+shift', keyEvent('ControlLeft', { ctrl: true }, 'Control'))).toBe(false)
  })

  it('matches by physical code rather than layout-dependent key labels', () => {
    expect(matchesShortcut('ctrl+semicolon', keyEvent('Semicolon', { ctrl: true }, 'ö'))).toBe(true)
  })

  it('builds canonical chords from capture events', () => {
    expect(shortcutFromEvent(keyEvent('Space', { ctrl: true, shift: true }))).toBe('ctrl+shift+space')
    expect(shortcutFromEvent(keyEvent('F9'))).toBe('f9')
    expect(shortcutFromEvent(keyEvent('KeyA', { meta: true }))).toBe('meta+a')
    expect(shortcutFromEvent(keyEvent('Unmapped'))).toBeNull()
    expect(shortcutFromEvent(keyEvent('Shift', { shift: true }, 'Shift'))).toBeNull()
  })

  it('keeps Control on macOS events that omit ctrlKey', () => {
    const controlDown = { ...keyEvent('ControlLeft', {}, 'Control'), ctrlKey: false }
    expect(modifiersFromEvent(controlDown, true)).toEqual(['ctrl'])
    expect(modifiersFromEvent(controlDown, false)).toEqual([])

    const spaceWithoutCtrlFlag = {
      ...keyEvent('Space', {}, ' '),
      ctrlKey: false,
      getModifierState: (name: string) => name === 'Control'
    }
    expect(shortcutFromEvent(spaceWithoutCtrlFlag)).toBe('ctrl+space')
    expect(shortcutFromEventAndHeld(keyEvent('Space'), ['ctrl'])).toBe('ctrl+space')
    expect(matchesShortcut('ctrl+space', spaceWithoutCtrlFlag)).toBe(true)
    expect(matchesShortcut('ctrl', controlDown)).toBe(true)
  })

  it('identifies modifier key presses and extracts active modifiers', () => {
    expect(isModifierKeyEvent(keyEvent('Control', {}, 'Control'))).toBe(true)
    expect(isModifierKeyEvent(keyEvent('Shift', { shift: true }, 'Shift'))).toBe(true)
    expect(isModifierKeyEvent(keyEvent('Meta', { meta: true }, 'Meta'))).toBe(true)
    expect(isModifierKeyEvent(keyEvent('KeyA'))).toBe(false)
    expect(isModifierKeyEvent(keyEvent('F9'))).toBe(false)

    expect(modifiersFromEvent(keyEvent('Space', { ctrl: true, shift: true }))).toEqual(['ctrl', 'shift'])
    expect(modifiersFromEvent(keyEvent('Space', { meta: true, alt: true }))).toEqual(['alt', 'meta'])
    expect(modifiersFromEvent(keyEvent('Space'))).toEqual([])
  })

  it('formats live modifier feedback in canonical order', () => {
    expect(formatModifierChord(['ctrl', 'shift'], 'win')).toBe('Ctrl+Shift')
    expect(formatModifierChord(['ctrl', 'shift'], 'linux')).toBe('Ctrl+Shift')
    expect(formatModifierChord(['ctrl', 'shift'], 'mac')).toBe('⌃⇧')
    expect(formatModifierChord(['alt', 'meta'], 'mac')).toBe('⌥⌘')
    expect(formatModifierChord([], 'win')).toBe('')
  })
})

describe('shortcut display formatting', () => {
  it('formats chords for each platform', () => {
    expect(formatShortcut('ctrl+shift+space', 'mac')).toBe('⌃⇧Space')
    expect(formatShortcut('ctrl+shift+space', 'win')).toBe('Ctrl+Shift+Space')
    expect(formatShortcut('ctrl+shift+space', 'linux')).toBe('Ctrl+Shift+Space')
    expect(formatShortcut('meta+semicolon', 'mac')).toBe('⌘;')
    expect(formatShortcut('f9', 'win')).toBe('F9')
    expect(formatShortcut('ctrl+alt+backquote', 'linux')).toBe('Ctrl+Alt+`')
    expect(formatShortcut('meta+arrowleft', 'mac')).toBe('⌘←')
    expect(formatShortcut('ctrl', 'win')).toBe('Ctrl')
    expect(formatShortcut('ctrl+shift', 'mac')).toBe('⌃⇧')
  })

  it('falls back to the raw value for malformed chords', () => {
    expect(formatShortcut('not-a-chord', 'win')).toBe('not-a-chord')
  })
})