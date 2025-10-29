# Dashboard + Company Selector + TCMB FX + Multiple Discounts - Deployment Guide

## Overview
This guide covers the deployment and usage of the new dashboard features implemented in the Teklifbul application.

## Features Implemented

### 1. Dashboard (dashboard.html)
- **Metrics Cards**: Shows counts for incoming demands, sent demands, and draft demands
- **Recent Demands Table**: Displays last 5 demands with quick links
- **TCMB FX Widget**: Real-time USD/TRY and EUR/TRY exchange rates
- **Quick Actions**: Links to create new demand and view all demands
- **Clickable Metrics**: Each metric card redirects to filtered views

### 2. Common Header with Company Selector
Added to all main pages: `dashboard.html`, `demands.html`, `demand-new.html`, `demand-detail.html`

**Features**:
- Real-time clock showing Turkish locale time
- Company dropdown selector
- User email display
- Logout button
- Persistent company selection (localStorage)

### 3. Multi-Company Support

**Data Model**:
```javascript
// users/{uid}
{
  displayName: string|null,
  activeCompanyId: string|null,   // Currently selected company
  companies: string[]             // Array of company IDs user has access to
}

// companies/{companyId}
{
  name: string,                   // Company name
  taxNumber: string|null,
  createdAt: Timestamp
}
```

**Default Behavior**:
- If user has no companies, a default "Kendi Firmam" company is auto-created
- Company selection is saved to localStorage and Firestore
- Changing company triggers page reload

### 4. Multiple Discount Fields in Bid Form

**New Bid Form Structure** (demand-detail.html):
- **Liste Fiyatı** (List Price): Base price input
- **5 İskonto Fields**: discount1 through discount5 (percentage, 0-100)
- **Net Fiyat**: Auto-calculated net price display
- **Automatic Calculation**: Updates in real-time as discounts are entered

**Calculation Logic**:
```javascript
netPrice = listPrice × (1 - d1/100) × (1 - d2/100) × ... × (1 - d5/100)
```

**Bid Document Schema**:
```javascript
{
  demandId: string,
  priceList: number,
  discount1: number,
  discount2: number,
  discount3: number,
  discount4: number,
  discount5: number,
  netPrice: number,
  price: number,  // Same as netPrice, used for sorting
  leadTimeDays: number,
  brand: string|null,
  paymentTerms: string|null,
  supplierId: string,
  createdAt: Timestamp
}
```

### 5. TCMB Exchange Rates Cloud Function

**Function Name**: `fx`

**Endpoint**: `/fx` (via Firebase Hosting rewrite)

**Response Format**:
```json
{
  "USD": "34.5678",
  "EUR": "37.1234",
  "asOf": "2025-10-18"
}
```

**Features**:
- Fetches real-time rates from TCMB XML API
- CORS-enabled for frontend access
- Auto-refresh every 60 seconds on dashboard
- Graceful error handling with fallback display

## Deployment Steps

### Step 1: Install Cloud Functions Dependencies

```bash
cd functions
npm install
```

This installs:
- `firebase-functions` v4.5.0
- `firebase-admin` v11.11.0
- `node-fetch` v2.7.0
- `cors` v2.8.5

### Step 2: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

**New Rules Added**:
```javascript
// companies collection
match /companies/{companyId} {
  allow read: if isSignedIn();
  allow create: if isSignedIn();
  allow update, delete: if isSignedIn();
}
```

### Step 3: Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

**Composite Indexes**:
1. `demands` collection: `createdBy (ASC) + createdAt (DESC)`
2. `demands` collection: `viewerIds (ARRAY_CONTAINS) + createdAt (DESC)`

### Step 4: Deploy Cloud Function

```bash
firebase deploy --only functions:fx
```

**Expected Output**:
```
✔  functions[fx(us-central1)] Successful update operation.
Function URL: https://us-central1-YOUR-PROJECT.cloudfunctions.net/fx
```

### Step 5: Deploy Hosting (Optional)

If using Firebase Hosting with rewrites:

```bash
firebase deploy --only hosting
```

The `firebase.json` includes a rewrite rule:
```json
{
  "source": "/fx",
  "function": "fx"
}
```

This allows calling the function via `/fx` instead of the full Cloud Function URL.

### Step 6: Update FX URL (If Not Using Hosting)

If you're **NOT** using Firebase Hosting, update `dashboard.html`:

```javascript
// Change from:
const FX_URL = "/fx";

// To:
const FX_URL = "https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/fx";
```

## Testing the Implementation

### 1. Test Dashboard Access

1. Login at `index.html`
2. Should auto-redirect to `dashboard.html`
3. Verify all metrics display correctly:
   - Gelen Talepler
   - Gönderdiğim Talepler
   - Taslak Talepler
   - TCMB Kurları

### 2. Test Company Selector

1. On dashboard, check company dropdown
2. Should show "Kendi Firmam" by default (if no companies)
3. Select a different company → page should reload
4. Check localStorage: `activeCompanyId` should be set
5. Verify header appears on all pages (demands, demand-new, demand-detail)

### 3. Test Multiple Discounts

1. Navigate to a published demand (as supplier)
2. Scroll to "Teklif Ver" form
3. Enter a list price (e.g., 1000)
4. Add discounts:
   - İskonto 1: 10% → Net: 900
   - İskonto 2: 5% → Net: 855
   - İskonto 3: 2% → Net: 837.90
5. Verify net price updates automatically
6. Submit bid
7. Verify bid saved with all discount fields in Firestore

### 4. Test TCMB FX Widget

1. Open browser DevTools → Network tab
2. Navigate to dashboard
3. Check for `/fx` request
4. Verify response contains USD and EUR values
5. Check that values update (wait 60 seconds or reload)

**Troubleshooting**:
- If FX shows "-", check Cloud Function deployment
- If CORS error, verify `cors` package installed
- If 404, check Firebase Hosting rewrite configuration

### 5. Test Navigation Flow

1. Login → Dashboard ✅
2. Dashboard → Click "Gelen Talepler" → demands.html with filter
3. Dashboard → Click "+ Yeni Talep" → demand-new.html
4. Dashboard → Click demand title → demand-detail.html
5. Any page → Click "← Dashboard" → Return to dashboard

## Data Migration Notes

### Existing Demands
- Old demands without `biddingMode` default to "secret"
- No data migration needed for existing demands

### Existing Bids
- Old bids will continue to work
- Only `price` field is required
- New bids will include discount fields

### User Accounts
- Existing users will auto-create "Kendi Firmam" company on first dashboard visit
- User document updated with `companies` array and `activeCompanyId`

## Future Enhancements

### Company-Based Filtering (Optional)
To filter demands by company:

1. Add `companyId` field to demands document:
```javascript
await addDoc(collection(db, "demands"), {
  // ... existing fields
  companyId: activeCompanyId,
  createdBy: user.uid
});
```

2. Update queries in `demands.html`:
```javascript
const qSent = query(
  collection(db, "demands"),
  where("createdBy", "==", uid),
  where("companyId", "==", activeCompanyId)  // Add this
);
```

3. Create new Firestore index:
```json
{
  "fields": [
    {"fieldPath": "createdBy", "order": "ASCENDING"},
    {"fieldPath": "companyId", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "DESCENDING"}
  ]
}
```

### Enhanced FX Widget
- Add more currencies (GBP, CHF, JPY)
- Historical rate charts
- Rate change indicators (up/down arrows)
- Custom refresh intervals per user preference

### Discount Presets
- Save common discount combinations as templates
- Quick apply "Standart İskonto" button
- Company-specific discount policies

## File Changes Summary

### New Files Created
- `dashboard.html` - Main dashboard page
- `functions/index.js` - Cloud Function for FX rates
- `functions/package.json` - Function dependencies
- `firebase.json` - Firebase configuration
- `firestore.indexes.json` - Composite indexes

### Modified Files
- `index.html` - Redirects to dashboard after login
- `demands.html` - Added common header
- `demand-new.html` - Added common header
- `demand-detail.html` - Added header + multiple discount fields
- `firestore.rules` - Added companies collection rules

## Support & Troubleshooting

### Common Issues

**Issue**: Dashboard shows 0 for all metrics
- **Solution**: Check Firestore security rules and composite indexes

**Issue**: FX rates show "-"
- **Solution**: Check Cloud Function logs: `firebase functions:log`

**Issue**: Company selector is empty
- **Solution**: Check browser console, verify user document exists

**Issue**: Net price not calculating
- **Solution**: Verify all discount inputs have `type="number"`

**Issue**: Old bids don't show prices
- **Solution**: Old bids only have `price` field, new ones have `netPrice`

### Debug Commands

```bash
# Check Cloud Function logs
firebase functions:log

# Test FX function locally
curl http://localhost:5001/YOUR-PROJECT/us-central1/fx

# Check Firestore indexes status
firebase firestore:indexes

# Validate Firestore rules
firebase deploy --only firestore:rules --dry-run
```

## Conclusion

All features have been successfully implemented and are ready for deployment. Follow the deployment steps above to activate the new dashboard functionality.

For questions or issues, check the browser console and Cloud Function logs first.
