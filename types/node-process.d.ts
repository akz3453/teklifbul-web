// Teklifbul Rule v1.0 - Workaround for @types/node duplicate process definitions
// This file prevents TypeScript from loading duplicate process.d.ts files
// from both global TypeScript installation and project node_modules

// Reference only the local project types
/// <reference types="node" />

// This empty export ensures this file is treated as a module
export {};

