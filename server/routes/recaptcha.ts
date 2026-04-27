import express from "express";
import { verifyRecaptchaToken } from "../utils/recaptcha";
import { serverLogger } from "../utils/logger";

const router = express.Router();

/**
 * POST /api/recaptcha/verify
 * Body: { token: string, action?: string }
 */
router.post("/verify", async (req, res) => {
  try {
    const { token } = req.body ?? {};

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "bad_request",
        message: "token zorunludur",
      });
    }

    const result = await verifyRecaptchaToken(token, req.ip);

    if (!result.success) {
      // Google / skor / missing-secret vs. hepsi buraya düşer
      const errorCodes = result.errorCodes ?? [];

      // internal-error ise 500, diğer tüm durumlar 403 olsun
      const hasInternalError = errorCodes.includes("internal-error");

      if (hasInternalError) {
        serverLogger.error("reCAPTCHA internal error", { errorCodes });
        return res.status(500).json({
          ok: false,
          error: "internal_server_error",
          message: "Bir hata oluştu",
        });
      }

      return res.status(403).json({
        ok: false,
        error: "recaptcha_failed",
        score: result.score ?? null,
        action: result.action ?? null,
        errorCodes,
      });
    }

    // ✅ başarılı
    return res.json({
      ok: true,
      score: result.score ?? null,
      action: result.action ?? null,
    });
  } catch (err: any) {
    serverLogger.error("reCAPTCHA verify route hata", {
      error: err?.message,
      stack: err?.stack,
    });

    return res.status(500).json({
      ok: false,
      error: "internal_server_error",
      message: "Bir hata oluştu",
    });
  }
});

export default router;

