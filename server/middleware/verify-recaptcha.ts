import type { Request, Response, NextFunction } from "express";
import { verifyRecaptchaToken } from "../utils/recaptcha.js";
import { serverLogger } from "../utils/logger.js";
import type { RecaptchaAction } from "../types/recaptcha.js";

export function requireRecaptcha(expectedAction: RecaptchaAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken =
        typeof req.body?.recaptchaToken === "string"
          ? req.body.recaptchaToken
          : typeof req.headers["x-recaptcha-token"] === "string"
            ? (req.headers["x-recaptcha-token"] as string)
            : null;

      if (!rawToken) {
        // Dev/test ortamında veya RECAPTCHA_DISABLED=true ise token zorunlu değil
        if (
          process.env.RECAPTCHA_DISABLED === "true" ||
          process.env.NODE_ENV !== "production"
        ) {
          serverLogger.info("[reCAPTCHA] dev bypass", {
            action: expectedAction,
            nodeEnv: process.env.NODE_ENV ?? null,
            recaptchaDisabledEnv: process.env.RECAPTCHA_DISABLED ?? null,
          });
          return next();
        }

        // Production'da token yoksa isteği reddet
        serverLogger.warn("[reCAPTCHA v3] token eksik", {
          action: expectedAction,
          nodeEnv: process.env.NODE_ENV ?? null,
        });
        return res.status(400).json({ error: "missing-recaptcha-token" });
      }

      // verifyRecaptchaToken çağrısını 2 saniyelik timeout ile koru
      const timeoutMs = 2000;
      const timeoutPromise = new Promise<ReturnType<typeof verifyRecaptchaToken>>(
        (resolve) => {
          setTimeout(() => {
            resolve({
              // @ts-expect-error narrow type at runtime
              success: false,
              errorCodes: ["timeout"],
            } as any);
          }, timeoutMs);
        },
      );

      const result = await Promise.race([
        // @ts-expect-error runtime race
        verifyRecaptchaToken(rawToken, req.ip),
        timeoutPromise,
      ]);

      if (!result.success) {
        // recaptcha-disabled ise fail yerine loglayıp devam et
        if (result.errorCodes?.includes("recaptcha-disabled")) {
          serverLogger.info("[reCAPTCHA v3] devre dışı (result) - kontrol atlanıyor", {
            action: expectedAction,
          });
          return next();
        }

        serverLogger.warn("[reCAPTCHA v3] doğrulama başarısız", {
          action: expectedAction,
          score: result.score,
          errorCodes: result.errorCodes,
        });

        return res.status(403).json({
          error: "recaptcha-validation-failed",
          score: result.score ?? null,
          action: result.action ?? expectedAction,
          errorCodes: result.errorCodes ?? [],
        });
      }

      (req as any).recaptcha = { action: result.action, score: result.score };
      return next();
    } catch (err) {
      serverLogger.error("[reCAPTCHA v3] doğrulama hatası", err);
      return res.status(500).json({ error: "recaptcha-error" });
    }
  };
}

