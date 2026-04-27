const { execSync } = require('child_process');
try {
    const stdout = execSync('firebase functions:list --json', { encoding: 'utf-8' });
    // Sometimes stdout has extra text before JSON? The CLI usually outputs pure JSON with --json if no errors.
    // But let's try to parse.
    const json = JSON.parse(stdout);
    const func = json.result.find(f => f.id === 'shareDemandViaEmail');
    if (func) {
        console.log('URL:', func.uri);
    } else {
        console.log('Function shareDemandViaEmail not found in list.');
        console.log('Available IDs:', json.result.map(f => f.id));
    }
} catch (e) {
    console.error('Error:', e.message);
}
