import { describe, expect, it } from 'vitest'
import { applySpokenEnumerationLayout } from '../src/polish/enumeration.js'

describe('applySpokenEnumerationLayout', () => {
  it('splits a glued 第一/第二 request pair onto numbered lines', () => {
    expect(applySpokenEnumerationLayout('第一帮我看一下项目下的Security Key第二帮我梳理一下项目结构')).toBe([
      '1. 帮我看一下项目下的Security Key',
      '2. 帮我梳理一下项目结构'
    ].join('\n'))
  })

  it('keeps a lead-in and still breaks 第一/第二 items', () => {
    expect(applySpokenEnumerationLayout('明天要确认三件事第一预算第二接口文档第三上线时间')).toBe([
      '明天要确认三件事：',
      '1. 预算',
      '2. 接口文档',
      '3. 上线时间'
    ].join('\n'))
  })

  it('rewrites punctuated 第一，…第二，… prose that the model left on one line', () => {
    expect(applySpokenEnumerationLayout('第一，帮我看一下项目下的 Security Key。第二，帮我梳理一下项目结构。')).toBe([
      '1. 帮我看一下项目下的 Security Key',
      '2. 帮我梳理一下项目结构'
    ].join('\n'))
  })

  it('inserts line breaks into a one-line 1. … 2. … run', () => {
    expect(applySpokenEnumerationLayout('1. 帮我看一下项目下的 Security Key 2. 帮我梳理一下项目结构')).toBe([
      '1. 帮我看一下项目下的 Security Key',
      '2. 帮我梳理一下项目结构'
    ].join('\n'))
  })

  it('leaves a single 第一时间 clause alone', () => {
    expect(applySpokenEnumerationLayout('第一时间把 Security Key 发我')).toBe('第一时间把 Security Key 发我')
  })

  it('leaves an already multiline numbered list alone', () => {
    const listed = '1. 预算\n2. 接口文档'
    expect(applySpokenEnumerationLayout(listed)).toBe(listed)
  })
})
