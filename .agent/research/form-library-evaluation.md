# Form Library Evaluation — dsh-ears Settings

> ADR evidence for D-025, written against the D-024-era controller. Not a live product spec. Current save model is D-031 auto-save; current validation rules are D-024 as revised. See [`../decisions.md`](../decisions.md).

Evaluation of whether a third-party form library would actually simplify the hand-rolled
settings machinery in `src/client/settings-controller.ts` + `src/client/settings.tsx`.

**How the current machinery works** (baseline for every "gain/lose" judgment):

- State lives in a `SnapshotStore<EarsCardState>` + `useSyncExternalStore`. The *same*
  `EarsSettings` store is shared, via `useEarsSettings`, with the composer microphone
  (`context.md` §Settings / §Current hardening invariants) — so field state is consumed by
  more than just this page.
- There is **no submit button**. Every edit calls `Controller.edit()` → a `Map<FieldName,string>`
  of drafts → `scheduleSave()` (400 ms debounce) → `save()` builds a `patch` and awaits
  `remote.updateSettings(patch)`, which returns a validated settings view.
- Validation is **per-field** and split across two functions: `isInvalid(field, text)`
  (immediate, for red hints) and `isInvalidForSave(field, text, staged)` (cross-field, e.g.
  "only reject an empty cloud key/endpoint/model when backend is `cloud-openai`"; "hold the
  polishing pair while incomplete"). Incomplete-but-valid fields are surfaced as *amber*, not
  error (`incomplete` flag), per D-024.
- Fields are dsh custom primitives: `Menu` (non-native pill/portal selector) and `Input`, wired
  through `Controller`'s controlled `text` + `overridden`/`invalid`/`incomplete` flags.
- Async responses (`getWhisperModelState`, `listCloudProviderModels`, `listReasoningEfforts`,
  `listRoutes`, `listAsrBackends`) are guarded by per-call request counters/generation checks.

The working question for every library below: does it *remove* more of this than it *adds*?

---

## 1. react-hook-form

- **Timing model** — `useForm` `mode` is `onChange | onBlur | onSubmit | onTouched | all`
  (default `onSubmit`), plus `reValidateMode` (`onChange | onBlur | onSubmit`, default
  `onChange`) that governs re-validation *after* a failed submit. `onTouched` = validate on the
  first blur, then on every change thereafter. See
  [useForm § mode](https://react-hook-form.com/docs/useform#mode) and
  [§ reValidateMode](https://react-hook-form.com/docs/useform#reValidateMode). Both are reactive
  since v7.56.0.
- **Touched/dirty** — `formState` exposes `touchedFields`, `dirtyFields`, `isDirty`, `isValid`,
  `errors`. "Touched" is set per-field on blur/change; `dirtyFields` marks fields whose value
  differs from `defaultValues`. [formState reference](https://react-hook-form.com/docs/useform/formstate).
- **Custom components** — `Controller` renders any input via `render={({ field }) => …}`,
  passing `onChange`/`onBlur`/`value` yourself. For dsh's `Menu` (a string `id` via `onSelect`)
  and `Input`, this is manual but straightforward.
  [Controller](https://react-hook-form.com/docs/useform/controller).
- **Cross-field interplay** — `watch()`, `setValue()`, and `trigger()` cover dependent fields;
  `trigger(name)` validates one field on demand. [trigger](https://react-hook-form.com/docs/useform/trigger),
  [setValue](https://react-hook-form.com/docs/useform/setvalue).
- **Async validation** — resolver-based (schema) or `validate: async` per registered field;
  async merges into the same error map. Not debounced natively (you debounce yourself).
- **Zod** — via `@hookform/resolvers/zod` ([resolvers repo](https://github.com/react-hook-form/resolvers)).
  Note: dsh-ears deliberately keeps `schemastery` out of the browser bundle and shares plain
  helper functions in `src/config.ts`; introducing zod would add a *new* schema dialect alongside
  the existing hand helpers, not replace them.
- **Bundle size** — **~13.8 kB gzip (39.6 kB min), 0 dependencies** (bundlephobia
  `react-hook-form@7.85.0`); official README markets "small size" + "no dependencies"
  ([README](https://github.com/react-hook-form/react-hook-form#react-hook-form)).
  `@hookform/resolvers` + `zod` would add materially more than the core.

**Fit with this project:** poor. RHF's value is *collecting* field state from **native**
inputs (`register`) and turning a submit event into an `onSubmit` callback. This project has no
submit event, its state lives in an external `useSyncExternalStore` store shared with another
component, and its "submit" is a debounced fire-and-forget RPC inside the store. RHF cannot
*mirror* an external store as its source of truth — it can only be pushed via `setValue`/
`reset`, which means dual-drive duplication (RHF's own internal form state vs the
`SnapshotStore`), and it still needs hand-written per-field + cross-field gating to reproduce
`isInvalidForSave`. Every `Controller` for a `Menu` must re-implement the `draft → edit` path
that already exists. Net: it would add a second state layer without removing the store logic.

---

## 2. TanStack Form

- **Timing model** — per-field `validators` accepted as `onMount`, `onChange`, `onBlur`,
  `onSubmit`, `onDynamic`, each with a `*Async` twin; async is debounced via
  `onChangeAsyncDebounceMs` (built in). Validation is framed per-field with a rich
  `field.state.meta` (`errors`, `isValid`, `isValidating`, `errorMap`). See
  [Validation guide](https://tanstack.com/form/latest/docs/guides/validation) and
  [Field API](https://tanstack.com/form/latest/docs/reference/classes/FieldApi).
- **Touched** — field meta carries `isTouched`, `isDirty`, `isBlurred` per field — comparable to
  RHF/Formik.
- **Headless / custom primitives** — explicitly *headless by design*: the `<Field>` render-prop
  gives you `state.value` / `handleChange` / `handleBlur` to bind **any** UI, including custom
  select/input (shadcn examples prove external-component integration).
  [Headless UI](https://tanstack.com/form/latest/docs/guides/headless-ui).
- **Controlled external values** — supports `defaultValue`/`value` on fields and `setFieldValue`
  programmatically; it owns the field state internally like RHF, so an external
  `useSyncExternalStore` store still has to be pushed in rather than read as the source of
  truth. "Changing an uncontrolled input to be controlled" warnings apply if defaults aren't set
  before render ([debugging guide](https://tanstack.com/form/latest/docs/guides/debugging)).
- **Async validation** — first-class and debounced natively (`onChangeAsyncDebounceMs`), which is
  the *only* library here that would genuinely help the async model-listing/whisper guards —
  but those guards also protect *refresh* polling and *mutations* (download/cancel/delete), which
  no form library models.
- **Bundle size** — not advertised in the README; it ships several packages (core + React +
  adapters), and is the heaviest of the four. No single small number to cite from primary source.

**Fit:** better than RHF on headless/custom-component ergonomics and async debounce, but its
state ownership model still collides with the shared `SnapshotStore`. The page would become a
thick `<Field>` wrapper *around* the existing store rather than replacing it. The
per-field-generation counters in the controller have no direct analog.

---

## 3. Formik

- **Timing** — `validateOnChange` / `validateOnBlur` (both default `true`), validation via a
  `validate` function or `validationSchema` (Yup). [withFormik API](https://formik.org/docs/api/withFormik).
- **Touched** — `touched` map + `errors` map; the canonical pattern is
  `touched.x && errors.x` on render, and `setFieldTouched`/`handleBlur` control it.
- **Custom components** — connected via `useFormik`/`useField` + `<Field>`; a custom pill menu
  would use `setFieldValue`, same manual wiring as RHF.
- **Async validation** — returns a promise from `validate`/schema, but **no debounce control**;
  it validates the whole form on each change (per the `validate`-on-change model), which is the
  opposite of this project's per-field, per-save gating.
- **Maintenance status** — effectively **dormant/unmaintained in practice**: latest release is
  long-standing `2.4.x` (npm `formik` latest = `2.4.9`), and the project is widely understood to
  be in maintenance limbo. Not adopted on maintenance grounds alone.

**Fit:** worst of the four for this project — whole-form validation-on-change, no debounce, and
no active maintenance.

---

## 4. rc-field-form

- **Timing** — `validateTrigger` on `<Form>` (or per `<Field>`) chooses "on change / on blur / on
  submit / none / multiple", defaulting `onChange`; `trigger` selects the *event* while
  `rules`/async-validator drive the checks.
  [config § validateTrigger](https://github.com/react-component/field-form#configuration).
- **Dependencies** — `dependencies` on a `<Field>` re-triggers its validation when a listed field
  changes (`confirmPassword` depends on `password`), which is the closest analog to
  `isInvalidForSave`'s cross-field gating.
  [Field component](https://github.com/react-component/field-form#field-component).
- **Touched** — no public `touched` map in the Formik/RHF sense; it surfaces `errors` and
  warning/validating states per field, with `onFieldsChange`.
- **Custom components** — `<Field>{({ value, onChange }) => ...}</Field>` render-prop, like
  TanStack; suits custom menus.
- **Async** — via async-validator `validator` rules (valued; otherwise `async-validator` is a
  hard dependency, which is itself an Ant-Design-tied validation dialect).

**Fit:** it is Ant Design's engine and assumes the Form wrapper owns field state and validation;
wrapping dsh `Menu`/`Input` and a `SnapshotStore` here would replicate the same ownership
collision as RHF/TanStack, and it drags `async-validator` in for no corresponding gain.

---

## 5. Native constraint validation (no-dependency baseline)

- **Timing** — inherent to the browser: `required`/`minlength`/`pattern`/`type` checks run at
  *submission* (or on `checkValidity()`/`reportValidity()`); there is **no** live per-field
  re-validation on edit unless you wire `input`/`blur` listeners and call `checkValidity()`
  yourself. [Constraint validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation).
- **Per-field custom validity** — `setCustomValidity(message)` + `element.validity.customError`
  give an imperative per-field message; clearing requires `setCustomValidity("")`. Useful for text
  inputs, useless for dsh's `Menu` (a button + portal list, not a form control — it has no
  `validity` object).
  [setCustomValidity](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/setCustomValidity).
- **Limits for this UI** — constraint validation is **submit-centric**, native-message UI (browser
  bubbles), and applies only to real form controls. A settings page with no submit button, custom
  menus, debounced remote save, and dsh's token-styled hint system gets almost nothing:
  `setCustomValidity` could replace only the `TextRow` red-hint computation (and even then
  off-style, since dsh renders its own hints), while every pill/select field and the
  cross-field/save gating still needs hand code.

The current `isInvalid`/`isInvalidForSave` functions are, in effect, *already* a minimal,
typed, dependency-free constraint layer. Native validity would not reduce them.

---

## 6. Decision

### Recommendation: **Do not adopt** any form library.

The current controller is custom, but its "customness" is *the exact parts a form library cannot
absorb* for this project:

1. **State is already external and shared.** The fields are published to a `SnapshotStore` that
   the composer microphone subscribes to via `useEarsSettings`. Every library here *owns* its
   own internal copy of field state (RHF/TanStack/rc-field-form explicitly; Formik via `values`).
   Integrating one means either (a) dual sources of truth pushed in sync via `setValue`/`reset`
   (more code, new de-sync surface), or (b) treating the library as a thin headless render layer
   over the store it can't actually observe — which is a wrapper, not a simplification.
2. **No submit, debounced RPC save.** The save path is a 400 ms-debounced, per-field-patched
   `updateSettings` **inside the store**, with mid-save edit retention and per-field
   skip-on-invalid. Every library's "submit" is a single `onSubmit(data)` that assumes
   whole-form values are valid-or-rejected together. Reimplementing per-field patching on top of
   a library's aggregate submit is `isInvalidForSave` redux, but now fighting the library's
   whole-form model.
3. **Custom primitives + "incomplete vs invalid".** dsh's `Menu`/`Input` need `Controller`/render
   props regardless, and none of the libraries model the project's three-way
   valid/invalid/incomplete distinction (D-024 amber guidance) — that stays hand-written.
4. **Async guards.** The generation-guarded async responses (whisper model state + download
   mutations, cloud model listing, reasoning efforts) are *state-machine* concerns, not field
   validation; only TanStack's `onChangeAsyncDebounceMs` overlaps, at heavy cost elsewhere.
5. **Bundle.** RHF alone would add ~13.8 kB gzip (acceptable), but any real payoff would require
   `@hookform/resolvers` + `zod`, pushing the ~236 kB client bundle up for a *new* schema
   dialect that duplicates the existing `src/config.ts` helpers. TanStack Form is heavier still.

The one thing a library *would* genuinely centralize — per-field red-hint generation — is
already ~30 lines of pure functions (`isInvalid`) shared with the host save path and cheap to
keep. The complexity is not in "managing fields"; it's in the **save/validation state machine and
the shared external store**, which no library targets.

### Concrete gain/loss table

| Concern | Hand-rolled today (gain if we drop it) | What the library actually delivers |
|---|---|---|
| Per-field red hints | `isInvalid(field,text)` pure fn, shared with host | `mode:"onBlur"`/validators — but still need custom-render wiring for `Menu`; no `incomplete` tier |
| Cross-field save gating | `isInvalidForSave` (backend/provider-dependent) | `dependencies` (rc) / `watch`+`trigger` (RHF) only *partially*; per-field patch skip stays custom |
| Debounced auto-save RPC | `scheduleSave` + `save()` in controller | Not represented; must be rebuilt *around* the library's submit |
| Shared store w/ microphone | `SnapshotStore` + `useSyncExternalStore`, already working | Conflict: library owns a second internal copy; needs `setValue`/`reset` sync bridging |
| Async model/whisper guards | Per-request generation counters | Not addressed (TanStack debounce overlaps only the listing-fetch edge) |
| invalid vs incomplete (amber) | `incomplete` flag + amber tokens | Not modeled by any library |
| Custom `Menu`/`Input` | Already wired via `edit(field, id)` | Requires `Controller`/render-prop for each — net addition |
| Bundle | none beyond dsh runtime | +13.8 kB (RHF core) to +heavy (TanStack), +resolvers/zod if schemas |
| Maintenance risk | self-owned | RHF active; Formik dormant; TanStack fast-moving |

### If forced to adopt (for completeness)

- **Library:** `react-hook-form` — most maintained, smallest core, largest ecosystem.
- **Mode:** `mode: "onBlur"` (validate the focused field when it loses focus, closest to
  "validate the field being edited") with `reValidateMode: "onChange"`, and drive the debounced
  RPC from a `watch()` subscription rather than `handleSubmit` (no submit button exists).
- **Still required by hand:** the `SnapshotStore` bridge (`setValue`/`reset`), `isInvalidForSave`
  cross-field logic, the `incomplete` tier, and all async generation guards.

This is framed as the least-bad fallback, not a recommendation: it trades the current
self-contained controller for a mapping layer plus a framing library, with no evidence it nets
out smaller or clearer.

### Sources (primary)

- react-hook-form useForm: https://react-hook-form.com/docs/useform (mode/reValidateMode),
  Controller https://react-hook-form.com/docs/useform/controller, trigger
  https://react-hook-form.com/docs/useform/trigger, setValue
  https://react-hook-form.com/docs/useform/setvalue; README
  https://github.com/react-hook-form/react-hook-form
- TanStack Form validation: https://tanstack.com/form/latest/docs/guides/validation , custom/headless
  https://tanstack.com/form/latest/docs/guides/headless-ui
- Formik: https://formik.org/docs/api/withFormik (validateOnChange/validateOnBlur),
  https://formik.org/docs/guides/validation
- rc-field-form: https://github.com/react-component/field-form (validateTrigger/dependencies)
- MDN constraint validation: https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation ,
  setCustomValidity https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/setCustomValidity
- Bundle size: bundlephobia react-hook-form@7.85.0 (13.78 kB gzip / 39.6 kB min, 0 deps)
