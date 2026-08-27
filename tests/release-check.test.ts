import { describe, expect, it } from 'vitest'
import { validateReleaseMetadata } from '../scripts/release-check.mjs'

const packageText = JSON.stringify({ name: 'dsh-ears', version: '0.1.6' })
const changelogText = '# Changelog\n\n## [0.1.6] - 2026-08-27\n\nRelease notes\n\n## [0.1.5] - 2026-08-26\n\nOlder notes\n'

describe('release metadata check', () => {
  it('accepts matching package, changelog, and tag metadata', () => {
    expect(validateReleaseMetadata({ packageText, changelogText, tag: 'v0.1.6' })).toEqual({ version: '0.1.6', tag: 'v0.1.6' })
  })

  it('allows local checks without a tag but rejects mismatches', () => {
    expect(validateReleaseMetadata({ packageText, changelogText })).toEqual({ version: '0.1.6', tag: null })
    expect(() => validateReleaseMetadata({ packageText, changelogText: changelogText.replace('[0.1.6]', '[0.1.5]') })).toThrow(/does not match/)
    expect(() => validateReleaseMetadata({ packageText, changelogText, tag: 'v0.1.5' })).toThrow(/tag/)
    expect(() => validateReleaseMetadata({ packageText, changelogText, tag: '0.1.6' })).toThrow(/tag/)
  })

  it('rejects a placeholder version or an empty release section', () => {
    expect(() => validateReleaseMetadata({ packageText: JSON.stringify({ version: '0.0.0-dev' }), changelogText })).toThrow(/concrete semver/)
    expect(() => validateReleaseMetadata({ packageText, changelogText: '# Changelog\n\n## [0.1.6] - 2026-08-27\n\n## [0.1.5] - 2026-08-26\n\nOlder notes' })).toThrow(/empty/)
  })
})
