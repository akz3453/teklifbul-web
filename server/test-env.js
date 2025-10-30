// basit kontrol – secrets'ı yazdırma
import fs from "fs";

const env = JSON.parse(fs.readFileSync(".cursor/environment.json", "utf8"));
const e = env.env || {};
const ok = !!e.OPENAI_API_KEY && !!e.FIREBASE_API_KEY && !!e.FIREBASE_PROJECT_ID;
console.log(ok ? "✅ Env OK" : "❌ Env missing");
if (!ok) {
  console.log({
    hasOpenAI: !!e.OPENAI_API_KEY,
    hasFirebaseKey: !!e.FIREBASE_API_KEY,
    hasProjectId: !!e.FIREBASE_PROJECT_ID
  });
}


