/* Ambient declarations for libraries shipped without TS types we care about. */

declare module 'mammoth/mammoth.browser' {
  interface ExtractResult { value: string; messages: unknown[]; }
  interface MammothOptions { arrayBuffer: ArrayBuffer }
  export function extractRawText(opts: MammothOptions): Promise<ExtractResult>;
  export function convertToHtml(opts: MammothOptions): Promise<ExtractResult>;
  const _default: { extractRawText: typeof extractRawText; convertToHtml: typeof convertToHtml };
  export default _default;
}

declare module 'pdfjs-dist/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export interface PdfTextItem { str?: string }
  export interface PdfPage {
    getTextContent(): Promise<{ items: PdfTextItem[] }>;
  }
  export interface PdfDoc {
    readonly numPages: number;
    getPage(n: number): Promise<PdfPage>;
    cleanup(): Promise<void>;
    destroy(): Promise<void>;
  }
  export interface PdfTask { promise: Promise<PdfDoc> }
  export function getDocument(opts: { data: Uint8Array }): PdfTask;
}
