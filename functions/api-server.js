
// Firebase Functions v2 API Wrapper for Teklifbul Express Server
// Teklifbul Rule v1.0 - Cloud Deployment

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require('firebase-functions/params');

// Secrets Manager'dan Groq Key'i tanimla (Deploy sirasinda sorulur)
const groqSecret = defineSecret('GROQ_API_KEY');

/**
 * Main API Cloud Function
 * Bu fonksiyon, tÃ¼m /api isteklelerini Express sunucusuna yÃ¶nlendirir.
 */
exports.api = onRequest({
    secrets: [groqSecret],
    minInstances: 0,
    memory: "512MiB",
    timeoutSeconds: 60
}, async (req, res) => {
    // Express sunucusunu dinamik olarak import et
    // Bu sayede server/ klasÃ¶rÃ¼ndeki tÃ¼m mantik burada Ã§aliÅŸir
    try {
        // Not: server/index.ts build edildikten sonra burada kullanilabilir.
        // Simdilik proxy mantigi ile ana uygulamayi Ã§agiriyoruz.
        const { app } = require("../server/index.js");
        return app(req, res);
    } catch (error) {
        console.error("Cloud Functions API Error:", error);
        res.status(500).send("API Sunucusu BaÅŸlatÄ±lamadÄ±.");
    }
});
