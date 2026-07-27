import { describe, expect, it } from 'vitest';
import {
  createNovelId,
  decodeNovelBytes,
  novelParagraphs,
  splitNovelIntoChapters,
} from './novelReader';

describe('TXT novel reader', () => {
  it('decodes UTF-8 files and strips the byte order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('第一章 开始')]);
    expect(decodeNovelBytes(bytes)).toEqual({ text: '第一章 开始', encoding: 'utf-8' });
  });

  it('falls back to GB18030 for legacy Chinese TXT files', () => {
    const bytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
    expect(decodeNovelBytes(bytes)).toEqual({ text: '中文', encoding: 'gb18030' });
  });

  it('recognizes UTF-16 byte order marks', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]);
    expect(decodeNovelBytes(bytes)).toEqual({ text: '中文', encoding: 'utf-16le' });
  });

  it('splits common Chinese chapter headings and preserves a preface', () => {
    const chapters = splitNovelIntoChapters(`
      作品简介

      第一章 初见
      第一段。
      第二段。

      第十二回 重逢
      尾声。
    `);

    expect(chapters.map((chapter) => chapter.title)).toEqual(['序章', '第一章 初见', '第十二回 重逢']);
    expect(chapters[1]!.content).toContain('第一段');
    expect(chapters[2]!.content).toContain('尾声');
  });

  it('creates readable fallback sections for a TXT without headings', () => {
    const chapters = splitNovelIntoChapters('没有章节标题的短篇正文。');
    expect(chapters).toEqual([
      { id: 'chapter-1', title: '正文', content: '没有章节标题的短篇正文。' },
    ]);
  });

  it('normalizes paragraphs and creates stable local identifiers', () => {
    expect(novelParagraphs('第一段。\n\n第二段。\n第三段。')).toEqual(['第一段。', '第二段。', '第三段。']);
    expect(createNovelId('book.txt', 12, 100, '正文')).toBe(createNovelId('book.txt', 12, 100, '正文'));
    expect(createNovelId('book.txt', 12, 100, '正文')).not.toBe(createNovelId('other.txt', 12, 100, '正文'));
  });
});
