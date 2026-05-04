// Teklifbul Rule v1.0 - dotenv-safe icin minimal ambient module declaration
// dotenv-safe paketinin resmi @types/dotenv-safe tipi guncel degil; sadece
// migration runner'da kullandigimiz kismi tipliyoruz.

declare module 'dotenv-safe' {
  export interface DotenvSafeConfigOptions {
    allowEmptyValues?: boolean;
    example?: string;
    path?: string;
    encoding?: BufferEncoding;
    debug?: boolean;
    silent?: boolean;
  }

  export interface DotenvSafeConfigOutput {
    parsed?: { [key: string]: string };
    error?: Error;
    required?: { [key: string]: string };
  }

  export function config(options?: DotenvSafeConfigOptions): DotenvSafeConfigOutput;

  const _default: {
    config: typeof config;
  };
  export default _default;
}
