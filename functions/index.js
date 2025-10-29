const {onRequest} = require("firebase-functions/v2/https");
const fetch = require("node-fetch");
const cors = require("cors")({origin: true});

/**
 * TCMB Exchange Rates Proxy
 * 
 * Fetches current USD and EUR exchange rates from TCMB (Turkish Central Bank)
 * CORS-enabled endpoint that can be called from the frontend
 * 
 * Example response:
 * {
 *   "USD": "34.5678",
 *   "EUR": "37.1234",
 *   "asOf": "2025-10-18"
 * }
 */
exports.fx = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      // Fetch XML from TCMB
      const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml");
      
      if (!response.ok) {
        throw new Error(`TCMB API returned ${response.status}`);
      }
      
      const xml = await response.text();
      
      // Parse USD ForexSelling value
      const usdMatch = xml.match(/<Currency[^>]*Kod="USD"[\s\S]*?<ForexSelling>(.*?)<\/ForexSelling>/i);
      const usd = usdMatch ? usdMatch[1] : null;
      
      // Parse EUR ForexSelling value
      const eurMatch = xml.match(/<Currency[^>]*Kod="EUR"[\s\S]*?<ForexSelling>(.*?)<\/ForexSelling>/i);
      const eur = eurMatch ? eurMatch[1] : null;
      
      // Parse date
      const dateMatch = xml.match(/<Tarih>(.*?)<\/Tarih>/i);
      const asOf = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
      
      // Return formatted response
      res.json({
        USD: usd ? Number(usd).toFixed(4) : null,
        EUR: eur ? Number(eur).toFixed(4) : null,
        asOf: asOf
      });
      
    } catch (error) {
      console.error("FX fetch error:", error);
      res.status(500).json({
        error: "fx_fetch_failed",
        message: error.message || String(error)
      });
    }
  });
});
