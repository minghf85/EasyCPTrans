/** Tiny event bus between the mocked Tauri commands and the demo UI. */
export const DEMO_TRANSLATED_EVENT = "eacp-demo:translated";
export const DEMO_OCR_TEXT_EVENT = "eacp-demo:ocr-text";

export interface DemoTranslationDetail {
  text: string;
  targetLang: string;
}

export interface DemoOcrTextDetail {
  id: number;
  text: string;
}

export const demoBus = new EventTarget();
