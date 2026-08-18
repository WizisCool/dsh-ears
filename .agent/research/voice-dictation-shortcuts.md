# Voice and Dictation Shortcuts Research

> ADR evidence for D-028. Not a live product spec. The shipped default is `Ctrl+Shift+Space`; modifier-only chords are valid. See [`../decisions.md`](../decisions.md).

**Scope.** This note surveys in-page voice/dictation shortcuts, native OS defaults, global-hotkey voice applications, shortcut-recorder UI precedents, `hotkeys-js`/Mousetrap adoption and maintenance, and single-/two-key web voice precedents. Primary sources are preferred. Claims that could not be verified from a first-party source are marked **Unverifiable/secondary**.

## Executive findings

1. A web page can observe keyboard events only while it has focus and while the browser permits the event; `keydown`/`keyup` expose key identity and modifier state, but a web app cannot reliably claim an OS-wide shortcut. [MDN `KeyboardEvent`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent), [W3C UI Events](https://www.w3.org/TR/uievents/)
2. Native dictation defaults are OS-level and differ by platform: macOS starts Dictation with the configured shortcut (commonly a Function/Globe-key action), Windows voice typing uses `Win+H`, and ChromeOS dictation uses the Search/Launcher + `D` shortcut. [Apple Dictation](https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac), [Microsoft voice typing](https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-597f3a1d-84a7-4f11-9e8d-9d2f6f2e4f6f), [Google Chromebook accessibility shortcuts](https://support.google.com/chromebook/answer/6076237)
3. Global-hotkey voice products are desktop applications or browser extensions with OS integration, not ordinary in-page JavaScript. Wispr Flow documents supported/unsupported combinations, while Raycast documents a dedicated hotkey recorder. [Wispr supported shortcuts](https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts), [Raycast hotkey recorder](https://www.raycast.com/changelog/windows/0-33)
4. The strongest UI precedent is a recorder field that enters capture mode, displays the normalized chord, and lets the user clear/re-record; Raycast explicitly calls its feature a “Hotkey Recorder.” [Raycast hotkey recorder](https://www.raycast.com/changelog/windows/0-33), [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
5. `hotkeys-js` and Mousetrap are established open-source libraries, but their repositories should not be treated as proof of active maintenance or suitability without checking release activity and browser behavior. [hotkeys-js repository](https://github.com/jaywcjlove/hotkeys-js), [hotkeys-js npm](https://www.npmjs.com/package/hotkeys-js), [Mousetrap repository](https://github.com/ccampbell/mousetrap), [Mousetrap npm](https://www.npmjs.com/package/mousetrap)
6. There is little high-confidence primary-source evidence that mainstream web voice products intentionally reserve an unmodified single key for dictation. Browser shortcuts, typing, screen-reader commands, IMEs, and accessibility interactions make a single letter unsafe. A two-key chord or modifier-held push-to-talk is the defensible web precedent. **Unverifiable/secondary:** marketing pages and community examples often claim single-key voice behavior, but those claims were not confirmed against a maintained first-party product specification.

## 1. In-page voice/dictation shortcuts

### Browser event boundary

`KeyboardEvent.key`, `code`, `ctrlKey`, `metaKey`, `altKey`, and `shiftKey` are available to page event handlers; `keydown` is the normal place to intercept a shortcut, and `preventDefault()` can suppress the page's default action when the event is cancelable. [MDN `KeyboardEvent`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent), [MDN `keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event), [MDN `preventDefault`](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault)

The UI Events specification defines keyboard event dispatch and modifier-key semantics, but it does not grant a page global OS keyboard access. [W3C UI Events](https://www.w3.org/TR/uievents/)

The Web Speech API provides browser speech recognition interfaces, but support is browser-dependent and recognition may use a browser/vendor service; the API itself is not a global-hotkey facility. [W3C Web Speech API Community Group report](https://wicg.github.io/speech-api/), [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

### Practical in-page policy

- Bind only when the page is active and the document has focus; ignore events from editable controls unless the product explicitly chooses a push-to-talk policy. This follows the browser event model and avoids hijacking normal text entry. [MDN `keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event)
- Prefer a modifier chord (`Alt/Option`, `Ctrl`, or `Meta` plus a letter) or a two-key sequence over a bare letter. This is a product recommendation based on the collision surface, not a browser requirement. **Inference from primary event/accessibility constraints.** [W3C UI Events](https://www.w3.org/TR/uievents/), [MDN Keyboard accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard)
- Show the effective shortcut in the UI and provide a disable/clear path. This is a usability recommendation, supported by recorder precedents rather than a web standard. [Raycast hotkey recorder](https://www.raycast.com/changelog/windows/0-33)

## 2. Native OS defaults

### macOS

Apple documents Dictation as a system feature whose keyboard shortcut is configurable in Keyboard settings; the shortcut is commonly invoked via the Function/Globe key depending on the Mac and settings. [Apple: Dictate messages and documents on Mac](https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac), [Apple: Change Keyboard settings](https://support.apple.com/guide/mac-help/change-keyboard-settings-mchlp2725/mac)

**Implementation implication:** avoid claiming the same key is free in a web page, especially Function/Globe and modifier combinations users may have assigned to macOS services. **Inference.** [Apple Dictation](https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac)

### Windows

Microsoft documents voice typing as launched with `Windows logo key + H`. [Microsoft: Use voice typing to talk instead of type](https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-597f3a1d-84a7-4f11-9e8d-9d2f6f2e4f6f)

**Implementation implication:** do not reuse `Win+H` as a web shortcut; a browser page generally will not receive it as an ordinary page-level event and Windows owns the gesture. **Inference.** [Microsoft voice typing](https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-597f3a1d-84a7-4f11-9e8d-9d2f6f2e4f6f)

### ChromeOS

Google documents ChromeOS dictation and its accessibility keyboard shortcut in the Chromebook shortcut list. [Google Chromebook keyboard shortcuts](https://support.google.com/chromebook/answer/6076237)

**Unverifiable/secondary:** exact behavior and labels can vary by ChromeOS release, device keyboard, and accessibility settings; verify on target builds before documenting a fixed default.

## 3. Global-hotkey voice applications

Electron's `globalShortcut` API registers shortcuts even when the application does not have keyboard focus, subject to OS availability and registration conflicts. [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)

Wispr Flow publishes a support table for keyboard combinations and explicitly distinguishes supported and unsupported shortcuts. [Wispr Flow: Supported & Unsupported Keyboard Hotkey Shortcuts](https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts)

Raycast documents a Hotkey Recorder in its product changelog, establishing a direct precedent for a user-configurable recorder rather than a hidden hard-coded shortcut. [Raycast Windows 0.33 changelog](https://www.raycast.com/changelog/windows/0-33)

**Unverifiable/secondary:** third-party comparison pages frequently list Superwhisper, MacWhisper, and similar apps as global-hotkey dictation tools, but product behavior and defaults change; use the vendors' current settings/help pages before relying on a specific default. A search result for Superwhisper/Wispr setup is not sufficient evidence of a universal default. [Wispr support](https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts)

## 4. Shortcut recorder UI precedents

Raycast's official changelog names a “Hotkey Recorder,” which supports the pattern of a dedicated control for recording a chord. [Raycast hotkey recorder](https://www.raycast.com/changelog/windows/0-33)

For desktop implementations, Electron separates global registration from UI and reports whether registration succeeded; this supports showing conflicts/failure rather than silently accepting a shortcut. [Electron `globalShortcut.register`](https://www.electronjs.org/docs/latest/api/global-shortcut#globalshortcutregisteraccelerator-callback), [Electron `isRegistered`](https://www.electronjs.org/docs/latest/api/global-shortcut#globalshortcutisregisteredaccelerator)

Recommended recorder states (product synthesis): **Idle → Recording (“Press keys…”) → Captured (normalized chord + Clear) → Conflict/Unavailable**. The first three states are directly analogous to Raycast's recorder precedent; the conflict state follows Electron's registration result. **Inference, not a claimed copy of Raycast UI.**

Web recorder constraints: capture `keydown`, normalize modifier order, ignore auto-repeat, prevent browser defaults only while recording, and provide Escape to cancel. These are implementation recommendations derived from [MDN keyboard events](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event) and [W3C UI Events](https://www.w3.org/TR/uievents/).

## 5. `hotkeys-js` and Mousetrap: adoption and maintenance

`hotkeys-js` is a small browser keyboard-shortcut library with a GitHub source repository and npm distribution. Its documented API includes binding combinations and handling scopes. [GitHub `hotkeys-js`](https://github.com/jaywcjlove/hotkeys-js), [npm `hotkeys-js`](https://www.npmjs.com/package/hotkeys-js)

Mousetrap is a browser keyboard shortcut library whose repository documents combination binding, sequences, and pause/stop behavior. [GitHub Mousetrap](https://github.com/ccampbell/mousetrap), [Mousetrap npm](https://www.npmjs.com/package/mousetrap)

**Maintenance assessment:** repository existence, npm publication, and README/API documentation are verifiable; “actively maintained,” “production-ready,” or “widely adopted” require time-bounded release/download data and should not be asserted from popularity alone. **Unverifiable/secondary unless independently measured:** adopter counts and current maintenance quality.

Neither library can provide an OS-global hotkey in a normal web page; they are page-level event abstractions. Global registration requires a privileged desktop/runtime API such as Electron's `globalShortcut`. [hotkeys-js](https://github.com/jaywcjlove/hotkeys-js), [Mousetrap](https://github.com/ccampbell/mousetrap), [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)

## 6. Single-key and two-key web voice precedent

A bare single letter is unsafe for a text composer because it collides with ordinary typing, browser/site shortcuts, IME composition, and assistive technology. The web platform exposes composition and keyboard events as separate concerns; accessible keyboard guidance recommends predictable keyboard operation rather than hijacking character input. [MDN Keyboard accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard), [MDN `compositionstart`](https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionstart_event), [W3C UI Events](https://www.w3.org/TR/uievents/)

Modifier-plus-letter and modifier-held push-to-talk patterns are therefore the stronger web precedent. This is a design conclusion from the event/accessibility model, not evidence that one specific mainstream web product has a universal voice default. **Inference.** [MDN `keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event), [W3C UI Events](https://www.w3.org/TR/uievents/)

**Unverifiable/secondary:** search results and community posts mention single-key voice triggers in individual products/extensions, but no stable first-party specification was found that establishes a broadly adopted, unmodified single-key web dictation standard. Do not use those examples as normative precedent.

## Decision-oriented recommendations for dsh-ears

1. Keep click-to-start as the primary affordance; add an optional configurable two-key chord or modifier shortcut, not a bare letter. This preserves manual discoverability and avoids text-entry collisions. [MDN `keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event), [MDN Keyboard accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard)
2. Treat the shortcut as in-page only and state that it works when the dsh page is focused; do not call it a global hotkey. [W3C UI Events](https://www.w3.org/TR/uievents/)
3. Exclude native defaults such as macOS Dictation and Windows `Win+H` from the candidate list/documentation. [Apple Dictation](https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac), [Microsoft voice typing](https://support.microsoft.com/en-us/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc-597f3a1d-84a7-4f11-9e8d-9d2f6f2e4f6f)
4. Use a recorder with Idle/Recording/Captured/Clear and explicit conflict/unavailable feedback; normalize display order and allow Escape cancellation. [Raycast hotkey recorder](https://www.raycast.com/changelog/windows/0-33), [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
5. A small custom handler may be preferable to adding a dependency for one shortcut. If a library is adopted, evaluate current release activity and bundle/API fit rather than relying on historical adoption claims. [hotkeys-js](https://github.com/jaywcjlove/hotkeys-js), [Mousetrap](https://github.com/ccampbell/mousetrap)

## Source-quality notes

- **Primary:** Apple, Microsoft, Google, MDN, W3C, Electron, Raycast, Wispr Flow, GitHub repositories, and npm package pages linked above.
- **Unverifiable/secondary:** claims about Superwhisper/MacWhisper defaults, ecosystem adopter counts, and a supposedly standard single-key web voice shortcut. These should be rechecked against current vendor documentation or measured directly before becoming product requirements.
