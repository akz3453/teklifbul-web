
// Teklifbul Rule v1.0 - GROQ test scripti yalnızca env'den anahtar okur (hardcoded fallback YASAK)
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function testGroq() {
    console.log('Testing Groq connection...');

    if (!GROQ_API_KEY) {
        console.error('GROQ_API_KEY environment variable bulunamadı. .env dosyana eklemeli ya da:');
        console.error('  PowerShell: $env:GROQ_API_KEY="gsk_..."; node scripts/test-groq.js');
        process.exit(1);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: 'Merhaba, Teklifbul projesi hakkÄ±nda bir test mesajÄ±. Kimsin?' }],
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[SUCCESS] Groq Response:', data.choices[0]?.message?.content);
            console.log('Usage:', data.usage);
        } else {
            const errText = await response.text();
            console.error(`[FAIL] status: ${response.status}, error: ${errText}`);
        }
    } catch (e) {
        console.error('[CRITICAL] Fetch failed:', e.message);
    }
}

testGroq();
