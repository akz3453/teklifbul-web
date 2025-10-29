# Firestore Rules Debugging

## Current Issue
We're experiencing "Missing or insufficient permissions" errors when trying to:
1. Read company documents that should exist
2. Create company documents with the correct ownerId

## Analysis
From the logs, we can see:
1. User is authenticated (`no2d4BM9ZqTL29NUfasE1GphHXy2`)
2. User has a company ID in their user document (`solo-no2d4BM9ZqTL29NUfasE1GphHXy2`)
3. When trying to read this company document, we get "permission-denied"
4. When trying to create this company document, we also get "Missing or insufficient permissions"

## Firestore Rules Analysis
The current Firestore rules for companies are:
```
match /companies/{companyId} {
  // Şirket BELGESİ okuma: sahibi veya üye
  allow read: if isSignedIn() && (
    resource.data.ownerId == request.auth.uid ||
    exists(/databases/$(database)/documents/companies/$(companyId)/memberships/$(request.auth.uid))
  );

  // Oluşturma: ownerId == uid
  allow create: if isSignedIn() && request.resource.data.ownerId == request.auth.uid;

  // Güncelle/Sil: sadece sahibi
  allow update, delete: if isSignedIn() && resource.data.ownerId == request.auth.uid;
}
```

These rules appear correct:
- Users can read companies where they are the ownerId or a member
- Users can create companies where they set ownerId to their own uid
- Users can update/delete companies where they are the ownerId

## Possible Causes
1. **Rules not deployed**: The rules in the file may not be deployed to Firebase
2. **Authentication timing**: There might be a timing issue with when authentication is established
3. **Data inconsistency**: There might be existing data that conflicts with the rules

## Next Steps
1. Test with the simple test page to isolate the issue
2. If the test fails, deploy the latest rules
3. If the test passes, there might be an issue with the application logic

## Test Procedure
1. Open the test-firestore-rules.html page
2. Click the "Test Company Creation" button
3. Observe the results in the page and browser console

## Expected Results
If rules are working correctly:
- Company should be created successfully
- Company should be readable afterward

If rules are not working:
- Permission errors should be visible in the test results