import { DEFAULT_EARS_SETTINGS } from '../config.js'
import { cloudAsrFieldDefinition, type CloudAsrCredentialField } from '../asr/providers.js'
import type { EarsSettingsPatch } from '../remote-contract.js'
import { isSettingsFieldInvalid, parseSettingsField, type FieldName } from './settings-fields.js'

export interface SettingsSubmission {
  readonly patch: EarsSettingsPatch
  readonly drafts: ReadonlyMap<FieldName, string>
  readonly credentialClears: ReadonlySet<CloudAsrCredentialField>
}

/** Owns editable text, write-only credential clears, and save reconciliation. */
export class SettingsDraftController {
  private readonly draftValues = new Map<FieldName, string>()
  private readonly pendingCredentialClears = new Set<CloudAsrCredentialField>()

  get(field: FieldName): string | undefined {
    return this.draftValues.get(field)
  }

  has(field: FieldName): boolean {
    return this.draftValues.has(field)
  }

  entries(): ReadonlyMap<FieldName, string> {
    return this.draftValues
  }

  get size(): number {
    return this.draftValues.size
  }

  /** Compatibility primitives for the coordinating controller's snapshot code. */
  set(field: FieldName, text: string): this {
    this.draftValues.set(field, text)
    return this
  }

  delete(field: FieldName): boolean {
    return this.draftValues.delete(field)
  }

  clearDrafts(): void {
    this.draftValues.clear()
  }

  edit(field: FieldName, text: string): void {
    if (this.isCredentialField(field) && text.trim() === '') {
      this.draftValues.delete(field)
      return
    }
    if (this.isCredentialField(field) && text.trim() !== '') {
      this.pendingCredentialClears.delete(field)
    }
    this.draftValues.set(field, text)
  }

  clearCredential(field: CloudAsrCredentialField): void {
    this.draftValues.delete(field)
    this.pendingCredentialClears.add(field)
  }

  undoCredentialClear(field: CloudAsrCredentialField): void {
    this.pendingCredentialClears.delete(field)
  }

  isCredentialClearPending(field: CloudAsrCredentialField): boolean {
    return this.pendingCredentialClears.has(field)
  }

  credentialClears(): ReadonlySet<CloudAsrCredentialField> {
    return this.pendingCredentialClears
  }

  isDirty(): boolean {
    return this.draftValues.size > 0 || this.pendingCredentialClears.size > 0
  }

  hasInvalidDrafts(): boolean {
    for (const [field, text] of this.draftValues) {
      if (isSettingsFieldInvalid(field, text)) return true
    }
    return false
  }

  hasPersistableDrafts(): boolean {
    if (this.pendingCredentialClears.size > 0) return true
    for (const [field, text] of this.draftValues) {
      if (!isSettingsFieldInvalid(field, text)) return true
    }
    return false
  }

  buildSubmission(): SettingsSubmission {
    const patch: EarsSettingsPatch = {}
    const submittedDrafts = new Map<FieldName, string>()
    for (const [field, text] of this.draftValues) {
      if (isSettingsFieldInvalid(field, text)) continue
      const value = field === 'maxRecordingSeconds' && text.trim() === ''
        ? DEFAULT_EARS_SETTINGS.maxRecordingSeconds
        : parseSettingsField(field, text)
      if (value === undefined) continue
      ;(patch as Record<string, unknown>)[field] = value
      submittedDrafts.set(field, text)
    }
    for (const field of this.pendingCredentialClears) {
      ;(patch as Record<string, unknown>)[field] = ''
    }
    return {
      patch,
      drafts: submittedDrafts,
      credentialClears: new Set(this.pendingCredentialClears)
    }
  }

  reconcile(submission: SettingsSubmission): void {
    for (const [field, text] of submission.drafts) {
      if (this.draftValues.get(field) === text) this.draftValues.delete(field)
    }
    for (const field of submission.credentialClears) {
      this.pendingCredentialClears.delete(field)
    }
  }

  reset(): void {
    this.draftValues.clear()
    this.pendingCredentialClears.clear()
  }

  isCredentialField(field: FieldName): field is CloudAsrCredentialField {
    return cloudAsrFieldDefinition(field)?.kind === 'credential'
  }
}
