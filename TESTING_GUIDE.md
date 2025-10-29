# Testing Guide: Complete Flow Test

This guide walks you through testing the complete supplier registration and automatic targeting system.

## Prerequisites

Before testing, ensure:

1. ✅ Firestore rules deployed (see `RULES_DEPLOYMENT.md`)
2. ✅ Storage rules deployed
3. ✅ Firebase Auth authorized domains include `localhost` and `127.0.0.1`
4. ✅ App Check is either disabled or properly configured
5. ✅ Required Firestore indexes created

## Test Scenario 1: Supplier Registration

### Step 1: Create Supplier Account

1. Navigate to `signup.html`
2. Register with email: `supplier1@test.com`, password: `test123`
3. Click "Kayıt Ol"
4. **Expected**: Redirected to `role-select.html`

### Step 2: Complete Supplier Profile

1. On role-select page, click "Tedarikçi" button
2. Fill in the form:
   - **Şirket Adı**: ABC Elektrik A.Ş.
   - **Vergi No**: 1234567890
   - **MERSİS No**: 0123456789012345
   - **Adres**: İstanbul, Türkiye
   - **Web Sitesi**: https://www.abc-elektrik.com
   - **E-posta**: info@abc-elektrik.com (press Enter)
   - **Telefon**: +90 555 123 4567 (press Enter)
   - **Kategoriler**: Select "Elektrik" and "Elektronik" (press Enter after each)
   - **Vergi Levhası**: Upload a test image/PDF
   - **KVKK Onayı**: ✅ Check the required checkbox
   - **Pazarlama İzni**: (optional)

3. Click "Kaydet ve Devam Et"
4. **Expected**: 
   - Success message
   - Redirected to `demands.html`
   - Firestore `users/{uid}` document created with:
     - `role: "supplier"`
     - `categories: ["Elektrik", "Elektronik"]`
     - `contactEmails: ["info@abc-elektrik.com"]`
     - `kvkkConsent: true`

### Verify in Firebase Console

1. Go to Firestore Database
2. Navigate to `users` collection
3. Find the new user document
4. Verify all fields are populated correctly

## Test Scenario 2: Buyer Creates Demand

### Step 1: Create Buyer Account

1. Sign out (if needed)
2. Navigate to `signup.html`
3. Register with email: `buyer1@test.com`, password: `test123`
4. On role-select page, click "Alıcı" button
5. Fill in minimal buyer info:
   - **Şirket Adı**: XYZ İnşaat Ltd.
   - **Vergi No**: 9876543210
   - Check **KVKK Onayı**
6. Click "Kaydet ve Devam Et"

### Step 2: Create Demand with Matching Category

1. Click "+ Yeni Talep" button
2. Fill in demand form:
   - **STF No**: Click "Otomatik Oluştur"
   - **STF Tarihi**: (auto-filled to today)
   - **Başlık**: Elektrik Malzemeleri Alımı
   - **Açıklama**: 100m kablo, 50 adet priz
   - **Kategori**: Type "Elektrik" and press Enter
   - **Termin Tarihi**: Tomorrow's date
   - **Öncelik**: Fiyat
   - **Para Birimi**: TRY

3. Add line items:
   - Click "+ Satır Ekle"
   - **Malzeme Tanımı**: NYM 3x2.5 Kablo
   - **Miktar**: 100
   - **Birim**: m

4. Click "Talebi Oluştur"
5. **Expected**:
   - Success message
   - Redirected to demand detail page
   - Demand is in "Taslak" status
   - "Teklifler" section is HIDDEN (draft mode)

### Verify Automatic Targeting

1. Open Firebase Console → Firestore Database
2. Find the new demand document
3. **Expected fields**:
   - `createdBy`: Buyer's UID
   - `categoryTags`: ["Elektrik"]
   - `viewerIds`: [buyer_uid, supplier1_uid]
   - `published: false`

**Console log should show**:
```
Matching suppliers: 1
Updated viewerIds: 2
```

## Test Scenario 3: Publish Demand

### Step 1: Publish from Draft

1. As buyer, on demand detail page, click "Tedarikçilere Gönder"
2. Confirm in modal
3. **Expected**:
   - Status changes to "Gönderildi"
   - "Teklifler" section becomes VISIBLE (for owner)
   - "Teklif Ver" form remains HIDDEN (owner can't bid)
   - `sentAt` timestamp appears

## Test Scenario 4: Supplier Views and Bids

### Step 1: Supplier Login

1. Sign out
2. Sign in as `supplier1@test.com`
3. Navigate to `demands.html`
4. **Expected**: 
   - The published demand appears in the list
   - Draft demands do NOT appear

### Step 2: View Demand Details

1. Click on the demand
2. **Expected**:
   - Can see all demand details
   - "Teklifler" section is HIDDEN (supplier can't see other bids)
   - "Teklif Ver" form is VISIBLE

### Step 3: Submit Bid

1. Fill in bid form:
   - **Fiyat**: 5000
   - **Termin (gün)**: 7
   - **Marka**: KABLO A.Ş.
   - **Ödeme**: %30 peşin, %70 vadeli

2. Click "Teklif Gönder"
3. **Expected**:
   - Success message
   - Bid saved to Firestore `bids` collection
   - Form cleared

### Verify in Firebase Console

1. Go to `bids` collection
2. Find the new bid document
3. **Expected fields**:
   - `demandId`: matches the demand
   - `supplierId`: supplier's UID
   - `price: 5000`
   - `leadTimeDays: 7`

## Test Scenario 5: Cross-Check Permissions

### Test 1: Supplier Can't See Other Categories

1. As supplier1 (categories: Elektrik, Elektronik)
2. Buyer creates demand with category "Hırdavat"
3. **Expected**: Supplier1 does NOT see this demand in their list

### Test 2: Draft is Hidden from Suppliers

1. Buyer creates demand but doesn't publish
2. Supplier logs in
3. **Expected**: Draft demand does NOT appear in supplier's list

### Test 3: Owner Can See All Bids

1. Buyer logs in
2. Views the published demand
3. **Expected**: Can see all submitted bids in "Teklifler" table

## Test Scenario 6: Multiple Suppliers

### Step 1: Create Second Supplier

1. Register `supplier2@test.com`
2. Choose "Tedarikçi" role
3. Select categories: "Elektrik", "Makine-İmalat"

### Step 2: Create Demand with Multiple Categories

1. As buyer, create demand with categories: ["Elektrik", "Makine-İmalat"]
2. Publish the demand

### Expected Results

- Both supplier1 and supplier2 appear in `viewerIds`
- Both suppliers see the demand in their lists
- Both can submit bids independently

## Common Issues and Solutions

### Issue: Supplier doesn't see demand

**Check:**
- ✅ Demand is published (`published: true`)
- ✅ Supplier's `categories` overlaps with demand's `categoryTags`
- ✅ Supplier UID is in demand's `viewerIds` array
- ✅ Firestore index exists for `viewerIds` + `createdAt`

### Issue: Permission Denied

**Check:**
- ✅ Firestore rules are published
- ✅ User is authenticated
- ✅ `createdBy` field exists in demand document

### Issue: Categories not matching

**Check:**
- ✅ Both use exact same category names (case-sensitive)
- ✅ `categoryTags` is an array, not a string
- ✅ Supplier's `categories` field is populated

### Issue: File upload fails

**Check:**
- ✅ Storage rules are published
- ✅ File size < 10 MB
- ✅ Correct storage path format

## Performance Notes

- Firestore `array-contains-any` is limited to 10 items
- If demand has >10 categories, only first 10 are used for targeting
- Consider pagination for large demand lists
- Index creation can take a few minutes after first query

## Cleanup After Testing

To reset for fresh tests:

1. Delete test users from Firebase Auth
2. Delete test documents from Firestore collections
3. Delete uploaded files from Storage
4. Clear localStorage in browser

## Success Criteria

✅ Supplier registration saves all fields correctly
✅ KVKK consents are recorded with timestamp
✅ Buyer can create demands with categories
✅ Automatic targeting adds matching suppliers to viewerIds
✅ Published demands appear in supplier's list
✅ Draft demands are hidden from suppliers
✅ Suppliers can submit bids
✅ Owners can see all bids
✅ Suppliers can't see each other's bids
✅ File uploads work correctly
✅ Permissions are enforced properly

## Next Steps

After successful testing:

1. Deploy rules to production Firebase project
2. Set up proper KVKK privacy policy page
3. Configure email notifications for new demands
4. Implement bid comparison features
5. Add supplier rating system
