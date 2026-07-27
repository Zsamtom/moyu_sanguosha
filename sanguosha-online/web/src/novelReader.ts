export type NovelEncoding = 'auto' | 'utf-8' | 'gb18030' | 'utf-16le' | 'utf-16be';

export interface NovelChapter {
  id: string;
  title: string;
  content: string;
}

export interface NovelDocument {
  id: string;
  name: string;
  encoding: Exclude<NovelEncoding, 'auto'>;
  importedAt: string;
  chapters: NovelChapter[];
}

export interface NovelProgress {
  novelId: string;
  chapterIndex: number;
  scrollRatio: number;
  updatedAt: string;
}

const CHAPTER_HEADING =
  /^[ \t]{0,8}(第[0-9０-９零〇一二三四五六七八九十百千万两]+[章回卷节][^\r\n]{0,60})[ \t]*$/gm;
const FALLBACK_CHUNK_SIZE = 18_000;

function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

function decodeWith(bytes: Uint8Array, encoding: Exclude<NovelEncoding, 'auto'>, fatal = false): string {
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

export function decodeNovelBytes(
  bytes: Uint8Array,
  requestedEncoding: NovelEncoding = 'auto',
): { text: string; encoding: Exclude<NovelEncoding, 'auto'> } {
  if (requestedEncoding !== 'auto') {
    return {
      text: normalizeText(decodeWith(bytes, requestedEncoding)),
      encoding: requestedEncoding,
    };
  }

  const hasUtf8Bom = bytes.length >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf;
  const hasUtf16LeBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const hasUtf16BeBom = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;

  if (hasUtf8Bom) {
    return {
      text: normalizeText(decodeWith(bytes.subarray(3), 'utf-8')),
      encoding: 'utf-8',
    };
  }
  if (hasUtf16LeBom) {
    return {
      text: normalizeText(decodeWith(bytes.subarray(2), 'utf-16le')),
      encoding: 'utf-16le',
    };
  }
  if (hasUtf16BeBom) {
    return {
      text: normalizeText(decodeWith(bytes.subarray(2), 'utf-16be')),
      encoding: 'utf-16be',
    };
  }

  try {
    return {
      text: normalizeText(decodeWith(bytes, 'utf-8', true)),
      encoding: 'utf-8',
    };
  } catch {
    return {
      text: normalizeText(decodeWith(bytes, 'gb18030')),
      encoding: 'gb18030',
    };
  }
}

function createFallbackChapters(text: string): NovelChapter[] {
  if (text.length <= FALLBACK_CHUNK_SIZE) {
    return [{ id: 'chapter-1', title: '正文', content: text }];
  }

  const chapters: NovelChapter[] = [];
  let offset = 0;

  while (offset < text.length) {
    let end = Math.min(text.length, offset + FALLBACK_CHUNK_SIZE);
    if (end < text.length) {
      const nextBreak = text.indexOf('\n', end);
      if (nextBreak !== -1 && nextBreak - end < 1_000) end = nextBreak;
    }
    const content = text.slice(offset, end).trim();
    if (content) {
      const sequence = chapters.length + 1;
      chapters.push({
        id: `section-${sequence}`,
        title: `第 ${sequence} 节`,
        content,
      });
    }
    offset = Math.max(end + 1, offset + 1);
  }

  return chapters;
}

export function splitNovelIntoChapters(source: string): NovelChapter[] {
  const text = normalizeText(source);
  if (!text) return [];

  const matches = [...text.matchAll(CHAPTER_HEADING)];
  if (!matches.length) return createFallbackChapters(text);

  const chapters: NovelChapter[] = [];
  const firstIndex = matches[0]!.index ?? 0;
  const preface = text.slice(0, firstIndex).trim();
  if (preface) {
    chapters.push({ id: 'preface', title: '序章', content: preface });
  }

  matches.forEach((match, matchIndex) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[matchIndex + 1]?.index ?? text.length;
    const content = text.slice(start, end).trim();
    chapters.push({
      id: `chapter-${matchIndex + 1}`,
      title: match[1]!.trim(),
      content: content || ' ',
    });
  });

  return chapters;
}

export function novelParagraphs(content: string): string[] {
  return content
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function createNovelId(
  fileName: string,
  fileSize: number,
  lastModified: number,
  text: string,
): string {
  let hash = 2166136261;
  const sample = `${fileName}:${fileSize}:${lastModified}:${text.slice(0, 4096)}:${text.slice(-4096)}`;
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `txt-${(hash >>> 0).toString(16)}`;
}

const DATABASE_NAME = 'moyu-reader';
const DATABASE_VERSION = 1;
const NOVELS_STORE = 'novels';
const PROGRESS_STORE = 'progress';
const META_STORE = 'meta';
const LAST_NOVEL_KEY = 'last-novel-id';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NOVELS_STORE)) {
        database.createObjectStore(NOVELS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PROGRESS_STORE)) {
        database.createObjectStore(PROGRESS_STORE, { keyPath: 'novelId' });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveNovel(document: NovelDocument): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([NOVELS_STORE, META_STORE], 'readwrite');
  transaction.objectStore(NOVELS_STORE).put(document);
  transaction.objectStore(META_STORE).put(document.id, LAST_NOVEL_KEY);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

export async function loadLastNovel(): Promise<NovelDocument | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readonly');
  const novelId = await requestResult(
    transaction.objectStore(META_STORE).get(LAST_NOVEL_KEY) as IDBRequest<string | undefined>,
  );
  if (!novelId) {
    database.close();
    return undefined;
  }
  const novelTransaction = database.transaction(NOVELS_STORE, 'readonly');
  const document = await requestResult(
    novelTransaction.objectStore(NOVELS_STORE).get(novelId) as IDBRequest<NovelDocument | undefined>,
  );
  database.close();
  return document;
}

export async function saveNovelProgress(progress: NovelProgress): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, 'readwrite');
  transaction.objectStore(PROGRESS_STORE).put(progress);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

export async function loadNovelProgress(novelId: string): Promise<NovelProgress | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, 'readonly');
  const progress = await requestResult(
    transaction.objectStore(PROGRESS_STORE).get(novelId) as IDBRequest<NovelProgress | undefined>,
  );
  database.close();
  return progress;
}
