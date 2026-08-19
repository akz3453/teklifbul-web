export async function verifyRecaptchaToken(token, remoteIp) {
    // reCAPTCHA v3 devre dışı; App Check kullanılıyor.
    return {
        success: false,
        errorCodes: ["recaptcha-disabled"],
    };
}
