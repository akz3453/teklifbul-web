export interface RecaptchaVerifyResult {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
}

export async function verifyRecaptchaToken(
  token: string,
  remoteIp?: string
): Promise<RecaptchaVerifyResult> {
  // reCAPTCHA v3 devre dışı; App Check kullanılıyor.
  return {
    success: false,
    errorCodes: ["recaptcha-disabled"],
  };
}

