/**
 * Chat translation (premium "Chat Translate" feature).
 * TODO: wire Google Cloud Translation / DeepL. Note: with true E2E encryption, translation must
 * run client-side on decrypted text; this server-side adapter is for non-E2E/plaintext payloads
 * or a trusted-relay mode. Keep that trade-off in mind before enabling in production.
 */
export interface TranslationAdapter {
  detectLanguage(text: string): Promise<string>; // ISO 639-1
  translate(text: string, targetLang: string): Promise<{ text: string; detectedSourceLang: string }>;
}

class StubTranslationAdapter implements TranslationAdapter {
  async detectLanguage(_text: string): Promise<string> {
    return 'en';
  }

  async translate(text: string, targetLang: string): Promise<{ text: string; detectedSourceLang: string }> {
    // TODO: call provider. Stub echoes the text with a marker so the pipeline is exercisable.
    return { text: `[${targetLang}] ${text}`, detectedSourceLang: 'en' };
  }
}

export const translation: TranslationAdapter = new StubTranslationAdapter();
