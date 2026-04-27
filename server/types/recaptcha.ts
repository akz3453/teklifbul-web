export type RecaptchaAction =
  | "login"
  | "signup"
  | "password_reset"
  | "submit_form";

export interface RecaptchaVerificationResult {
  ok: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
  reason?: string;
}

