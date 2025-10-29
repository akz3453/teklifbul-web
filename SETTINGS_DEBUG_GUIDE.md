# Settings Page Debug Guide

## Issues Found and Fixed

### Issue 1: Logout Button Not Working ✅ FIXED
**Problem:** The logout button `onclick` handler was missing in `demands.html`

**Solution:** Added logout handler to demands.html header script:
```javascript
document.getElementById("logoutBtn").onclick = async () => {
  await logout();
  location.href = "./index.html";
};
```

**Status:** ✅ Fixed in demands.html

---

### Issue 2: Old catInput Reference ✅ FIXED
**Problem:** Code referenced old `catInput` element that was removed during multi-role implementation

**Solution:** Removed the legacy event listener since we now use `supplierCatInput` and `buyerCatInput`

**Status:** ✅ Fixed in settings.html

---

## Testing Checklist for Settings Page

### Test 1: Basic Save
- [ ] Open settings.html
- [ ] Fill in company name: "Test Company"
- [ ] Fill in tax number: "1234567890"
- [ ] Click "Değişiklikleri Kaydet"
- [ ] Check browser console for errors
- [ ] Verify success message appears
- [ ] Check Firestore console for saved data

### Test 2: Bank Accounts
- [ ] Click "+ Hesap Ekle"
- [ ] Fill in bank details:
  - Bank name: "Test Bank"
  - IBAN: "TR330006100519786457841326"
  - Account name: "Test Account"
  - Currency: "TRY"
- [ ] Click save
- [ ] Verify bank account saved in Firestore

### Test 3: Categories
- [ ] Check "Tedarikçi" role
- [ ] Type "Elektrik" in supplier categories
- [ ] Press Enter
- [ ] Verify chip appears
- [ ] Click save
- [ ] Check Firestore for supplierCategories array

### Test 4: Logout Button
- [ ] Click "Çıkış" button in header
- [ ] Verify redirects to index.html
- [ ] Verify logged out (can't access protected pages)

---

## Common Issues and Solutions

### Issue: "Cannot read property 'value' of null"
**Cause:** Element ID mismatch or element not found
**Solution:** Check browser console for specific element ID, verify HTML has matching id

### Issue: Bank accounts not saving
**Cause:** IBAN validation might be failing
**Debug:**
1. Open browser console (F12)
2. Try to save
3. Look for error message
4. Check if IBAN format is correct: TR + 24 digits

### Issue: Categories not appearing
**Cause:** Chip rendering issue or role not selected
**Debug:**
1. Check if role checkbox is selected
2. Verify section visibility (should be display:block)
3. Check console for errors

### Issue: "User not authenticated"
**Cause:** Session expired or not logged in
**Solution:** Logout and login again

---

## Debug Mode

To enable detailed logging, add this to browser console:

```javascript
// Enable Firebase debug mode
localStorage.setItem('debug', 'firestore:*');

// Check current user
console.log('Current user:', firebase.auth().currentUser);

// Check form values
console.log('Company name:', document.getElementById('companyName').value);
console.log('Tax number:', document.getElementById('taxNumber').value);
```

---

## Firestore Data Structure

After saving, check Firestore for this structure:

```javascript
users/{uid}
{
  roles: ["buyer"] or ["supplier"] or ["buyer", "supplier"],
  isPremium: false,
  companyName: "Test Company",
  taxNumber: "1234567890",
  contactEmails: [...],
  contactPhones: [...],
  supplierCategories: [...],
  buyerCategories: [...],
  bankAccounts: [
    {
      bankName: "Test Bank",
      iban: "TR330006100519786457841326",
      accountName: "Test Account",
      currency: "TRY"
    }
  ],
  updatedAt: Timestamp
}
```

---

## Browser Console Commands

### Check if user is authenticated:
```javascript
import('./firebase.js').then(m => console.log(m.auth.currentUser));
```

### Manually trigger save (for debugging):
```javascript
document.getElementById('saveBtn').click();
```

### Check form elements:
```javascript
console.log({
  companyName: document.getElementById('companyName'),
  taxNumber: document.getElementById('taxNumber'),
  bankBody: document.getElementById('bankBody'),
  saveBtn: document.getElementById('saveBtn')
});
```

---

## Next Steps

1. **Test the fixes:**
   - Open settings.html
   - Try to save data
   - Check if data appears in Firestore

2. **Test logout:**
   - Click logout on each page
   - Verify redirect to index.html

3. **Report any remaining issues:**
   - Include browser console errors
   - Include network tab errors (F12 → Network)
   - Include steps to reproduce

---

## Files Modified

1. **settings.html**
   - ✅ Removed old catInput reference
   - ✅ Logout already working (was already imported)

2. **demands.html**
   - ✅ Added logout button handler

---

**Status:** Ready for testing
**Date:** 2025-10-20
