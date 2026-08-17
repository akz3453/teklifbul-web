import { isAdminRequest } from '../auth/admin-check.js';
export function requireAdmin(req, res, next) {
    if (!isAdminRequest(req)) {
        res.status(403).json({
            error: 'Yetersiz yetki',
            message: 'Bu işlemi sadece admin kullanıcılar yapabilir.',
        });
        return;
    }
    next();
}
