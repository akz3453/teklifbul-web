// Teklifbul Rule v1.0 - ImportMetaEnv type declarations
// Vite build sistemi için import.meta.env tip tanımlamaları

declare interface ImportMetaEnv {
  readonly NODE_ENV?: string;
  readonly VITE_APP_ENV?: string;
  readonly PROD?: boolean;
  readonly DEV?: boolean;
  readonly MODE?: string;
  // İleride ekleyebileceğimiz diğer VITE_ değişkenleri için:
  readonly [key: string]: string | boolean | undefined;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

