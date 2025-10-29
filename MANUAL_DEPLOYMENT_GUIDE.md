# 📋 Manual Firestore Rules Deployment Guide

## ❌ Problem

The automated deployment failed because:
1. Firebase CLI is not installed or not in PATH
2. PowerShell execution policy is blocking scripts

## ✅ Solution: Manual Deployment via Firebase Console

Since automated deployment isn't working, you'll need to deploy the rules manually through the Firebase Console.

## 🚀 Step-by-Step Manual Deployment

### Step 1: Copy Your Updated Firestore Rules

Here's the complete content of your updated [`firestore.rules`](firestore.rules) file that needs to be deployed:

```
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
      allow create, update, delete: if isSignedIn() && 
        request.resource.data.createdBy == request.auth.uid;
    }
  }
}
```

### Step 2: Deploy via Firebase Console

1. **Open your browser** and go to: https://console.firebase.google.com/

2. **Login** to your Firebase account if you're not already logged in

3. **Select your project** "teklifbul" from the project list

4. **In the left sidebar**, click on "Firestore Database"

5. **Click on the "Rules" tab** at the top

6. **Select all text** in the rules editor and **delete it**

7. **Paste the rules** from above (the entire content)

8. **Click the "Publish" button**

9. **Wait for confirmation** - you should see a green message like "Rules published successfully"

### Step 3: Verify Deployment

After publishing:

1. **Clear your browser cache**:
   - Press `Ctrl+Shift+Delete`
   - Check "Cached images and files"
   - Click "Clear data"

2. **Hard refresh your dashboard**:
   - Navigate to your dashboard.html
   - Press `Ctrl+F5`

3. **Open the browser console** (`F12` → Console tab)

4. **Check for the following success messages**:
   ```
   ✅ Firebase persistence set to browserLocalPersistence
   ✅ Company data loaded successfully
   ✅ Default company created: "Kendi Firmam"
   ```

5. **Verify these error messages are gone**:
   ```
   ❌ ⚠️ Company data load error (using defaults): Missing or insufficient permissions.
   ❌ ⚠️ Could not create default company: Missing or insufficient permissions.
   ```

## 🎯 Expected Results After Deployment

### Before Deployment (Current State):
```
⚠️ Company data load error (using defaults): Missing or insufficient permissions.
⚠️ Could not create default company: Missing or insufficient permissions.
```

### After Deployment (What You Should See):
```
✅ Firebase persistence set to browserLocalPersistence
✅ Company data loaded successfully
✅ Default company "Kendi Firmam" created
✅ Dashboard working normally
(No permission errors)
```

## 📞 Need Help?

If you have any issues with the manual deployment:

1. **Double-check** that you've copied the entire rules content
2. **Ensure** you clicked "Publish" after pasting
3. **Verify** you're logged into the correct Firebase account
4. **Confirm** you're working on the correct project ("teklifbul")

If you're still having issues, please let me know and I can help troubleshoot further.

---

**Once you've deployed the rules manually, the permission errors will be resolved!** 🎉