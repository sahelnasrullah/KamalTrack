import { MockProvider } from './mockProvider.js';
import { GeminiProvider } from './geminiProvider.js';

/**
 * Provider registry. The active provider is chosen by the AI_PROVIDER env var.
 * Add new providers here — nothing else in the app needs to change.
 */
export function getAIProvider() {
  const which = (process.env.AI_PROVIDER || 'mock').toLowerCase();

  switch (which) {
    case 'gemini':
      return new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      });
    case 'mock':
    default:
      return new MockProvider();
  }
}
