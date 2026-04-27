// Teklifbul Rule v1.0 - Express type extensions for Multer
// This file extends Express Request type to include file upload properties

import { Request } from 'express';
import { File } from 'multer';

declare global {
  namespace Express {
    interface Request {
      file?: File;
      files?: File[] | { [fieldname: string]: File[] };
    }
  }
}

export {};

