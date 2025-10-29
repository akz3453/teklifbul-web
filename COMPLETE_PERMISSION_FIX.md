# 🔧 Firestore Permission Errors - Complete Fix

## ❌ Problems Identified

### Error 1: demands.html - "Firma adı okunamadı"
```
demands.html:399 Firma adı okunamadı: FirebaseError: Missing or insufficient permissions.
```

**Root Cause**: Code was trying to read from `profiles` collection which doesn't exist in Firestore rules. Only `users` collection has read permissions defined.

### Error 2: firebase.js - IndexedDB Persistence Error
```
IndexedDB _deleteObject @ indexed_db.ts:156
setPersistence @ auth_impl.ts:467
```

**Root Cause**: `setPersistence` was failing without error handling, causing auth initialization issues.

---

## ✅ Fixes Applied

### Fix 1: demands.html - Changed Collection from `profiles` to `users`

**File**: [`demands.html`](demands.html)

**Before:**
```javascript
const profRef = doc(db, "profiles", u.uid);
const profSnap = await getDoc(profRef);
```

**After:**
```javascript
// Changed from "profiles" to "users" collection
const userRef = doc(db, "users", u.uid);
const userSnap = await getDoc(userRef);
```

**Why**: The `profiles` collection doesn't have read permissions in firestore.rules. All user data is stored in the `users` collection.

---

### Fix 2: firebase.js - Added Error Handling for Persistence

**File**: [`firebase.js`](firebase.js)

**Before:**
```javascript
// Kalıcı oturum
await setPersistence(auth, browserLocalPersistence);
```

**After:**
```javascript
// Kalıcı oturum - with error handling
try {
  await setPersistence(auth, browserLocalPersistence);
  console.log("✅ Firebase persistence set to browserLocalPersistence");
} catch (e) {
  console.warn("⚠️ Firebase persistence error (using default):", e.message);
  // Continue without persistence - auth will still work with session storage
}
```

**Why**: IndexedDB can fail in some browsers (private mode, disabled storage, etc.). The app should continue working with session storage as fallback.

---

### Fix 3: firestore.rules - Added `profiles` Collection Rule (Backward Compatibility)

**File**: [`firestore.rules`](firestore.rules)

**Added:**
```javascript
// PROFILES (legacy - redirect to users if needed)
match /profiles/{uid} {
  // Same rules as users collection for backward compatibility
  allow read: if isSignedIn();
  allow write: if isSignedIn() && request.auth.uid == uid;
}
```

**Why**: In case there's any legacy code or data still using the `profiles` collection, this rule ensures it works without permission errors.

---

## 📊 Summary of All Firestore Rules Changes

### Complete Updated firestore.rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }

    // USERS (primary collection for user profiles)
    match /users/{uid} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    // PROFILES (legacy - for backward compatibility)
    match /profiles/{uid} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    // DEMANDS (talep başlığı)
    match /demands/{id} {
      allow read: if isSignedIn() &&
        (resource.data.createdBy == request.auth.uid ||
         request.auth.uid in resource.data.viewerIds);
      allow create: if isSignedIn() &&
        request.resource.data.createdBy == request.auth.uid;
      allow update, delete: if isSignedIn() &&
        resource.data.createdBy == request.auth.uid;
    }

    // ITEMS (talep kalemleri)
    match /demands/{id}/items/{itemId} {
      allow read: if isSignedIn() &&
        (get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid ||
         request.auth.uid in get(/databases/$(database)/documents/demands/$(id)).data.viewerIds);
      allow create, update, delete: if isSignedIn() &&
        get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }

    // FILES (talebe bağlı dosyalar) - NULL-SAFE CHECK
    match /demands/{id}/files/{fileId} {
      allow read: if isSignedIn() &&
        (get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid ||
         (get(/databases/$(database)/documents/demands/$(id)).data.viewerIds != null &&
          request.auth.uid in get(/databases/$(database)/documents/demands/$(id)).data.viewerIds));
      allow create, update, delete: if isSignedIn() &&
        get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }

    // BIDS (teklifler)
    match /bids/{bidId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn() &&
        resource.data.supplierId == request.auth.uid;
    }
  }
}
```

---

## 🚀 DEPLOYMENT REQUIRED

### ⚠️ Critical: Deploy Firestore Rules

**Client-side fixes** (demands.html, firebase.js) are already active.

**Server-side fix** (firestore.rules) MUST be deployed:

#### **Method 1: Firebase Console (Recommended)**

1. Open https://console.firebase.google.com
2. Select your project: **teklifbul**
3. Go to **Firestore Database** → **Rules** tab
4. Copy the complete rules from [`firestore.rules`](firestore.rules)
5. Paste into the editor
6. Click **"Publish"**
7. Wait for confirmation: "✔ Rules published successfully"

#### **Method 2: Command Line**

```bash
# If PowerShell script execution is blocked, enable it first:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Then deploy:
npx firebase deploy --only firestore:rules

# OR use the batch file:
deploy-rules.bat
```

---

## 🧪 Testing After Deployment

### Step 1: Clear Browser Data
```
Press: Ctrl+Shift+Delete
Select: "Cached images and files"
Click: "Clear data"
```

### Step 2: Hard Refresh
```
Press: Ctrl+F5 on demands.html
```

### Step 3: Check Console (F12)

**✅ Expected (Success)**:
```
✅ Firebase persistence set to browserLocalPersistence
✅ Demands loaded: X items
Firma adı: [Your Company Name]
```

**❌ Should NOT See**:
```
❌ Firma adı okunamadı: FirebaseError: Missing or insufficient permissions
❌ IndexedDB errors
```

### Step 4: Verify Functionality
- [ ] Company name displays correctly in header
- [ ] Demands list loads without errors  
- [ ] No console errors related to Firestore
- [ ] Page loads normally

---

## 📁 Files Modified

| File | Changes | Deployment | Status |
|------|---------|------------|--------|
| [`demands.html`](demands.html) | Changed `profiles` → `users` | Client-side (auto) | ✅ Active |
| [`firebase.js`](firebase.js) | Added persistence error handling | Client-side (auto) | ✅ Active |
| [`firestore.rules`](firestore.rules) | Added `profiles` rule, fixed null checks | **Server-side** | ⚠️ **NEEDS DEPLOY** |

---

## 🔍 Debugging Guide

### If "Firma adı okunamadı" Still Appears

**Check 1: Rules Deployed?**
```javascript
// In Firebase Console → Firestore → Rules
// Verify this line exists:
match /users/{uid} {
  allow read: if isSignedIn();
}
```

**Check 2: User Document Exists?**
```javascript
// In browser console (F12):
const user = auth.currentUser;
const userDoc = await getDoc(doc(db, "users", user.uid));
console.log("User exists:", userDoc.exists());
console.log("User data:", userDoc.data());
```

**Check 3: Auth State?**
```javascript
// In browser console:
console.log("Current user:", auth.currentUser);
console.log("User UID:", auth.currentUser?.uid);
```

### If IndexedDB Error Persists

**Solution 1: Check Browser Settings**
- Go to browser settings → Privacy
- Ensure "Cookies and site data" is enabled
- Try in normal (non-private) window

**Solution 2: Clear IndexedDB**
```
F12 → Application tab → IndexedDB
Right-click "firebaseLocalStorageDb" → Delete database
Refresh page
```

**Solution 3: Use Session Storage (Temporary)**
```javascript
// In firebase.js, change to:
import { browserSessionPersistence } from "...";
await setPersistence(auth, browserSessionPersistence);
```

---

## 🛡️ Security Impact

### Before Fixes
- ❌ App couldn't read user profiles → Permission errors
- ❌ No fallback for persistence failures → App crashes
- ❌ Draft demands couldn't load files → Permission errors

### After Fixes
- ✅ All authenticated users can read all user profiles (needed for supplier search)
- ✅ App gracefully handles persistence failures
- ✅ Owner can access files even for draft demands
- ✅ Backward compatibility with legacy `profiles` collection

### Security Matrix

| Collection | Operation | Who Can Access |
|------------|-----------|----------------|
| `users/{uid}` | Read | ✅ Any authenticated user |
| `users/{uid}` | Write | ✅ Only the user (uid match) |
| `profiles/{uid}` | Read | ✅ Any authenticated user (legacy) |
| `profiles/{uid}` | Write | ✅ Only the user (uid match) |
| `demands/{id}` | Read | ✅ Owner OR viewers |
| `demands/{id}/files` | Read | ✅ Owner OR viewers (null-safe) |
| `bids` | Read | ✅ Any authenticated user |

---

## 💡 Prevention Tips

### 1. Always Use Consistent Collection Names
```javascript
// ✅ Good - Use "users" everywhere
doc(db, "users", uid)

// ❌ Bad - Mixing collection names
doc(db, "profiles", uid)  // Old
doc(db, "users", uid)     // New
```

### 2. Always Handle Async Errors
```javascript
// ✅ Good
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn("Persistence failed, using default:", e);
}

// ❌ Bad
await setPersistence(auth, browserLocalPersistence); // Can crash
```

### 3. Test Rules Before Deployment
```bash
# Use Firebase emulator for testing
firebase emulators:start --only firestore

# Test rules locally before deploying to production
```

### 4. Add Null Checks for Arrays
```javascript
// ✅ Good
resource.data.viewerIds != null && uid in resource.data.viewerIds

// ❌ Bad
uid in resource.data.viewerIds  // Fails if viewerIds is null
```

---

## 📚 Related Documentation

- [FIRESTORE_PERMISSION_FIX.md](FIRESTORE_PERMISSION_FIX.md) - Previous file upload permission fix
- [BIDS_PAGE_GUIDE.md](BIDS_PAGE_GUIDE.md) - Bids page documentation
- [RULES_DEPLOYMENT.md](RULES_DEPLOYMENT.md) - Firestore rules deployment guide

---

## ✅ Deployment Checklist

### Pre-Deployment
- [x] Fixed demands.html to use `users` collection
- [x] Added error handling to firebase.js
- [x] Updated firestore.rules with `profiles` collection
- [x] Added null-safe checks for viewerIds

### Deployment
- [ ] Deploy firestore.rules via Firebase Console
- [ ] Verify rules published successfully
- [ ] Check Firebase Console for any errors

### Post-Deployment
- [ ] Clear browser cache
- [ ] Hard refresh (Ctrl+F5)
- [ ] Check console for errors
- [ ] Verify company name displays
- [ ] Test demands list loading
- [ ] Test file operations (if applicable)

---

## 🎯 Expected Results

### Before Fixes
```
Console Output:
❌ Firma adı okunamadı: FirebaseError: Missing or insufficient permissions
❌ IndexedDB errors
❌ Company name: "-"
```

### After Fixes
```
Console Output:
✅ Firebase persistence set to browserLocalPersistence
✅ Demands loaded successfully
✅ Company name: "Your Company Name"
(No errors)
```

---

**Last Updated**: 2025-01-21  
**Issues Fixed**:
1. ✅ demands.html permission error (profiles → users)
2. ✅ firebase.js persistence error (added error handling)
3. ✅ firestore.rules missing profiles collection (added rule)
4. ✅ demand-detail.html file loading error (null-safe viewerIds)

**Status**: ✅ READY TO DEPLOY - Deploy firestore.rules to complete the fix!
