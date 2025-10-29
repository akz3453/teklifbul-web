# 🔧 Firestore Rules Deployment Instructions

## ⚠️ IMPORTANT: Rules Need to be Published

Your "Missing or insufficient permissions" errors are happening because the updated Firestore rules haven't been deployed to Firebase yet.

## 🚀 Quick Deployment Steps

1. **Open Firebase Console:**
   - Go to https://console.firebase.google.com/
   - Select your project "teklifbul"

2. **Navigate to Firestore Rules:**
   - In the left sidebar, click "Firestore Database"
   - Click the "Rules" tab

3. **Replace the existing rules with this updated code:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }

    // USERS (primary collection for user profiles)
    match /users/{uid} {
      // Her girişli kullanıcı users dökümanlarını okuyabilsin (publish'teki arama için gerekli)
      allow read: if isSignedIn();
      // Yazma: sadece kendi kaydı
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    // PROFILES (legacy - redirect to users if needed)
    match /profiles/{uid} {
      // Same rules as users collection for backward compatibility
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    // DEMANDS (talep başlığı)
    match /demands/{id} {
      // Oku: sahibi ∪ viewerIds
      allow read: if isSignedIn() &&
        (resource.data.createdBy == request.auth.uid ||
         request.auth.uid in resource.data.viewerIds);

      // Oluştur: createdBy == uid
      allow create: if isSignedIn() &&
        request.resource.data.createdBy == request.auth.uid;

      // Güncelle/Sil: sadece sahibi
      allow update, delete: if isSignedIn() &&
        resource.data.createdBy == request.auth.uid;
    }

    // ITEMS (talep kalemleri)
    match /demands/{id}/items/{itemId} {
      // Oku: talebi görebilen okur
      allow read: if isSignedIn() &&
        (get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid ||
         request.auth.uid in get(/databases/$(database)/documents/demands/$(id)).data.viewerIds);

      // Yaz: sadece talep sahibi
      allow create, update, delete: if isSignedIn() &&
        get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }

    // FILES (talebe bağlı dosyalar)  ⬅️ YENİ BLOK
    match /demands/{id}/files/{fileId} {
      // Oku: talebi görebilen herkes (null-safe check)
      allow read: if isSignedIn() &&
        (get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid ||
         (get(/databases/$(database)/documents/demands/$(id)).data.viewerIds != null &&
          request.auth.uid in get(/databases/$(database)/documents/demands/$(id)).data.viewerIds));

      // Yaz/Sil: sadece talep sahibi
      allow create, update, delete: if isSignedIn() &&
        get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }

    // BIDS (teklifler) — sade
    match /bids/{bidId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn() &&
        resource.data.supplierId == request.auth.uid;
    }

    // COMPANIES (firmalar)
    match /companies/{companyId} {
      // Her girişli kullanıcı company dökümanlarını okuyabilsin
      allow read: if isSignedIn();
      // Yazma: sadece sahibi (createdBy field'ı user ID ile eşleşmeli)
      // Allow creation for any signed-in user (with proper structure)
      allow create: if isSignedIn() && 
        request.resource.data.createdBy == request.auth.uid;
      // Allow updates/deletes only for the owner
      allow update, delete: if isSignedIn() && 
        (resource.data.createdBy == request.auth.uid ||
         request.auth.uid == resource.data.createdBy);
    }
  }
}
```

4. **Click "Publish"** - This is the most important step!

5. **Hard refresh your dashboard** (Ctrl+F5 or Cmd+Shift+R)

## 🎯 Why This Fixes Your Issue

The key change is in the companies collection rules:
- Before: `allow create: if isSignedIn();`
- After: `allow create: if isSignedIn() && request.resource.data.createdBy == request.auth.uid;`

This ensures that when creating a company document, the `createdBy` field must match the authenticated user's ID, which is a security best practice.

## 🔍 Verification

After publishing the rules, you should no longer see:
- "Missing or insufficient permissions" errors in the console
- Issues loading or creating company documents

## 🧪 Troubleshooting

If you still experience issues after deploying these rules:

### 1. Verify the rules were published:
- Go back to the Firebase Console
- Check that the rules in the editor match the code above
- Make sure you clicked "Publish" (not just "Save Draft")

### 2. Clear browser cache:
- Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
- Try in an incognito/private browsing window

### 3. Check browser console:
- Open Developer Tools (F12)
- Look for any remaining errors
- Check the Network tab for failed Firestore requests

### 4. Verify company document structure:
- In Firebase Console, go to Firestore Database
- Check if the company document exists
- Verify it has a `createdBy` field matching the user ID

### 5. Check for existing data conflicts:
- If a company document already exists but doesn't have the correct `createdBy` field, it may cause permission issues
- You may need to manually delete the existing company document and let the app recreate it

### 6. Data Reset (if needed):
If you continue to have issues, you might need to reset the company data:
1. In Firebase Console, go to Firestore Database
2. Delete the company document with ID: `solo-QsPE9IFILUgyZo8pZkcD1djaHFc2`
3. In the users collection, find your user document and remove the `companies` array or clear it
4. Refresh the dashboard to let it recreate the company document with correct permissions

## 📋 Additional Notes

The error logs show:
- User ID: `QsPE9IFILUgyZo8pZkcD1djaHFc2`
- Company ID being accessed: `solo-QsPE9IFILUgyZo8pZkcD1djaHFc2`

Both read and create operations are failing, which confirms this is a rules issue rather than a data issue.

## 🆘 If You Still Have Issues

If you still experience issues after following these steps, please share:
1. A screenshot of your Firebase Console showing the published rules
2. Updated console logs after the rule deployment
3. Information about whether you've tried the data reset steps above

The most common cause of continued issues is:
1. Not clicking "Publish" after updating the rules
2. Existing company documents that don't have the correct `createdBy` field