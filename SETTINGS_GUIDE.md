# Settings (Profile Editing) Feature - Implementation Guide

## Overview
Complete profile management system for Teklifbul with supplier categories, bank/IBAN management, and tax certificate upload.

## Features Implemented

### 1. Profile Settings Page (settings.html)

**Access**: "⚙️ Ayarlar" link in header of all pages

**Sections**:
- Firma Bilgileri (Company Information)
- İletişim Bilgileri (Contact Information)
- Tedarikçi Kategorileri (Supplier Categories - conditional)
- Vergi Levhası (Tax Certificate Upload)
- Banka Hesapları (Bank Accounts with IBAN validation)
- KVKK & Onaylar (KVKK Consent Display)

---

## Data Model

### users/{uid} Document Structure

```javascript
{
  // Identity & Company
  displayName: string|null,          // Optional display name
  role: "supplier" | "buyer",        // User role
  companyName: string,                // Required: Company name
  taxNumber: string,                  // Required: Tax number (10 digits)
  mersisNo: string|null,             // Optional: MERSIS number (16 digits)
  address: string|null,              // Company address
  website: string|null,              // Company website URL
  
  // Contact
  contactEmails: string[],           // Multiple email addresses (chip input)
  contactPhones: string[],           // Multiple phone numbers (chip input)
  
  // Supplier-specific
  categories: string[],              // Supplier categories (required if role=supplier)
  
  // Documents
  taxCertificatePath: string|null,   // Storage path to tax certificate
  
  // Banking
  bankAccounts: [                    // Multiple bank accounts
    {
      bankName: string,              // Bank name
      iban: string,                  // Turkish IBAN (TR + 24 digits)
      accountName: string,           // Account holder name
      currency: "TRY"|"USD"|"EUR"|"GBP"  // Currency
    }
  ],
  
  // KVKK Compliance (read-only in settings)
  kvkkConsent: boolean,
  marketingConsent: boolean,
  consentAt: Timestamp,
  
  // Multi-company support
  companies: string[]|null,
  activeCompanyId: string|null,
  
  // Timestamps
  updatedAt: Timestamp,
  createdAt: Timestamp
}
```

---

## Feature Details

### 1. Firma Bilgileri (Company Information)

**Fields**:
- **Rol**: Radio buttons (Buyer / Supplier)
  - Changes visibility of supplier categories section
  - Validates category requirement for suppliers
  
- **Görünen Ad**: Optional display name for user
  
- **Şirket Adı** ⭐ (Required): Company name
  
- **Vergi No** ⭐ (Required): 10-digit tax number
  
- **MERSİS No**: Optional 16-digit MERSIS number
  
- **Web Sitesi**: Company website URL
  
- **Adres**: Multi-line company address

**Validation**:
- Company name and tax number are mandatory
- Form cannot be saved without these fields

---

### 2. İletişim Bilgileri (Contact Information)

**Multiple Email Addresses**:
- Chip-based input system
- Type email → Press Enter to add
- Email validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Click "✕" on chip to remove
- Saved to `contactEmails[]` array

**Multiple Phone Numbers**:
- Chip-based input system
- Type phone → Press Enter to add
- No specific format validation (international support)
- Click "✕" on chip to remove
- Saved to `contactPhones[]` array

**Use Case**: Companies often have multiple contact points (sales, procurement, technical)

---

### 3. Tedarikçi Kategorileri (Supplier Categories)

**Visibility**: Only shown when `role === "supplier"`

**Category Selection**:
- Uses shared `CATEGORIES` constant from `categories.js`
- 17 predefined categories:
  - Sac/Metal, Elektrik, Elektronik, Makine-İmalat, Hırdavat
  - Ambalaj, Kimyasal, İnşaat Malzemeleri, Mobilya, Boya
  - Plastik, Otomotiv Yan Sanayi, İş Güvenliği, Temizlik
  - Gıda, Hizmet, Lojistik

**Input Method**:
- Datalist with autocomplete
- Type category name → Press Enter to add
- Can add custom categories not in list
- Chip-based display with removal

**Validation**:
- **Suppliers must select at least one category**
- Form shows error if supplier has no categories

**Integration with Demand Targeting**:
- Categories determine which demands supplier receives
- When buyer creates demand with category "Makine-İmalat"
- System finds all suppliers with "Makine-İmalat" in categories
- Adds supplier UIDs to demand's `viewerIds` array

---

### 4. Vergi Levhası (Tax Certificate Upload)

**File Upload**:
- Accepted formats: PDF, PNG, JPG, JPEG
- Max file size: 5MB
- Upload to Firebase Storage: `suppliers/{uid}/{timestamp}-{filename}`

**Storage Path**:
- Saved to `users/{uid}.taxCertificatePath`
- Example: `suppliers/abc123/1729276800000-vergi-levhasi.pdf`

**Display**:
- If file exists: "✓ Yüklü dosya: vergi-levhasi.pdf"
- Shows only filename (not full path)

**Update Flow**:
1. Select new file
2. Click "Kaydet"
3. Old file path overwritten (old file remains in Storage)
4. New file uploaded with new timestamp

**Validation**:
- File size check before upload
- Alert if > 5MB

---

### 5. Banka Hesapları (Bank Accounts)

**Multiple Bank Accounts**:
- Dynamic table rows
- Add unlimited accounts
- Each row has: Bank Name, IBAN, Account Name, Currency
- Delete button per row

**Fields per Account**:
```javascript
{
  bankName: string,       // e.g., "Ziraat Bankası"
  iban: string,           // e.g., "TR12 3456 7890 1234 5678 9012 34"
  accountName: string,    // e.g., "TEKLİFBUL A.Ş."
  currency: "TRY"|"USD"|"EUR"|"GBP"
}
```

**IBAN Validation** (Turkish IBAN):

```javascript
function isValidTRIBAN(iban) {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  
  // Format: TR + 24 digits = 26 characters
  if (!/^TR\d{24}$/.test(s)) return false;
  
  // MOD-97 algorithm
  const rearr = s.slice(4) + s.slice(0, 4);  // Move TR to end
  const converted = rearr.replace(/[A-Z]/g, ch => 
    (ch.charCodeAt(0) - 55).toString()       // T=29, R=27
  );
  
  // Calculate MOD 97 for large number
  let total = '';
  for (let i = 0; i < converted.length; i += 7) {
    total = (parseInt(total + converted.slice(i, i + 7), 10) % 97).toString();
  }
  
  return parseInt(total, 10) === 1;
}
```

**Validation Rules**:
- IBAN must start with "TR"
- Must be exactly 26 characters (TR + 24 digits)
- Must pass MOD-97 checksum
- Spaces are automatically removed
- Case-insensitive (converted to uppercase)

**Error Handling**:
- Invalid IBAN: Alert with message "Geçersiz TR IBAN: {iban}"
- Throws error to prevent form submission
- User must correct before saving

**Currency Support**:
- TRY (Turkish Lira)
- USD (US Dollar)
- EUR (Euro)
- GBP (British Pound)

**Use Case**: Companies need different accounts for different currencies

---

### 6. KVKK & Onaylar (KVKK Consent Display)

**Read-Only Section**:
- Displays existing KVKK consent status
- Cannot be changed in settings (set during registration)

**Display Format**:
- If consent given: "KVKK Onayı Verildi: 18.10.2025 14:30:45"
- If no consent: "KVKK onayı bulunmuyor (kayıt sırasında alınmalıdır)"

**Fields Referenced**:
- `kvkkConsent`: boolean
- `marketingConsent`: boolean (not displayed)
- `consentAt`: Timestamp (displayed if consent=true)

---

## User Interface

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│ Header (common across all pages)               │
│ ⚙️ Ayarlar | Firma: [Dropdown] | user@mail.com │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Hesap Ayarları                                  │
│ Profil bilgilerinizi güncelleyin...            │
├─────────────────────────────────────────────────┤
│ Firma Bilgileri                                 │
│ ├─ Rol: ○ Buyer ● Supplier                    │
│ ├─ Şirket Adı: [___________]                  │
│ ├─ Vergi No: [___________]                    │
│ └─ ... (other company fields)                 │
├─────────────────────────────────────────────────┤
│ İletişim Bilgileri                             │
│ ├─ E-postalar: [chip][chip]                   │
│ └─ Telefonlar: [chip][chip]                   │
├─────────────────────────────────────────────────┤
│ Tedarikçi Kategorileri (if supplier)           │
│ └─ [chip][chip][chip]                          │
├─────────────────────────────────────────────────┤
│ Vergi Levhası                                   │
│ └─ [Choose File] [Upload]                     │
├─────────────────────────────────────────────────┤
│ Banka Hesapları                                 │
│ ├─ Table: Bank | IBAN | Name | Currency | Del │
│ └─ [+ Hesap Ekle]                              │
├─────────────────────────────────────────────────┤
│ KVKK & Onaylar                                  │
│ └─ KVKK Onayı Verildi: ...                    │
├─────────────────────────────────────────────────┤
│           [İptal] [Değişiklikleri Kaydet]      │
└─────────────────────────────────────────────────┘
```

### Chip Input System

**Visual Design**:
```
E-posta Adresleri
┌─────────────────────────────────────┐
│ Type email and press Enter...      │
└─────────────────────────────────────┘
[info@teklifbul.com ✕] [sales@company.com ✕]
```

**Interaction**:
1. Type value in input
2. Press Enter
3. Value validated (for emails)
4. Chip created with "✕" button
5. Click ✕ to remove
6. Input cleared for next entry

---

## Workflow Examples

### Example 1: Supplier Updates Categories

**Scenario**: Supplier expands business to new product lines

1. Navigate to **⚙️ Ayarlar** from header
2. Settings page loads with existing profile
3. Scroll to **Tedarikçi Kategorileri** section
4. Current categories displayed as chips: [Makine-İmalat ✕] [Elektrik ✕]
5. Type "Plastik" in input
6. Press Enter → New chip: [Plastik ✕]
7. Type "Kimyasal"
8. Press Enter → New chip: [Kimyasal ✕]
9. Click **Kaydet**
10. Firestore updated: `categories: ["Makine-İmalat", "Elektrik", "Plastik", "Kimyasal"]`
11. Future demands with these categories will include this supplier

**Result**: Supplier now receives demands for 4 categories instead of 2

---

### Example 2: Add Multiple Bank Accounts

**Scenario**: Company needs TRY and USD accounts

1. Open **Ayarlar**
2. Scroll to **Banka Hesapları**
3. First row (TRY account):
   - Bank: "Ziraat Bankası"
   - IBAN: "TR12 0001 0000 0000 1234 5678 90"
   - Account: "TEKLİFBUL A.Ş."
   - Currency: TRY
4. Click **+ Hesap Ekle**
5. Second row (USD account):
   - Bank: "İş Bankası"
   - IBAN: "TR98 0006 4000 0000 9876 5432 10"
   - Account: "TEKLİFBUL A.Ş. USD"
   - Currency: USD
6. Click **Kaydet**
7. IBAN validation runs for both
8. Both IBANs valid → Save successful
9. Firestore: `bankAccounts: [{...TRY}, {...USD}]`

**Result**: Buyers can see payment options in both currencies

---

### Example 3: Upload Tax Certificate

**Scenario**: New user needs to add tax certificate

1. Open **Ayarlar**
2. Scroll to **Vergi Levhası**
3. Current status: No file displayed
4. Click **Choose File**
5. Select: `vergi-levhasi-2025.pdf` (2.3 MB)
6. File selected (not yet uploaded)
7. Click **Kaydet** (main save button)
8. Upload process:
   - Check file size: 2.3 MB < 5 MB ✓
   - Generate path: `suppliers/{uid}/1729276800000-vergi-levhasi-2025.pdf`
   - Upload to Firebase Storage
   - Save path to Firestore
9. Success alert: "✅ Bilgileriniz başarıyla güncellendi!"
10. Return to dashboard
11. Next time opening settings: "✓ Yüklü dosya: vergi-levhasi-2025.pdf"

**Result**: Tax certificate stored and path saved to profile

---

### Example 4: IBAN Validation Error

**Scenario**: User enters invalid IBAN

1. Add bank account
2. Enter IBAN: "TR12 3456 7890 1234" (too short)
3. Click **Kaydet**
4. Validation runs:
   ```javascript
   isValidTRIBAN("TR12345678901234") 
   // Returns false (only 16 digits, need 24)
   ```
5. Alert: "❌ Geçersiz TR IBAN: TR12345678901234"
6. Form submission cancelled
7. User corrects IBAN: "TR12 3456 7890 1234 5678 9012 34"
8. Click **Kaydet** again
9. Validation passes ✓
10. Save successful

**Result**: Only valid IBANs are saved to database

---

## Integration with Existing Features

### 1. Category-Based Demand Targeting

**Before** (demand-new.html):
```javascript
// Query suppliers by categories
const suppliersQ = query(
  collection(db, "users"),
  where("role", "==", "supplier"),
  where("categories", "array-contains-any", categoryTags)
);
```

**After Settings Update**:
- Supplier updates categories in settings
- `users/{uid}.categories` updated
- Next demand creation with matching category
- Supplier automatically included in `viewerIds`

### 2. Multi-Company Support

**Settings page includes company selector header**:
- Same header as dashboard/demands/detail pages
- User can switch active company
- Settings saved to user document (not company-specific)
- Future enhancement: Company-specific profiles

### 3. KVKK Consent Tracking

**Registration** (role-select.html):
- User gives KVKK consent during signup
- `kvkkConsent: true`, `consentAt: Timestamp`

**Settings** (settings.html):
- Display only (read-only)
- Shows when consent was given
- Cannot be revoked via settings (by design)

---

## Security & Firestore Rules

### Existing Rules (Sufficient)

```javascript
match /users/{uid} {
  // User can read/write their own document
  allow read, write: if request.auth != null && request.auth.uid == uid;
  
  // Supplier profiles readable by anyone (for targeting)
  allow read: if isSignedIn() && resource.data.role == "supplier";
}
```

**No changes needed** - users can already update their own documents

### Storage Rules (Existing)

```javascript
match /suppliers/{uid}/{allPaths=**} {
  allow write: if request.auth != null && request.auth.uid == uid;
  allow read: if request.auth != null;
}
```

**Tax certificates** upload to `suppliers/{uid}/...` - already covered

---

## Testing Checklist

### ✅ Test 1: Load Existing Profile
1. Login with existing user
2. Navigate to **Ayarlar**
3. All fields populated from Firestore
4. Emails/phones/categories shown as chips
5. Bank accounts listed in table
6. Tax certificate status displayed

**Expected**: Settings page loads with all existing data

---

### ✅ Test 2: Update Company Info
1. Change company name to "YENİ ŞİRKET A.Ş."
2. Update tax number to "1234567890"
3. Add MERSIS: "0123456789012345"
4. Click **Kaydet**
5. Check Firestore: `users/{uid}`

**Expected**:
```javascript
{
  companyName: "YENİ ŞİRKET A.Ş.",
  taxNumber: "1234567890",
  mersisNo: "0123456789012345",
  updatedAt: [NEW TIMESTAMP]
}
```

---

### ✅ Test 3: Supplier Categories (Required)
1. Set role to **Supplier**
2. Categories section appears
3. Remove all categories (empty)
4. Click **Kaydet**
5. Alert: "❌ Tedarikçi için en az bir kategori seçmelisiniz."
6. Add "Elektrik" category
7. Click **Kaydet**
8. Success ✓

**Expected**: Cannot save supplier profile without categories

---

### ✅ Test 4: Multiple Email Chip Input
1. Type "info@company.com" → Press Enter
2. Chip appears: [info@company.com ✕]
3. Type "sales@company.com" → Press Enter
4. Second chip: [sales@company.com ✕]
5. Type "invalid-email" → Press Enter
6. Alert: "Geçerli bir e-posta adresi giriniz"
7. Click ✕ on first chip
8. First chip removed
9. Click **Kaydet**
10. Firestore: `contactEmails: ["sales@company.com"]`

**Expected**: Email validation works, chips add/remove correctly

---

### ✅ Test 5: IBAN Validation (Valid)
1. Add bank row
2. Enter:
   - Bank: "Garanti BBVA"
   - IBAN: "TR33 0006 1005 1978 6457 8413 26"
   - Account: "TEST ŞİRKET"
   - Currency: TRY
3. Click **Kaydet**
4. Validation: MOD-97 check passes ✓
5. Save successful

**Expected**: Valid Turkish IBAN accepted

---

### ✅ Test 6: IBAN Validation (Invalid)
1. Enter IBAN: "TR33 0006 1005 1978 6457 8413 27" (wrong checksum)
2. Click **Kaydet**
3. MOD-97 check fails
4. Alert: "❌ Geçersiz TR IBAN: TR33000610051978645784132 7"
5. Form not saved

**Expected**: Invalid IBAN rejected

---

### ✅ Test 7: Tax Certificate Upload
1. Click **Choose File**
2. Select 3MB PDF file
3. Click **Kaydet**
4. File uploads to Storage
5. Path saved: `suppliers/abc123/1729276800000-vergi.pdf`
6. Success message
7. Re-open settings
8. Display: "✓ Yüklü dosya: vergi.pdf"

**Expected**: File uploaded and path saved

---

### ✅ Test 8: File Size Validation
1. Select 8MB file (too large)
2. Click **Kaydet**
3. Alert: "❌ Dosya boyutu 5MB'dan küçük olmalıdır."
4. Save cancelled

**Expected**: Files > 5MB rejected

---

### ✅ Test 9: Multiple Bank Accounts
1. Add 3 bank rows:
   - TRY account
   - USD account
   - EUR account
2. Fill all fields with valid IBANs
3. Click **Kaydet**
4. Firestore: `bankAccounts: [{...}, {...}, {...}]` (3 items)

**Expected**: All 3 accounts saved

---

### ✅ Test 10: Remove Bank Account
1. Have 2 bank rows
2. Click **Sil** on first row
3. Row removed from table
4. Click **Kaydet**
5. Firestore: Only 1 account saved

**Expected**: Deleted rows not saved

---

## Navigation Updates

### Settings Link Added to All Pages

**Dashboard** (`dashboard.html`):
```html
<a href="./settings.html">⚙️ Ayarlar</a>
```

**Demands** (`demands.html`):
```html
<a href="./settings.html">⚙️ Ayarlar</a>
```

**Demand New** (`demand-new.html`):
```html
<a href="./settings.html">⚙️ Ayarlar</a>
```

**Demand Detail** (`demand-detail.html`):
```html
<a href="./settings.html">⚙️ Ayarlar</a>
```

**Settings** (`settings.html`):
- Header includes links back to Dashboard, Demands
- Cancel button → Dashboard
- Save button → Dashboard (after success)

---

## Error Handling

### Client-Side Validation

1. **Required Fields**:
   - Company name missing → Alert
   - Tax number missing → Alert
   - Supplier with no categories → Alert

2. **Email Format**:
   - Invalid email → Alert, not added to chips

3. **IBAN Validation**:
   - Wrong format → Alert
   - Failed MOD-97 → Alert, save prevented

4. **File Size**:
   - File > 5MB → Alert, upload prevented

### Server-Side Protection

1. **Firestore Rules**:
   - Only owner can update their profile
   - Prevents unauthorized changes

2. **Storage Rules**:
   - Only owner can upload to their supplier folder
   - Prevents file overwrite by others

---

## Future Enhancements

### 1. Company-Specific Profiles
- Allow different profiles per company
- Switch profile when switching active company
- Store in `companies/{companyId}/profile`

### 2. IBAN Auto-Format
- Add spaces automatically: TR33 0006 1005...
- Visual feedback for valid/invalid IBAN

### 3. Tax Certificate Preview
- Download/view uploaded certificate
- In-browser PDF preview
- Delete old certificate option

### 4. Contact Person Management
- Associate names with email/phone chips
- Title/role for each contact
- Primary contact designation

### 5. Category Auto-Suggest
- Based on company name/industry
- ML-based category recommendations
- Popular category combinations

### 6. Bank Account Verification
- Send test micro-transactions
- Verify account ownership
- Mark accounts as "verified"

---

## Summary

✅ **Completed Features**:
- Complete profile editing interface
- Multi-email/phone chip input system
- Supplier category management (17 categories)
- Tax certificate upload to Firebase Storage
- Multiple bank account management
- Turkish IBAN validation (MOD-97 algorithm)
- KVKK consent display
- Integration with existing company selector
- Settings link in all page headers
- Comprehensive validation and error handling

**Files Created**:
- `settings.html` - Complete settings page

**Files Modified**:
- `dashboard.html` - Added ⚙️ Ayarlar link
- `demands.html` - Added ⚙️ Ayarlar link
- `demand-new.html` - Added ⚙️ Ayarlar link
- `demand-detail.html` - Added ⚙️ Ayarlar link

**Ready for Production** 🚀
