export interface RecaptchaVerifyResult {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
}

// reCAPTCHA v3 devre dışı; App Check kullanılıyor.
export async function verifyRecaptchaToken(): Promise<RecaptchaVerifyResult> {
  return {
    success: false,
    errorCodes: ["recaptcha-disabled"],
  };
}

