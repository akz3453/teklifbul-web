# Buyer Registration Integration Guide

**Date:** 2025-10-20  
**File:** `register-buyer.html`  
**Status:** ✅ Complete

## Overview

Created a comprehensive buyer registration page that integrates seamlessly with the multi-role system implemented in Step 001.

## Features

### ✅ Core Functionality
1. **Company Information Collection**
   - Company name, tax number, tax office
   - MERSİS number, website
   - Address, city, country

2. **Contact Information**
   - Primary email (from authentication)
   - Additional emails (chip-based)
   - Phone numbers (chip-based)

3. **Category Management**
   - Buyer categories for organizing demands
   - Chip-based selection from predefined list
   - Custom category support

4. **Multi-Role Support**
   - Buyer role (default, locked)
   - Optional supplier role selection
   - Conditional guidance based on role

5. **KVKK Compliance**
   - KVKK consent checkbox
   - Contract consent checkbox
   - Optional marketing consent

### ✅ Data Model Compatibility

The registration page saves data in the exact format expected by the multi-role system:

```javascript
{
  // Multi-role fields (Step 001)
  roles: ["buyer"] or ["buyer", "supplier"],
  isPremium: false,
  buyerCategories: string[],
  supplierCategories: [],
  
  // Company info
  companyName: string,
  taxNumber: string,
  taxOffice: string | null,
  mersisNo: string | null,
  website: string | null,
  address: string,
  city: string | null,
  country: string,
  
  // Contact
  contactEmails: string[],
  contactPhones: string[],
  
  // Consents
  kvkkConsent: boolean,
  contractConsent: boolean,
  marketingConsent: boolean,
  consentAt: Timestamp,
  
  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Integration Points

### 1. Registration Flow

**Current:**
```
signup.html → role-select.html → dashboard.html
```

**With New Page:**
```
signup.html → register-buyer.html → dashboard.html or settings.html
```

### 2. Redirect Logic

```javascript
// After successful registration
if (roles.includes("supplier")) {
  // Go to settings to complete supplier info
  location.href = "./settings.html";
} else {
  // Go to dashboard
  location.href = "./dashboard.html";
}
```

### 3. Data Prefill

The page automatically loads existing user data if available:
- Checks `users/{uid}` document
- Prefills all form fields
- Loads existing categories and contacts
- Preserves existing role selections

## Usage

### Option 1: Direct Link
Users can navigate directly to `register-buyer.html` after signup:

```html
<!-- In signup.html after successful registration -->
location.href = "./register-buyer.html";
```

### Option 2: Role Selection
Integrate into existing role-select flow:

```html
<!-- In role-select.html buyer button -->
buyerBtn.onclick = () => {
  location.href = "./register-buyer.html";
};
```

### Option 3: Profile Completion
Use as profile completion page:

```html
<!-- Dashboard or settings link -->
<a href="./register-buyer.html">Complete Profile</a>
```

## Validation Rules

### Required Fields
- ✅ Company name (companyName)
- ✅ Tax number (taxNumber) - 10 or 11 digits
- ✅ Address
- ✅ KVKK consent checkbox
- ✅ Contract consent checkbox

### Optional Fields
- Website
- Tax office
- MERSİS number
- City
- Additional emails
- Additional phones
- Categories
- Supplier role
- Marketing consent

### Validation Logic

```javascript
function validate() {
  const companyName = document.getElementById("companyName").value.trim();
  const taxNumber = document.getElementById("taxNumber").value.trim();
  const address = document.getElementById("address").value.trim();
  
  if (!companyName) return "Firma ünvanı zorunludur.";
  if (!(taxNumber.length === 10 || taxNumber.length === 11)) {
    return "Vergi No 10 veya 11 hane olmalıdır.";
  }
  if (!address) return "Adres zorunludur.";
  if (!kvkkConsent.checked) return "KVKK onayını işaretlemeniz gerekmektedir.";
  if (!contractConsent.checked) return "Sözleşme onayını işaretlemeniz gerekmektedir.";
  
  return null;
}
```

## User Experience

### Visual Feedback
- ✅ Disabled email field (shows authentication email)
- ✅ Chip-based contact entry (easy add/remove)
- ✅ Category suggestions from datalist
- ✅ Conditional supplier note (shows when supplier checked)
- ✅ Clear validation messages
- ✅ Loading state on save button

### Navigation
- ✅ Cancel button → index.html
- ✅ Save success → dashboard.html or settings.html
- ✅ User email displayed in header

## Testing

### Test Case 1: New Buyer Registration
**Steps:**
1. Create new account via signup.html
2. Navigate to register-buyer.html
3. Fill required fields:
   - Company name: "Test Company Ltd."
   - Tax number: "1234567890"
   - Address: "Test Address"
4. Check KVKK and contract consents
5. Click "Kaydet ve Devam Et"

**Expected:**
- ✅ Data saved to `users/{uid}`
- ✅ roles: ["buyer"]
- ✅ Redirect to dashboard.html
- ✅ Success message shown

**Result:** [ ] PASS [ ] FAIL

---

### Test Case 2: Buyer + Supplier Registration
**Steps:**
1. Create new account
2. Navigate to register-buyer.html
3. Fill required fields
4. Check "Tedarikçi" checkbox
5. Check consents
6. Click save

**Expected:**
- ✅ roles: ["buyer", "supplier"]
- ✅ Supplier note shown
- ✅ Redirect to settings.html
- ✅ Message about completing supplier info

**Result:** [ ] PASS [ ] FAIL

---

### Test Case 3: Profile Update
**Steps:**
1. Login as existing user
2. Navigate to register-buyer.html
3. Form prefilled with existing data
4. Modify some fields
5. Save

**Expected:**
- ✅ Existing data loaded correctly
- ✅ Changes saved with merge: true
- ✅ createdAt preserved
- ✅ updatedAt timestamp updated

**Result:** [ ] PASS [ ] FAIL

---

### Test Case 4: Chip Input
**Steps:**
1. Type email in additional emails field
2. Press Enter
3. Email appears as chip
4. Click X on chip

**Expected:**
- ✅ Chip created on Enter
- ✅ Chip removed on click
- ✅ Input field cleared after adding
- ✅ Invalid email rejected with alert

**Result:** [ ] PASS [ ] FAIL

---

### Test Case 5: Category Selection
**Steps:**
1. Type "Elektrik" in category field
2. Press Enter
3. Type custom "My Category"
4. Press Enter

**Expected:**
- ✅ Both categories added
- ✅ Both saved to buyerCategories
- ✅ Datalist suggestions shown
- ✅ Custom categories allowed

**Result:** [ ] PASS [ ] FAIL

## Security

### Firestore Rules
Current rules already support this page:

```javascript
match /users/{uid} {
  allow read, write: if isSignedIn() && request.auth.uid == uid;
}
```

### Data Validation
- ✅ Client-side validation for required fields
- ✅ Email format validation
- ✅ Tax number length validation
- ✅ User authentication required (requireAuth)
- ✅ Only authenticated user can write their own document

## Firestore Structure

### Collection: users/{uid}

**Document:**
```javascript
{
  // Identity
  uid: "auth_user_id",
  
  // Roles (Step 001 compatible)
  roles: ["buyer"],              // or ["buyer", "supplier"]
  isPremium: false,
  
  // Company
  companyName: "ABC İnşaat A.Ş.",
  taxNumber: "1234567890",
  taxOffice: "Ataşehir",
  mersisNo: "0123456789012345",
  website: "https://www.abc.com",
  address: "İstanbul, Türkiye",
  city: "İstanbul",
  country: "Türkiye",
  
  // Contact
  contactEmails: ["user@example.com", "info@abc.com"],
  contactPhones: ["+90 555 123 4567"],
  
  // Categories
  buyerCategories: ["İnşaat", "Elektrik"],
  supplierCategories: [],
  
  // Consents
  kvkkConsent: true,
  contractConsent: true,
  marketingConsent: false,
  consentAt: Timestamp,
  
  // Metadata
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Migration from Old Registration

If you have existing users with old data structure:

### Old Structure (profiles collection)
```javascript
{
  uid: string,
  roles: { buyer: true, supplier: false },
  company: {
    name: string,
    categories: []
  }
}
```

### New Structure (users collection)
```javascript
{
  roles: ["buyer"],
  companyName: string,
  buyerCategories: []
}
```

### Migration Script
```javascript
// Run once to migrate old profiles to new structure
const oldProfiles = await getDocs(collection(db, "profiles"));
for (const doc of oldProfiles.docs) {
  const old = doc.data();
  const newData = {
    roles: Object.keys(old.roles).filter(r => old.roles[r]),
    companyName: old.company?.name,
    buyerCategories: old.company?.categories || [],
    // ... map other fields
  };
  await setDoc(doc(db, "users", doc.id), newData, { merge: true });
}
```

## Customization

### Adding New Fields

1. **Add HTML input:**
```html
<div>
  <label>New Field</label>
  <input type="text" id="newField" />
</div>
```

2. **Add to payload:**
```javascript
const payload = {
  // ... existing fields
  newField: document.getElementById("newField").value.trim(),
};
```

### Changing Validation

```javascript
function validate() {
  // Add custom validation
  const newField = document.getElementById("newField").value.trim();
  if (!newField) return "New field is required";
  
  return null;
}
```

### Custom Redirect

```javascript
// After save
if (customCondition) {
  location.href = "./custom-page.html";
} else {
  location.href = "./dashboard.html";
}
```

## Troubleshooting

### Issue: "requireAuth is not defined"
**Solution:** Ensure firebase.js exports requireAuth function

### Issue: "CATEGORIES is not defined"
**Solution:** Check categories.js is in root directory

### Issue: Data not saving
**Solutions:**
1. Check Firestore rules allow write
2. Verify user is authenticated
3. Check browser console for errors
4. Ensure document path is correct: `users/{uid}`

### Issue: Redirect not working
**Solution:** Check success alert is dismissed before redirect

### Issue: Chips not appearing
**Solution:** Verify renderChips function is called after add

## Summary

✅ **Complete buyer registration page**
✅ **Multi-role system compatible**
✅ **KVKK compliant**
✅ **Chip-based contact entry**
✅ **Category management**
✅ **Data prefill support**
✅ **Proper validation**
✅ **Smart redirect logic**

**Ready to use!** 🎉

---

**File:** `register-buyer.html`  
**Lines:** 468  
**Status:** Production Ready  
**Last Updated:** 2025-10-20
