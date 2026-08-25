import { describe, expect, it } from 'vitest'
import { joinSpacedSegments } from '../src/text-join.js'

describe('joinSpacedSegments', () => {
  it('keeps empty-side semantics', () => {
    expect(joinSpacedSegments('', 'hello')).toBe('hello')
    expect(joinSpacedSegments('hello', '')).toBe('hello')
    expect(joinSpacedSegments('', '')).toBe('')
  })

  it('separates Latin segments with a space', () => {
    expect(joinSpacedSegments('hello', 'world')).toBe('hello world')
    expect(joinSpacedSegments('hello', ' world')).toBe('hello world')
    expect(joinSpacedSegments('hello ', 'world')).toBe('hello world')
  })

  it('joins CJK segments without a space', () => {
    expect(joinSpacedSegments('今天天气', '很好')).toBe('今天天气很好')
    expect(joinSpacedSegments('你好', '世界')).toBe('你好世界')
    expect(joinSpacedSegments('こんにちは', '世界')).toBe('こんにちは世界')
    expect(joinSpacedSegments('안녕', '하세요')).toBe('안녕하세요')
  })

  it('joins across full-width punctuation without a space', () => {
    expect(joinSpacedSegments('你好，', '世界')).toBe('你好，世界')
    expect(joinSpacedSegments('结束了。', '明天见')).toBe('结束了。明天见')
    expect(joinSpacedSegments('第一点……', '第二点')).toBe('第一点……第二点')
    expect(joinSpacedSegments('「引文」', '正文')).toBe('「引文」正文')
  })

  it('keeps the space on mixed-script boundaries for readability', () => {
    expect(joinSpacedSegments('hello', '你好')).toBe('hello 你好')
    expect(joinSpacedSegments('你好', 'world')).toBe('你好 world')
    expect(joinSpacedSegments('价格100', '元')).toBe('价格100 元')
  })

  it('joins directly when either boundary is full-width punctuation', () => {
    expect(joinSpacedSegments('结束了。', 'next')).toBe('结束了。next')
    expect(joinSpacedSegments('hello', '「引文」')).toBe('hello「引文」')
  })

  it('keeps the space around full-width digits, which are content characters', () => {
    expect(joinSpacedSegments('编号１２３', '456')).toBe('编号１２３ 456')
  })
})
