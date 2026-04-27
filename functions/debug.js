const functions = require('firebase-functions');
console.log('Firebase Functions Keys:', Object.keys(functions));

const functionsV1 = require('firebase-functions/v1');
console.log('V1 Keys:', Object.keys(functionsV1));
if (functionsV1.firestore) {
    console.log('V1 Firestore Keys:', Object.keys(functionsV1.firestore));
    console.log('V1 Firestore Document:', functionsV1.firestore.document); // Check if function
}

try {
    console.log('functions.firestore type:', typeof functions.firestore);
    if (typeof functions.firestore === 'object') {
        console.log('functions.firestore keys:', Object.keys(functions.firestore));
    } else if (typeof functions.firestore === 'function') {
        console.log('functions.firestore is a function');
        try {
            const doc = functions.firestore.document;
            console.log('functions.firestore.document:', doc);
        } catch (e) {
            console.log('Error accessing document:', e);
        }
    }
} catch (e) {
    console.log('Error:', e);
}
