
import { getAdminDb } from '../server/utils/firestore.js';

async function fixCatalog() {
    const db = await getAdminDb();
    if (!db) {
        console.error('Firestore connection failed');
        return;
    }

    const catalogRef = db.collection('ai_model_catalog');
    const snapshot = await catalogRef.get();

    console.log(`Current catalog size: ${snapshot.size}`);

    // 1. Delete Ollama
    const ollamaDocs = snapshot.docs.filter(d => d.data().provider === 'ollama');
    for (const doc of ollamaDocs) {
        await doc.ref.delete();
        console.log(`Deleted Ollama model: ${doc.data().model}`);
    }

    // 2. Fix/Upsert Groq
    const groqData = {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        label: 'Llama 3.3 (Hızlı/Bulut AI)',
        isActive: true,
        freeEligible: true,
        sort: 3
    };

    // Find existing groq or create new
    const existingGroq = snapshot.docs.find(d => d.data().provider === 'groq');
    if (existingGroq) {
        await existingGroq.ref.update(groqData);
        console.log('Updated Groq catalog entry');
    } else {
        await catalogRef.add(groqData);
        console.log('Added Groq catalog entry');
    }

    // 3. Ensure OpenAI & Gemini are there with correct flags
    const openaiData = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        label: 'OpenAI - gpt-4o-mini (Pro AI)',
        isActive: true,
        freeEligible: false,
        sort: 10
    };

    const geminiData = {
        provider: 'gemini',
        model: 'gemini-pro',
        label: 'Google Gemini - Pro (Pro AI)',
        isActive: true,
        freeEligible: false,
        sort: 20
    };

    const existingOpenai = snapshot.docs.find(d => d.data().provider === 'openai');
    if (!existingOpenai) {
        await catalogRef.add(openaiData);
        console.log('Added OpenAI to catalog');
    } else {
        await existingOpenai.ref.update(openaiData);
    }

    const existingGemini = snapshot.docs.find(d => d.data().provider === 'gemini');
    if (!existingGemini) {
        await catalogRef.add(geminiData);
        console.log('Added Gemini to catalog');
    } else {
        await existingGemini.ref.update(geminiData);
    }

    console.log('Catalog cleanup finished');
}

fixCatalog().catch(console.error);
