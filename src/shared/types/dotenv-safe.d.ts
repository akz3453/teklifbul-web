// Teklifbul Rule v1.0 - dotenv-safe type declarations

declare module "dotenv-safe" {
  export interface DotenvSafeConfigOptions {
    allowEmptyValues?: boolean;
    example?: string;
    sample?: string;
    path?: string;
    encoding?: string;
  }

  export function config(options?: DotenvSafeConfigOptions): void;
  
  // Default export da olabilir
  const dotenvSafe: {
    config: (options?: DotenvSafeConfigOptions) => void;
  };
  
  export default dotenvSafe;
}

