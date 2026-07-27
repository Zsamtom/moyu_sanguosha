import { Alert, Button, Empty, Spin } from 'antd';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from 'react';
import {
  createNovelId,
  decodeNovelBytes,
  loadLastNovel,
  loadNovelProgress,
  novelParagraphs,
  saveNovel,
  saveNovelProgress,
  splitNovelIntoChapters,
  type NovelDocument,
  type NovelEncoding,
} from '../novelReader';

type ReaderTheme = 'paper' | 'sepia' | 'night';

interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 1.9,
  theme: 'paper',
};
const PREFERENCES_KEY = 'moyu-reader-preferences';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function readPreferences(): ReaderPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<ReaderPreferences>;
    return {
      fontSize: typeof saved.fontSize === 'number' ? Math.min(30, Math.max(14, saved.fontSize)) : 18,
      lineHeight: typeof saved.lineHeight === 'number' ? Math.min(2.6, Math.max(1.4, saved.lineHeight)) : 1.9,
      theme: saved.theme === 'sepia' || saved.theme === 'night' ? saved.theme : 'paper',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function readerStyle(preferences: ReaderPreferences): CSSProperties {
  return {
    '--reader-font-size': `${preferences.fontSize}px`,
    '--reader-line-height': String(preferences.lineHeight),
  } as CSSProperties;
}

export function NovelReaderScreen() {
  const [novel, setNovel] = useState<NovelDocument>();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [encoding, setEncoding] = useState<NovelEncoding>('auto');
  const [preferences, setPreferences] = useState<ReaderPreferences>(readPreferences);
  const [disguised, setDisguised] = useState(false);
  const [manualPageIndex, setManualPageIndex] = useState(0);
  const [manualPageCount, setManualPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const manualViewportRef = useRef<HTMLDivElement>(null);
  const manualContentRef = useRef<HTMLDivElement>(null);
  const manualRestoreRatioRef = useRef<number | null>(null);
  const scrollRatioRef = useRef(0);
  const saveTimerRef = useRef<number>();

  const currentChapter = novel?.chapters[chapterIndex];
  const paragraphs = useMemo(
    () => currentChapter ? novelParagraphs(currentChapter.content) : [],
    [currentChapter],
  );

  const persistProgress = useCallback((ratio = scrollRatioRef.current) => {
    if (!novel) return;
    void saveNovelProgress({
      novelId: novel.id,
      chapterIndex,
      scrollRatio: Math.min(1, Math.max(0, ratio)),
      updatedAt: new Date().toISOString(),
    }).catch(() => {
      // Reading remains available even when private browsing blocks IndexedDB.
    });
  }, [chapterIndex, novel]);

  const captureScrollPosition = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return scrollRatioRef.current;
    const maximum = container.scrollHeight - container.clientHeight;
    scrollRatioRef.current = maximum > 0 ? container.scrollTop / maximum : 0;
    return scrollRatioRef.current;
  }, []);

  const scheduleProgressSave = useCallback(() => {
    captureScrollPosition();
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistProgress(), 300);
  }, [captureScrollPosition, persistProgress]);

  const changeChapter = useCallback((nextIndex: number, initialRatio = 0) => {
    if (!novel || nextIndex < 0 || nextIndex >= novel.chapters.length) return;
    persistProgress(captureScrollPosition());
    scrollRatioRef.current = initialRatio;
    manualRestoreRatioRef.current = initialRatio;
    setManualPageIndex(0);
    setManualPageCount(1);
    setChapterIndex(nextIndex);
  }, [captureScrollPosition, novel, persistProgress]);

  const toggleDisguise = useCallback(() => {
    const ratio = captureScrollPosition();
    setDisguised((current) => {
      if (!current) manualRestoreRatioRef.current = ratio;
      return !current;
    });
  }, [captureScrollPosition]);

  const goToManualPage = useCallback((nextIndex: number) => {
    const safeIndex = Math.min(Math.max(0, nextIndex), Math.max(0, manualPageCount - 1));
    setManualPageIndex(safeIndex);
    const ratio = manualPageCount > 1 ? safeIndex / (manualPageCount - 1) : 0;
    scrollRatioRef.current = ratio;
    persistProgress(ratio);
  }, [manualPageCount, persistProgress]);

  const previousManualPage = useCallback(() => {
    if (manualPageIndex > 0) {
      goToManualPage(manualPageIndex - 1);
    } else if (chapterIndex > 0) {
      changeChapter(chapterIndex - 1, 1);
    }
  }, [changeChapter, chapterIndex, goToManualPage, manualPageIndex]);

  const nextManualPage = useCallback(() => {
    if (manualPageIndex < manualPageCount - 1) {
      goToManualPage(manualPageIndex + 1);
    } else if (novel && chapterIndex < novel.chapters.length - 1) {
      changeChapter(chapterIndex + 1, 0);
    }
  }, [changeChapter, chapterIndex, goToManualPage, manualPageCount, manualPageIndex, novel]);

  useEffect(() => {
    let active = true;
    loadLastNovel()
      .then(async (savedNovel) => {
        if (!active || !savedNovel) return;
        const progress = await loadNovelProgress(savedNovel.id);
        if (!active) return;
        const safeChapter = Math.min(
          Math.max(progress?.chapterIndex ?? 0, 0),
          Math.max(0, savedNovel.chapters.length - 1),
        );
        scrollRatioRef.current = progress?.scrollRatio ?? 0;
        setChapterIndex(safeChapter);
        setNovel(savedNovel);
      })
      .catch(() => {
        // A blocked local database should not prevent importing and reading a file.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F9' && novel) {
        event.preventDefault();
        toggleDisguise();
        return;
      }
      if (!disguised || !novel) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) return;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        previousManualPage();
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        nextManualPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disguised, nextManualPage, novel, previousManualPage, toggleDisguise]);

  useEffect(() => {
    document.title = disguised
      ? '壁挂式温湿度变送器（485 型）用户手册'
      : '小说阅读 · 墨鱼';
    return () => {
      document.title = '墨鱼';
    };
  }, [disguised]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    persistProgress(captureScrollPosition());
  }, [captureScrollPosition, persistProgress]);

  useLayoutEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const maximum = container.scrollHeight - container.clientHeight;
      container.scrollTop = maximum * scrollRatioRef.current;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [chapterIndex, disguised, novel, preferences.fontSize, preferences.lineHeight]);

  useLayoutEffect(() => {
    if (!disguised) return;
    const viewport = manualViewportRef.current;
    const content = manualContentRef.current;
    if (!viewport || !content) return;

    let measureFrame = 0;
    const measurePages = () => {
      window.cancelAnimationFrame(measureFrame);
      const pageWidth = viewport.clientWidth;
      if (pageWidth <= 0) return;
      content.style.columnWidth = `${pageWidth}px`;
      measureFrame = window.requestAnimationFrame(() => {
        const pageCount = Math.max(1, Math.ceil((content.scrollWidth - 1) / pageWidth));
        setManualPageCount(pageCount);
        setManualPageIndex((current) => {
          const restoreRatio = manualRestoreRatioRef.current;
          const nextIndex = restoreRatio === null
            ? Math.min(current, pageCount - 1)
            : Math.round(restoreRatio * Math.max(0, pageCount - 1));
          manualRestoreRatioRef.current = null;
          viewport.scrollLeft = nextIndex * pageWidth;
          return nextIndex;
        });
      });
    };

    const observer = new ResizeObserver(measurePages);
    observer.observe(viewport);
    measurePages();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(measureFrame);
    };
  }, [chapterIndex, disguised, paragraphs, preferences.fontSize, preferences.lineHeight]);

  useLayoutEffect(() => {
    if (!disguised) return;
    const viewport = manualViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = manualPageIndex * viewport.clientWidth;
  }, [disguised, manualPageIndex]);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(undefined);

    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('请选择 TXT 文本文件。');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('TXT 文件不能超过 50 MB。');
      return;
    }

    setLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = decodeNovelBytes(bytes, encoding);
      const chapters = splitNovelIntoChapters(decoded.text);
      if (!chapters.length) throw new Error('文件中没有可读取的文字');

      const document: NovelDocument = {
        id: createNovelId(file.name, file.size, file.lastModified, decoded.text),
        name: file.name.replace(/\.txt$/i, ''),
        encoding: decoded.encoding,
        importedAt: new Date().toISOString(),
        chapters,
      };
      setNovel(document);
      setChapterIndex(0);
      setManualPageIndex(0);
      setManualPageCount(1);
      manualRestoreRatioRef.current = 0;
      scrollRatioRef.current = 0;
      await saveNovel(document);
      await saveNovelProgress({
        novelId: document.id,
        chapterIndex: 0,
        scrollRatio: 0,
        updatedAt: new Date().toISOString(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? `无法读取文件：${caught.message}` : '无法读取该 TXT 文件。');
    } finally {
      setLoading(false);
    }
  };

  const adjustFont = (delta: number) => {
    setPreferences((current) => ({
      ...current,
      fontSize: Math.min(30, Math.max(14, current.fontSize + delta)),
    }));
  };

  const chapterNavigation = (
    <div className="reader-chapter-navigation">
      <Button disabled={chapterIndex === 0} onClick={() => changeChapter(chapterIndex - 1)}>
        上一章
      </Button>
      <span>{chapterIndex + 1} / {novel?.chapters.length ?? 0}</span>
      <Button
        disabled={!novel || chapterIndex >= novel.chapters.length - 1}
        onClick={() => changeChapter(chapterIndex + 1)}
      >
        下一章
      </Button>
    </div>
  );

  if (loading && !novel) {
    return (
      <main className="reader-loading" aria-live="polite">
        <Spin />
        <p>正在恢复本地书架……</p>
      </main>
    );
  }

  if (!novel) {
    return (
      <main className="page reader-empty-page">
        <section className="reader-hero">
          <span className="section-kicker">FUNCTION / LOCAL READER</span>
          <h1>TXT 小说阅读</h1>
          <p>文件只在当前浏览器中读取和保存，不会自动上传到服务器。</p>
        </section>
        {error && <Alert type="error" showIcon message={error} />}
        <section className="paper-card reader-import-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="导入一本 TXT 小说开始阅读"
          />
          <div className="reader-import-actions">
            <label>
              <span>文字编码</span>
              <select value={encoding} onChange={(event) => setEncoding(event.target.value as NovelEncoding)}>
                <option value="auto">自动识别</option>
                <option value="utf-8">UTF-8</option>
                <option value="gb18030">GBK / GB18030</option>
                <option value="utf-16le">UTF-16 LE</option>
                <option value="utf-16be">UTF-16 BE</option>
              </select>
            </label>
            <Button type="primary" onClick={() => fileInputRef.current?.click()}>
              选择 TXT 文件
            </Button>
          </div>
        </section>
        <input
          ref={fileInputRef}
          className="reader-file-input"
          type="file"
          accept=".txt,text/plain"
          onChange={(event) => void importFile(event)}
        />
      </main>
    );
  }

  if (disguised) {
    return (
      <main className="manual-reader" aria-label="技术文档阅读模式">
        <header className="manual-toolbar">
          <div className="manual-toolbar__group">
            <button type="button" aria-label="文档目录" title="文档目录">☷</button>
            <span className="manual-toolbar__divider" />
            <button type="button" aria-label="高亮批注" title="高亮批注">▽</button>
            <button type="button" className="manual-toolbar__text-tool">绘制⌄</button>
            <button type="button" aria-label="橡皮擦" title="橡皮擦">◇</button>
            <button type="button" aria-label="添加文本" title="添加文本">▣</button>
            <span className="manual-toolbar__divider" />
            <button type="button" aria-label="朗读" title="朗读">A⌁</button>
            <button type="button" aria-label="语言" title="语言">aあ</button>
          </div>
          <div className="manual-toolbar__group manual-toolbar__pages">
            <button type="button" aria-label="减小字号" onClick={() => adjustFont(-1)}>−</button>
            <button type="button" aria-label="增大字号" onClick={() => adjustFont(1)}>＋</button>
            <button type="button" aria-label="适合页面" title="适合页面">↔</button>
            <span className="manual-toolbar__divider" />
            <button
              type="button"
              aria-label="上一页"
              disabled={chapterIndex === 0 && manualPageIndex === 0}
              onClick={previousManualPage}
            >
              ‹
            </button>
            <strong>{manualPageIndex + 1}</strong>
            <span>/ {manualPageCount}</span>
            <button
              type="button"
              aria-label="下一页"
              disabled={
                chapterIndex >= novel.chapters.length - 1 &&
                manualPageIndex >= manualPageCount - 1
              }
              onClick={nextManualPage}
            >
              ›
            </button>
            <button type="button" aria-label="旋转页面" title="旋转页面">↻</button>
          </div>
          <div className="manual-toolbar__group">
            <button type="button" aria-label="搜索" title="搜索">⌕</button>
            <button type="button" aria-label="打印" title="打印">▣</button>
            <button type="button" aria-label="保存" title="保存">▤</button>
            <button type="button" aria-label="全屏" title="全屏">↗</button>
            <button type="button" aria-label="退出文档模式（F9）" onClick={toggleDisguise}>↩</button>
            <button type="button" aria-label="设置" title="设置">⚙</button>
            <span className="manual-toolbar__divider" />
            <span className="manual-toolbar__acrobat">使用 Acrobat 编辑</span>
          </div>
        </header>
        <div className="manual-canvas">
          <article className="manual-page" style={readerStyle(preferences)}>
            <div className="manual-page__running-head">
              <span className="manual-page__mark">RK</span>
              <span>壁挂数码管工字壳温湿度变送器（485 型）用户手册 V2.3</span>
            </div>
            <h1>4. 通讯协议</h1>
            <h2>4.1 通讯基本参数</h2>
            <table className="manual-parameter-table">
              <tbody>
                <tr><th>编码</th><td>8 位二进制</td></tr>
                <tr><th>数据位</th><td>8 位</td></tr>
                <tr><th>奇偶校验位</th><td>无</td></tr>
                <tr><th>停止位</th><td>1 位</td></tr>
                <tr><th>错误校验</th><td>CRC（冗余循环码）</td></tr>
              </tbody>
            </table>
            <h2>4.2 数据帧格式定义</h2>
            <div
              ref={manualViewportRef}
              className="manual-page__novel-viewport"
              aria-live="polite"
              aria-label={`小说正文，第 ${chapterIndex + 1} 章，第 ${manualPageIndex + 1} 页`}
            >
              <div ref={manualContentRef} className="manual-page__content">
                {paragraphs.map((paragraph, index) => <p key={`${currentChapter?.id}-${index}`}>{paragraph}</p>)}
              </div>
            </div>
            <div className="manual-page__footer">
              <span>山东仁科测控技术有限公司</span>
              <span>{manualPageIndex + 1}</span>
              <span>www.rkckth.com</span>
            </div>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className={`novel-reader novel-reader--${preferences.theme}`}>
      <header className="reader-toolbar">
        <div>
          <span className="section-kicker">FUNCTION / TXT READER</span>
          <h1>{novel.name}</h1>
          <p>{novel.chapters.length} 章 · {novel.encoding.toUpperCase()} · 本地书架</p>
        </div>
        <div className="reader-toolbar__actions">
          <label>
            <span>重新导入编码</span>
            <select value={encoding} onChange={(event) => setEncoding(event.target.value as NovelEncoding)}>
              <option value="auto">自动识别</option>
              <option value="utf-8">UTF-8</option>
              <option value="gb18030">GBK / GB18030</option>
              <option value="utf-16le">UTF-16 LE</option>
              <option value="utf-16be">UTF-16 BE</option>
            </select>
          </label>
          <Button onClick={() => fileInputRef.current?.click()}>导入其他 TXT</Button>
          <Button type="primary" onClick={toggleDisguise}>文档模式 · F9</Button>
        </div>
      </header>
      {error && <Alert className="reader-alert" type="error" showIcon message={error} />}
      <div className="reader-workspace">
        <aside className="reader-sidebar">
          <div className="reader-sidebar__title">
            <strong>章节目录</strong>
            <span>{chapterIndex + 1} / {novel.chapters.length}</span>
          </div>
          <nav aria-label="小说章节">
            {novel.chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                type="button"
                aria-current={index === chapterIndex ? 'page' : undefined}
                onClick={() => changeChapter(index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {chapter.title}
              </button>
            ))}
          </nav>
        </aside>
        <section className="reader-stage">
          <div className="reader-settings" aria-label="阅读设置">
            <label>
              字号
              <input
                type="range"
                min="14"
                max="30"
                value={preferences.fontSize}
                onChange={(event) => setPreferences((current) => ({ ...current, fontSize: Number(event.target.value) }))}
              />
              <span>{preferences.fontSize}px</span>
            </label>
            <label>
              行距
              <input
                type="range"
                min="1.4"
                max="2.6"
                step="0.1"
                value={preferences.lineHeight}
                onChange={(event) => setPreferences((current) => ({ ...current, lineHeight: Number(event.target.value) }))}
              />
              <span>{preferences.lineHeight.toFixed(1)}</span>
            </label>
            <div className="reader-theme-switch" aria-label="阅读主题">
              {(['paper', 'sepia', 'night'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  aria-pressed={preferences.theme === theme}
                  onClick={() => setPreferences((current) => ({ ...current, theme }))}
                >
                  {theme === 'paper' ? '白纸' : theme === 'sepia' ? '护眼' : '夜间'}
                </button>
              ))}
            </div>
          </div>
          <div ref={scrollRef} className="reader-scroll" onScroll={scheduleProgressSave}>
            <article className="reader-article" style={readerStyle(preferences)}>
              <span className="reader-article__number">CHAPTER {String(chapterIndex + 1).padStart(2, '0')}</span>
              <h2>{currentChapter?.title}</h2>
              <div className="reader-article__rule" />
              {paragraphs.map((paragraph, index) => <p key={`${currentChapter?.id}-${index}`}>{paragraph}</p>)}
              {chapterNavigation}
            </article>
          </div>
        </section>
      </div>
      <input
        ref={fileInputRef}
        className="reader-file-input"
        type="file"
        accept=".txt,text/plain"
        onChange={(event) => void importFile(event)}
      />
    </main>
  );
}
