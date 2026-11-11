import { getStoredValue, setStoredValue } from './db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { PracticeChapter, PracticeQuestion, PracticeRegion } from './practice-types';

export type PracticeBook = {
  id: string;
  subject: PracticeChapter['subject'];
  filename: string;
  pageCount: number;
  bytes?: number;
  sha256?: string;
};

export type PracticeLibrary = {
  version: 1;
  books: PracticeBook[];
  chapters: (PracticeChapter & { questions: PracticeQuestion[] })[];
};

const base = `${import.meta.env.BASE_URL}practice-library/`;
const bookKey = (id: string) => `verdant.practice.source.${id}`;
const sourceUrl = (id: string) => `${base}source/${encodeURIComponent(id)}.pdf`;

export async function loadPracticeLibrary(signal: AbortSignal): Promise<PracticeLibrary> {
  const response = await fetch(`${base}index.json`, { signal });
  if (!response.ok || !response.headers.get('Content-Type')?.includes('json')) {
    throw new Error('The chapter index is missing. Generate it from the three source PDFs to open the practice library.');
  }
  const library = await response.json() as PracticeLibrary;
  if (library.version !== 1 || !Array.isArray(library.books) || !Array.isArray(library.chapters) || !library.chapters.length) {
    throw new Error('The chapter index could not be read.');
  }
  return library;
}

export async function findPracticeSource(book: PracticeBook, signal?: AbortSignal): Promise<Blob | string | undefined> {
  const file = await getStoredValue<Blob>(bookKey(book.id)).catch(() => undefined);
  if (file instanceof Blob && (!book.bytes || file.size === book.bytes)) return file;
  const url = sourceUrl(book.id);
  const response = await fetch(url, { method: 'HEAD', signal }).catch(() => undefined);
  if (response?.ok && response.headers.get('Content-Type')?.startsWith('application/pdf') &&
      (!book.bytes || Number(response.headers.get('Content-Length')) === book.bytes)) return url;
}

export async function attachPracticeBook(file: File, books: PracticeBook[]): Promise<PracticeBook> {
  const matchingName = (book: PracticeBook) => book.filename.toLowerCase() === file.name.toLowerCase();
  const matches = books.filter(book => book.bytes ? book.bytes === file.size : matchingName(book));
  if (!matches.length) throw new Error(`${file.name} does not match an indexed practice book.`);

  const header = await file.slice(0, 1024).text();
  if (!header.includes('%PDF-')) throw new Error(`${file.name} is not a PDF.`);
  const hash = matches.some(book => book.sha256)
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('')
    : undefined;
  const book = matches.find(candidate => candidate.sha256 ? candidate.sha256.toLowerCase() === hash : matchingName(candidate));
  if (!book) throw new Error(`${file.name} differs from the PDF used to build the chapter index.`);
  await setStoredValue(bookKey(book.id), file);
  return book;
}

export async function openPracticeSource(source: Blob | string): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const options = { useSystemFonts: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 256 * 1024 };
  if (typeof source === 'string') return pdfjs.getDocument({ ...options, url: source });
  class BlobRanges extends pdfjs.PDFDataRangeTransport {
    private closed = false;
    constructor(private file: Blob) { super(file.size, new Uint8Array()); }
    requestDataRange(begin: number, end: number) {
      void this.file.slice(begin, end).arrayBuffer().then(bytes => {
        if (!this.closed) this.onDataRange(begin, new Uint8Array(bytes));
      });
    }
    abort() { this.closed = true; }
  }
  return pdfjs.getDocument({ ...options, range: new BlobRanges(source) });
}

function imageCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encodeImage(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the source image.')), 'image/png'));
}

export async function renderPracticeRegion(pdf: PDFDocumentProxy, region: PracticeRegion, targetWidth = 1000): Promise<Blob> {
  if (region.page < 1 || region.page > pdf.numPages ||
      ![region.x, region.y, region.width, region.height].every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
      region.width <= 0 || region.height <= 0 || region.x + region.width > 1.002 || region.y + region.height > 1.002) {
    throw new Error('This source excerpt is outside the printed page.');
  }
  const page = await pdf.getPage(region.page);
  const rotation = (page.rotate + (region.rotation ?? 0)) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const scale = Math.min(3, targetWidth / (base.width * region.width), 1600 / (base.height * region.height));
  const viewport = page.getViewport({ scale, rotation });
  const canvas = imageCanvas(Math.ceil(viewport.width * region.width), Math.ceil(viewport.height * region.height));
  await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -viewport.width * region.x, -viewport.height * region.y] }).promise;
  return encodeImage(canvas);
}

export async function combinePracticeImages(blobs: Blob[]): Promise<Blob | undefined> {
  if (!blobs.length) return;
  if (blobs.length === 1) return blobs[0];
  const images: ImageBitmap[] = [];
  try {
    for (const blob of blobs) images.push(await createImageBitmap(blob));
    const width = Math.max(...images.map(image => image.width));
    const height = images.reduce((total, image) => total + image.height, 0) + (images.length - 1) * 20;
    const canvas = imageCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the original question.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    let top = 0;
    for (const image of images) {
      context.drawImage(image, 0, top);
      top += image.height + 20;
    }
    return encodeImage(canvas);
  } finally {
    images.forEach(image => image.close());
  }
}
