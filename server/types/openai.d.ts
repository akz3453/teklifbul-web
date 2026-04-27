// Minimal OpenAI type tanımı
// Sadece bu projede kullanılan alanlar için stub sağlar.

declare module 'openai' {
  export interface OpenAIConfig {
    apiKey?: string;
  }

  export default class OpenAI {
    constructor(config: OpenAIConfig);
    chat: {
      completions: {
        // Teklifbul Rule v1.0 - Async/await yapısı, tipler basitleştirilmiş
        create(args: {
          model: string;
          messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
          temperature?: number;
          max_tokens?: number;
        }): Promise<{
          choices: { message?: { content?: string } }[];
        }>;
      };
    };
  }
}


