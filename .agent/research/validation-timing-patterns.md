# Validation Timing & Messaging Patterns — Primary-Source Research

> ADR evidence for D-024. Not a live product spec. See [`../decisions.md`](../decisions.md).

Research backing the dsh-ears settings-page decision to move from a unified
cross-field validity check to **validate-only-the-edited-field** timing, and to
show prompts **only for real problems** (invalid input or genuine failures),
never for "not yet configured" state.

Sources are primary: official component docs, reference documentation, and
source repositories. Every claim links to the exact page/section.

---

## 1. Validation trigger timing — when do libraries validate & surface errors?

**Ant Design Form** (`<Form>` + `<Form.Item>`)

- `validateTrigger` defaults to **`onChange`** at both the Form and Form.Item
  level: "Config field validate trigger" / "Set validate trigger event."
  ([API table](https://ant.design/components/form/#api) →
  [validateTrigger](https://ant.design/components/form/#formitem)).
- Validation is **timed/rate-limited**, not immediate per keystroke, by
  `validateDebounce` ("Delay milliseconds to start validation") and short-circuited
  by `validateFirst` ("Whether stop validate on first rule of error for this
  field").
  ([API](https://ant.design/components/form/#form)).
- The docs explicitly warn that onChange validation can cause load: "For the
  async validation scenario, high frequency of verification will cause backend
  pressure. You can change the verification timing through `validateTrigger`, or
  change the verification frequency through `validateDebounce`, or set the
  verification short circuit through `validateFirst`."
  ([Validate Trigger demo](https://ant.design/components/form/#validate-trigger)).

**Arco Design Form**

- `validateTrigger` defaults to **`onChange`** at both levels; `Form.Item`:
  "When to trigger verification… When passed as `[]`, the validation rules will
  only be executed when the form `validate` method is called."
  ([Form API](https://arco.design/react/components/form#form) /
  [Form.Item API](https://arco.design/react/components/form#formitem), mirroring
  the source
  [README.en-US.md](https://github.com/arco-design/arco-design/blob/master/components/Form/README.en-US.md)).

**Material Design 3** (`material-web` text field, primary reference source)

- Validation is **submission-gated by default**: "Text fields in a `<form>` will
  validate on submission, or by calling `textField.reportValidity()`."
  Manual validation is the alternative: "text fields can manually control their
  error state and error message. Use manual validation if the text fields are
  driven by application state logic."
  ([MD text field — Validation](https://github.com/material-components/material-web/blob/main/docs/components/text-field.md)).

**GOV.UK Design System** — the strongest explicit anti-on-blur stance:

- "**Do not validate when the user moves away from a field. Wait until they try
  to move to the next part of the service** – usually by clicking the 'continue'
  or 'submit' button at the bottom of the page."
- "Generally speaking, **avoid validating the information in a field before the
  user has finished entering it**. This sort of validation can cause problems –
  especially for users who type more slowly." A documented exception is the
  Character count component, which errors mid-typing because "it's important
  that users do not spend time and effort writing out a response that turns out
  to be too long."
  ([Recover from validation errors](https://design-system.service.gov.uk/patterns/validation/)).

**Apple Human Interface Guidelines**

- Settings is a dedicated, live-editing scene: SwiftUI `Settings` is "A scene
  that presents an interface for viewing and modifying an app's settings."
  ([SwiftUI Settings](https://developer.apple.com/documentation/swiftui/settings)).
  HIG settings opening line: "People expect apps and games to just work, but
  they also appreciate having ways to customize the experience to fit their
  needs." ([Settings](https://developer.apple.com/design/human-interface-guidelines/settings)).
  Settings UIs apply changes immediately rather than through a submit round-trip
  (see §4).

**Microsoft Fluent UI v9** (`Field`)

- Deliberately **does not trigger validation itself**: "Field does not do
  validation itself, but can be used to report the result of form validation."
  Timing is left to the app. It only provides a `validationMessage` +
  `validationState` surface for app-triggered results.
  ([Field.types.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-field/library/src/components/Field/Field.types.ts) /
  [ValidationMessage story](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-field/stories/src/Field/FieldValidationMessage.stories.tsx)).

**Cross-library confirmation (Flutter)**

- `Form`/`TextFormField.autovalidateMode` enumerates the three canonical
  timings: `disabled` ("No auto validation will occur"), `always`
  ("auto-validate Form and… even without user interaction"), and
  `onUserInteraction` ("auto-validate… after user interaction").
  ([AutovalidateMode](https://api.flutter.dev/flutter/widgets/AutovalidateMode.html)).

**Net takeaway:** mainstream systems converge on three modes — *on change*
(Ant/Arco/Flutter `onUserInteraction`), *on submit* (GOV.UK, Material default),
and *app-manual* (Fluent). No primary source recommends pure on-blur; GOV.UK
explicitly rejects it.

---

## 2. Touched / dirty semantics — avoid erroring on never-edited fields

- **Ant Design** tracks per-field `touched` ("Whether is operated") in
  `FieldData`, exposes `isFieldTouched` / `isFieldsTouched` ("Check if a field
  has been operated"), and `validateFields` supports a `dirty` config:
  "Validate **dirty fields (touched + validated)**… useful to validate fields
  only when they are touched or validated."
  ([FormInstance](https://ant.design/components/form/#forminstance) /
  [ValidateConfig](https://ant.design/components/form/#validatefields)).
- **Arco Design** exposes `getTouchedFields()` ("Get the touched field") on
  `FormInstance`.
  ([FormInstance](https://arco.design/react/components/form#forminstance)).
- **VS Code Settings editor** uses a dirty marker rather than validation: "You
  can identify settings that you modified by the colored bar on the left of the
  setting, similar to modified lines in the editor," plus a `@modified` filter
  that lists settings whose value "differs from the default value, or if its
  value is explicitly set."
  ([VS Code — Settings editor](https://code.visualstudio.com/docs/getstarted/settings)).
- **GOV.UK** avoids the concept of "touched" for erroring because it validates
  only at the submit/continue boundary (§1); before that boundary nothing shows.

**Net takeaway:** explicit touched/dirty tracking is the standard mechanism to
guarantee "no error until the user has actually interacted." For our page, a
per-field `touched`/`edited` flag (only set by the `edit()` action) is the
direct analog to Ant's `touched` + `dirty` validate, applied to per-field
validation.

---

## 3. Conditionally-required fields & progressive disclosure

**Ant Design** — conditionally-required sub-groups:

- `dependencies`: "Set the dependency field… After setting `dependencies` the …
  field update will re-trigger the validation." Rules can be expressed as a
  function of `form`, enabling "required only when master is on" dynamic rules.
  ([Form.Item dependencies](https://ant.design/components/form/#formitem) →
  [dynamic rule demo](https://ant.design/components/form/#dynamic-rule) and
  [form dependencies demo](https://ant.design/components/form/#form-dependencies)).
- `shouldUpdate` re-renders a field when *other* fields change ("Custom field
  update logic"), used for progressive disclosure; the docs note `dependencies`
  and `shouldUpdate` "shouldn't be used together… may result in conflicting
  update logic."
  ([Form.Item](https://ant.design/components/form/#formitem)).

**Arco Design** — same two-API split:

- `dependencies`: "the dependency fields. When the value of the dependent field
  changes, trigger its own validation. If you want to dynamically render a form
  control/form area, use `shouldUpdate`."
  ([Form.Item](https://arco.design/react/components/form#formitem)).

**GOV.UK** — conditional reveals: the Radios/Checkboxes `conditional` option
adds "additional content to reveal when the radio is checked." Revealed content
carries no error styling of its own; validation (if the revealed field is
required) only happens at the submit boundary like any other field.
([Radios — conditional](https://design-system.service.gov.uk/components/radios/)).

**VS Code Settings editor** — the closest product analogue to our page:

- Fields are validated **individually and only where edited**; editing
  `settings.json` gives "structural and value verification based on an
  associated JSON schema giving you **red squiggles**" — a per-field marker, no
  global banner. Invalid-but-trailing-comma JSON is downgraded to a *warning*
  ("the editor will display a warning"), and inline-edit setting values keep the
  typed draft visible while the squiggle marks it.
  ([VS Code — JSON editing](https://code.visualstudio.com/docs/languages/json)).
- VS Code's own Settings editor shows nothing problematic for an enabled
  feature whose sub-settings are unset; unset sub-fields simply fall back to
  defaults, and the editor never renders an error for "not yet configured."

**How incomplete state is rendered across these:**

| Source | Incomplete required sub-group | Rendered as |
|---|---|---|
| Ant `dependencies` + required rule | error only when the rule is *active* and the field was validated | error (field) |
| GOV.UK conditional reveal | nothing until submit; then error | nothing → error |
| VS Code settings editor | nothing; falls back to default; edited invalid → squiggle | nothing (or per-field squiggle) |

**Net takeaway:** progressive disclosure pairs with *deferred, conditional*
validation. The master control *activates* sub-field requirements, but the
incomplete sub-group is not styled as an error until the user actually edits a
sub-field or attempts to use the feature. An "enabled but incomplete" state is
legitimately surfaced as a **neutral hint or amber warning**, not a red error —
matching our existing `incomplete` (not `invalid`) distinction.

---

## 4. Auto-saving settings UIs without a submit button — invalid drafts

**VS Code Settings editor** (the canonical auto-save settings surface):

- "VS Code **applies changes to settings directly as you change them**." The
  dirty ("colored bar") marker coexists with live application; there is no
  submit button.
  ([VS Code — Settings editor](https://code.visualstudio.com/docs/getstarted/settings)).
- Invalid values: the draft is **kept and shown**, marked with a per-field red
  squiggle (schema validation), and non-structural issues are surfaced as
  warnings, not errors (§3). Invalid input never blocks other, valid settings
  from applying.

**Apple HIG / system Settings:**

- SwiftUI `Settings` is a scene for "viewing and modifying an app's settings"
  ([docs](https://developer.apple.com/documentation/swiftui/settings)); Apple's
  settings model is immediate-apply with no global submit. HIG's positioning —
  "People expect apps and games to just work" — cautions against adding friction
  (e.g. error banners) to settings.
  ([Settings](https://developer.apple.com/design/human-interface-guidelines/settings)).

**GOV.UK** (submit-less caution, relevant constraint): GOV.UK itself has no
submit-free settings form; its guidance that validation should happen only when
the user "move[s] to the next part of the service" implies that a submit-less
auto-save UI must find a substitute "commit" moment. In auto-save UIs that
moment is the debounced save (or focus-out), not global re-validation.

**Net takeaway:** auto-save UIs keep the invalid draft visible and mark it
per-field, never refuse to render it, and never let one bad field stall the
other fields (our controller already does this — invalid drafts are skipped per
field). The "commit" moment substitutes for submit: validation fires on that
field's edit/save, not as a whole-form sweep.

---

## 5. Error vs. warning semantics — red vs. amber

**Microsoft Fluent UI `validationState`** (most explicit four-way model):

- `error` (default): "red error icon and red text, with `role="alert"` so it is
  announced by screen readers… Additionally, the control inside the field has
  `aria-invalid` set, which adds a red border."
- `warning`: "yellow exclamation icon and **gray text**, with `role="alert"`."
- `success`: green checkmark icon, gray text. `none`: gray text, no icon.
  ([Field.types.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-field/library/src/components/Field/Field.types.ts)).

**Ant Design** — `validateStatus`: `success | warning | error | validating`;
rules support `warningOnly` ("Warning only. Not block form submit"), cleanly
separating *blocking* errors from *non-blocking* warnings.
([Form.Item](https://ant.design/components/form/#formitem) /
[Rule](https://ant.design/components/form/#rule)).

**Arco Design** — `validateLevel: 'error' | 'warning'` per rule: "When the
verification fails, the error message will be displayed in the form of `error`
or `warning`. **Will not block form submission when set to `warning`**."
([Rules](https://arco.design/react/components/form#rules)).

**Material Design 3** — error is a first-class color *role* with a paired
container: `error` / `on-error` and `error-container` / `on-error-container`.
Component tokens map error styling to `?attr/colorError`
(`boxStrokeErrorColor`, `errorTextColor`, `errorIconTint`, `cursorErrorColor`);
error text **replaces** supporting/helper text when set ("Non-null error text
will replace any existing helper text").
([M3 color roles](https://m3.material.io/styles/color/roles);
[MD Android TextField](https://github.com/material-components/material-components-android/blob/master/docs/components/TextField.md);
[MD text field](https://github.com/material-components/material-web/blob/main/docs/components/text-field.md)).

**GOV.UK** — warning text is *not* for validation: the Warning text component
is "when you need to warn users about something important, such as legal
consequences of an action." Validation errors use the **Error message** /
**Error summary** components instead; never reuse warning text for a field
error. ([Warning text](https://design-system.service.gov.uk/components/warning-text/);
[Error message](https://design-system.service.gov.uk/components/error-message/);
[Recover from validation errors](https://design-system.service.gov.uk/patterns/validation/)).

**Net takeaway:** red `error` = "invalid/blocking, `role="alert"`, `aria-invalid`";
amber/yellow `warning` = "non-blocking guidance/attention"; and a **neutral
state** (Fluent `none`, Material supporting-text, our `incomplete`) exists for
"guidance about configuration" that must not be red. This maps directly onto our
existing red `invalid` vs. amber `incomplete` (`--dsw-alias-state-warn-label`)
split — the research endorses keeping `incomplete` **non-red and without**
`role="alert"`.

---

## 6. Distilled actionable patterns for our settings page

1. **Per-field validate-on-edit (consistent timing).** Validate and surface an
   error for *only* the field the user just edited (`edit()` sets a per-field
   `touched` flag and re-checks that field), not a cross-field sweep. Matches
   Ant/Arco `validateTrigger: onChange` at the field scope and VS Code's
   per-field squiggle. (Ant [`validateTrigger`](https://ant.design/components/form/#formitem);
   [VS Code JSON](https://code.visualstudio.com/docs/languages/json).)

2. **Touched/dirty gating for zero-false-positives.** A field shows an error (or
   an incomplete hint) **only if the user has interacted with it**. Mirror Ant's
   `touched` + `dirty` validate and VS Code's "colored bar" dirty marker. This
   is what prevents errors on fields the user never opened.
   ([Ant FormInstance](https://ant.design/components/form/#forminstance);
   [VS Code Settings editor](https://code.visualstudio.com/docs/getstarted/settings).)

3. **Debounce the *validation*, not just the save.** Keep the existing 400 ms
   save debounce, and validate per-field on that same cadence (Ant's
   `validateDebounce`). Do not fire async validation on every keystroke.
   ([Ant validateTrigger demo](https://ant.design/components/form/#validate-trigger).)

4. **Conditional-required = activate on master-on, but never error the empty
   sub-group until edited.** When the polishing toggle is enabled, the
   provider/model pair becomes *required only in the save path*; the visible
   sub-fields stay **neutral/amber "not yet configured"** until the user edits
   one and leaves it invalid. This encodes Ant's `dependencies` + dynamic-rule
   idea without showing red for a fresh, untouched reveal.
   ([Ant dynamic rule](https://ant.design/components/form/#dynamic-rule);
   [GOV.UK conditional](https://design-system.service.gov.uk/components/radios/).)

5. **`incomplete` ≠ `invalid`; keep incomplete non-red and non-alert.** Use red
   + `role="alert"` + `aria-invalid` **only** for genuine invalid input or real
   save failures; render "enabled but not configured" as the neutral/amber
   state. This is Fluent's `none`/`warning` split, Material's supporting-text →
   error replacement, and GOV.UK's "warning text is not for validation."
   ([Fluent Field](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-field/library/src/components/Field/Field.types.ts);
   [GOV.UK warning text](https://design-system.service.gov.uk/components/warning-text/).)

6. **Auto-save keeps the invalid draft, marks it locally, and never stalls
   siblings.** Persist the invalid value into the visible draft, show the
   per-field marker, and continue saving the other (valid) fields. This is what
   VS Code's immediate-apply + red-squiggle and our existing per-field skip
   already do; preserve it.
   ([VS Code Settings editor](https://code.visualstudio.com/docs/getstarted/settings).)

7. **No global "some fields are incomplete" banner.** Per the VS Code settings
   analogue, surface problems only where they are — on the edited field — never
   a page-level summary for "not yet configured" states. A page-level error
   summary is reserved for genuine failure (the load-failure notice), and even
   that is amber, matching GOV.UK's error-summary-only-on-real-errors principle.
   ([VS Code Settings editor](https://code.visualstudio.com/docs/getstarted/settings);
   [GOV.UK error summary](https://design-system.service.gov.uk/components/error-summary/).)

8. **Reserve the "commit moment" for save-side cross-field gating.** The
   debounced save is the auto-save equivalent of "submit": that is where the
   cross-field rule (polishing-enabled ⇒ provider+model) is *enforced* (skip the
   partial pair), while the *visible* error styling stays field-scoped and
   touched-gated. This separates "block the save" from "shout at the user."
   ([GOV.UK validation](https://design-system.service.gov.uk/patterns/validation/);
   [Flutter AutovalidateMode](https://api.flutter.dev/flutter/widgets/AutovalidateMode.html).)
