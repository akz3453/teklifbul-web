
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../server/src/routes/customers.ts');
console.log(`Patching file: ${filePath}`);

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Regex to match .orderBy(...) followed by semicolon (optional whitespace)
    const orderByCreatedAt = /\.orderBy\('createdAt',\s*'desc'\);/g;
    const orderByInvoiceDate = /\.orderBy\('invoiceDate',\s*'desc'\);/g;

    let newContent = content.replace(orderByCreatedAt, ';');
    newContent = newContent.replace(orderByInvoiceDate, ';');

    if (content === newContent) {
        console.log('No changes made. Patterns not found?');
        console.log('Contains orderBy createdAt:', content.includes(".orderBy('createdAt', 'desc')"));
    } else {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('✅ Successfully patched customers.ts');
    }

} catch (error) {
    console.error('Error patching file:', error);
}
