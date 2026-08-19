// reCAPTCHA v3 devre dışı; App Check kullanılıyor.
export async function verifyRecaptchaToken() {
    return {
        success: false,
        errorCodes: ["recaptcha-disabled"],
    };
}
