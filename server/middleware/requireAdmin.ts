import type { Request, Response, NextFunction } from 'express';
import { isAdminRequest } from '../auth/admin-check.js';

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isAdminRequest(req)) {
    res.status(403).json({
      error: 'Yetersiz yetki',
      message: 'Bu işlemi sadece admin kullanıcılar yapabilir.',
    });
    return;
  }

  next();
}

