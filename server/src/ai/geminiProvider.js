import { AIProvider, buildReflectionPrompt, parseReflectionJSON } from './provider.js';
import { MockProvider } from './mockProvider.js';

/**
 * GeminiProvider: calls Google's free Gemini API over REST (no SDK needed,
 * uses Node's built-in fetch). Falls back to the mock reflection if the API
 * key is missing or the call fails, so the app never hard-errors.
 */
export class GeminiProvider extends AIProvider {
  constructor({ apiKey, model = 'gemini-1.5-flash' } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.fallback = new MockProvider();
  }

  async reflect(context) {
    if (!this.apiKey) {
      const res = await this.fallback.reflect(context);
      return { ...res, provider: 'mock (no GEMINI_API_KEY set)' };
    }

    const prompt = buildReflectionPrompt(context);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Gemini API ${resp.status}: ${body.slice(0, 200)}`);
      }

      const data = await resp.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
      const parsed = parseReflectionJSON(text);
      if (!parsed) throw new Error('Could not parse Gemini response as JSON');

      return { ...parsed, provider: `gemini:${this.model}` };
    } catch (err) {
      // Graceful degradation: never break the app on an AI failure.
      const res = await this.fallback.reflect(context);
      return {
        ...res,
        provider: `mock (gemini failed: ${err.message})`,
      };
    }
  }
}
