# Teklifbul - Complete Feature Workflow Guide

## 📋 Table of Contents
1. [User Registration & Company Setup](#user-registration--company-setup)
2. [Dashboard Navigation](#dashboard-navigation)
3. [Demand Creation with Categories](#demand-creation-with-categories)
4. [Bidding Modes & Time-Bound Phases](#bidding-modes--time-bound-phases)
5. [Multiple Discount Bidding](#multiple-discount-bidding)
6. [Company Selector Usage](#company-selector-usage)
7. [Complete User Journeys](#complete-user-journeys)

---

## 1. User Registration & Company Setup

### Buyer Registration Flow
1. Visit `signup.html` or `role-select.html`
2. Click "Alıcı/Talep Eden" button
3. Fill in form:
   - Company name
   - Tax number
   - Email(s) - chip input, press Enter to add
   - Phone(s) - chip input, press Enter to add
   - Tax certificate upload (optional)
   - KVKK consent checkboxes ✅
4. Submit → Creates:
   - User document in `users/{uid}`
   - Company document in `companies/{companyId}`
   - User's `companies` array with company ID
   - User's `activeCompanyId` set to new company

### Supplier Registration Flow
Same as buyer, plus:
5. Select category/categories from 17 options
6. Categories saved to user profile for automatic targeting

### Default Company Creation
- If user has no companies, "Kendi Firmam" is auto-created on first dashboard visit
- This ensures backward compatibility with existing users

---

## 2. Dashboard Navigation

### Landing Page After Login
- **URL**: `dashboard.html`
- Auto-redirected from `index.html` after successful login

### Dashboard Components

#### Metrics Cards (Clickable)
1. **Gelen Talepler**
   - Count: Demands where `viewerIds` contains user UID and `createdBy != uid`
   - Click → `demands.html?filter=inbox`

2. **Gönderdiğim Talepler**
   - Count: Demands where `createdBy == uid`
   - Click → `demands.html?filter=sent`

3. **Taslak Talepler**
   - Count: Demands where `createdBy == uid` and `published == false`
   - Click → `demands.html?filter=draft`

4. **TCMB Kurları**
   - Real-time USD/TRY and EUR/TRY rates
   - Updates every 60 seconds
   - Source: TCMB XML API via Cloud Function

#### Recent Demands Table
- Shows last 5 demands created by user
- Columns: STF No, Başlık, Kategoriler, Durum, Tarih
- Click title → `demand-detail.html?id={demandId}`

#### Quick Actions
- **"+ Yeni Talep"** → `demand-new.html`
- **"Tüm Talepler"** → `demands.html`

---

## 3. Demand Creation with Categories

### Step-by-Step Flow

#### A. Header Information
1. **STF No**: Manual or "Otomatik Oluştur" button
   - Auto format: `STF-YYYY-NNNN` (e.g., STF-2025-0001)
2. **STF Tarihi**: Date picker (defaults to today)
3. **Şantiye**: Optional site/project name
4. **Alım Yeri**: Optional purchase location
5. **Başlık**: Required demand title
6. **Açıklama**: Technical specifications textarea

#### B. Category Selection
- **Shared Categories**: 17 predefined categories from `categories.js`
- **Input Method**: Datalist with autocomplete
- **Chip System**: 
  - Type category name
  - Press Enter to add as chip
  - Click "✕" on chip to remove
- **Multiple Categories**: Can add multiple categories
- Categories used for automatic supplier targeting

#### C. Additional Details
- **Termin Tarihi**: Due date
- **Öncelik**: Price / Speed / Quality
- **Para Birimi**: TRY / USD / EUR
- **Ödeme Şartları**: Payment terms
- **Teslimat Şehri**: Delivery city
- **Teslimat Adresi**: Delivery address

#### D. Bidding Mode Selection
See [Section 4](#bidding-modes--time-bound-phases)

#### E. Line Items
- Click "+ Satır Ekle"
- Fill in: Material code, description, brand/model, quantity, unit, delivery date
- Can add multiple items
- Each item saved to `demands/{demandId}/items/{itemId}`

#### F. Save as Draft
- Click "Talebi Kaydet"
- Saved with `published: false`
- Only visible to owner
- Can be edited before publishing

---

## 4. Bidding Modes & Time-Bound Phases

### Three Bidding Modes

#### Mode 1: Gizli Teklif (Secret)
**Use Case**: Standard RFQ, confidential pricing

**Visibility**:
- Owner: Sees all bids with supplier names
- Suppliers: See only their own bids

**Time-Bound Options**:
- ☐ No time limit (manual close)
- ☑ Start/End datetime (automatic countdown)

**When to Use**:
- Initial price discovery
- Confidential negotiations
- Standard procurement

---

#### Mode 2: Açık Artırma (Open Auction)
**Use Case**: Competitive bidding, transparent pricing

**Visibility**:
- Owner: Sees all bids with supplier names
- Suppliers: See all bid prices (names masked: "Tedarikçi #1", "Tedarikçi #2")

**Features**:
- Creates competitive pressure
- Suppliers can see where they rank
- Encourages better pricing

**Time-Bound Options**:
- ☐ No time limit
- ☑ Start/End datetime with countdown

**When to Use**:
- High-value commodities
- Multiple qualified suppliers
- Price-driven decisions

---

#### Mode 3: Hibrit (Hybrid)
**Use Case**: Best of both worlds

**Two-Phase Structure**:

**Phase 1 (Gizli)**:
- Start: Round 1 Start datetime
- End: Round 1 End datetime
- Visibility: Secret (suppliers see only own bids)
- Purpose: Initial price discovery

**Phase 2 (Açık)**:
- Start: Round 2 Start datetime (must be > Round 1 End)
- End: Round 2 End datetime
- Visibility: Open (all prices visible, names masked)
- Purpose: Competitive refinement

**Transition**:
- Manual: Owner clicks "2. Tura Geç" button (appears after Round 1 ends)
- Updates `phase` field from "secret" to "open"

**When to Use**:
- Complex procurements
- Maximum competition desired
- Two-step evaluation process

---

### Time-Bound Configuration

#### Enable Time Limits
- ☑ "Süreli (Başlangıç ve Bitiş Tarihi Belirle)" checkbox

#### For Secret/Open Modes
```
Başlangıç: [datetime-local input]
Bitiş:     [datetime-local input]
```
- Validation: End > Start

#### For Hybrid Mode
```
1. Tur (Gizli):
  Başlangıç: [datetime-local]
  Bitiş:     [datetime-local]

2. Tur (Açık):
  Başlangıç: [datetime-local]
  Bitiş:     [datetime-local]
```
- Validation: R1 End > R1 Start, R2 Start > R1 End, R2 End > R2 Start

#### Countdown Timer
- Displayed on `demand-detail.html`
- Format: "Xg HH:MM:SS" (days, hours, minutes, seconds)
- Updates every second
- When expired: "Süre Doldu" + auto-reload after 2s

---

## 5. Multiple Discount Bidding

### Supplier Bid Form (demand-detail.html)

#### Form Fields
```
Liste Fiyatı:  [number input]
─────────────────────────────
İskontolar (opsiyonel):
  İskonto 1 (%): [0-100]
  İskonto 2 (%): [0-100]
  İskonto 3 (%): [0-100]
  İskonto 4 (%): [0-100]
  İskonto 5 (%): [0-100]
─────────────────────────────
Net Fiyat: [auto-calculated] ₺
─────────────────────────────
Termin (gün): [number]
Marka:        [text]
Ödeme Şartları: [text]
─────────────────────────────
[Teklif Gönder]
```

### Real-Time Calculation

#### Formula
```javascript
netPrice = listPrice 
  × (1 - discount1/100) 
  × (1 - discount2/100) 
  × (1 - discount3/100) 
  × (1 - discount4/100) 
  × (1 - discount5/100)
```

#### Example
```
Liste Fiyatı:  10,000 TL

İskonto 1: 10% → 9,000 TL
İskonto 2:  5% → 8,550 TL  
İskonto 3:  2% → 8,379 TL
İskonto 4:  1% → 8,295.21 TL
İskonto 5: 0.5% → 8,253.73 TL

Net Fiyat: 8,253.73 TL
```

#### Auto-Update
- Input event listener on all 6 fields (listPrice + 5 discounts)
- Net price updates in real-time as you type
- Displayed prominently in green box

### Saved Bid Document
```javascript
{
  demandId: "abc123",
  priceList: 10000,
  discount1: 10,
  discount2: 5,
  discount3: 2,
  discount4: 1,
  discount5: 0.5,
  netPrice: 8253.73,
  price: 8253.73,  // Same as netPrice, for sorting
  leadTimeDays: 15,
  brand: "XYZ Marka",
  paymentTerms: "%50 peşin, %50 vadeli",
  supplierId: "uid123",
  createdAt: Timestamp
}
```

### Buyer View
Owner sees all discounts in bid list:
- List Price: 10,000 TL
- Discounts: 10%, 5%, 2%, 1%, 0.5%
- Net Price: 8,253.73 TL

---

## 6. Company Selector Usage

### Common Header (All Pages)
```
┌─────────────────────────────────────────────────────────────┐
│ Teklifbul  [TR Time]    Firma: [Dropdown ▼]  user@mail.com  [Çıkış] │
└─────────────────────────────────────────────────────────────┘
```

### Company Dropdown
- Shows all companies user has access to (`users.companies` array)
- Default: "Kendi Firmam" (auto-created if empty)
- Selection persisted to:
  - Firestore: `users/{uid}.activeCompanyId`
  - localStorage: `activeCompanyId`

### Behavior on Change
1. User selects different company
2. Firestore updated via `setDoc({activeCompanyId}, {merge: true})`
3. localStorage updated
4. Page reloads (`location.reload()`)
5. New company context applied

### Multi-Company Use Cases

#### Scenario 1: Consultant with Multiple Clients
- User works for 3 different companies
- `companies` array: `["companyA", "companyB", "companyC"]`
- Can switch between companies via dropdown
- Each company sees only its own demands (if filtering implemented)

#### Scenario 2: Corporate Group
- Parent company + 5 subsidiaries
- CFO has access to all 6 companies
- Switch between entities for consolidated view

#### Scenario 3: Solo User (Default)
- No companies defined
- Auto-creates "Kendi Firmam"
- Single-company operation

---

## 7. Complete User Journeys

### Journey 1: Buyer Creates Secret Demand

1. **Login** → `dashboard.html`
2. Click **"+ Yeni Talep"** → `demand-new.html`
3. Fill header info:
   - STF No: STF-2025-0015
   - Title: "50 adet rulman"
   - Categories: Makine-İmalat (Enter), Otomotiv Yan Sanayi (Enter)
4. Select **Bidding Mode: Gizli**
5. ☑ **Süreli**:
   - Start: 2025-10-20 09:00
   - End: 2025-10-27 17:00
6. Add items:
   - Material: Rulman 6205
   - Quantity: 50
   - Unit: adet
7. **Talebi Kaydet** → Saved as draft
8. Navigate to **"Talepler"** → See draft with yellow badge
9. Click demand → `demand-detail.html`
10. Click **"Yayınla"** → Confirm modal
11. Demand sent to suppliers matching categories
12. Countdown timer starts

### Journey 2: Supplier Submits Multi-Discount Bid

1. **Login** (supplier account) → `dashboard.html`
2. **Gelen Talepler: 1** → Click metric card
3. See new demand: "50 adet rulman"
4. Click title → `demand-detail.html`
5. See countdown: "6g 23:45:12"
6. Scroll to **"Teklif Ver"** form
7. Enter:
   - Liste Fiyatı: 5000
   - İskonto 1: 15% → Net updates to 4,250
   - İskonto 2: 5% → Net updates to 4,037.50
   - İskonto 3: 2% → Net updates to 3,956.75
   - Termin: 10 gün
   - Marka: SKF
   - Ödeme: %100 peşin
8. Click **"Teklif Gönder"**
9. Success alert ✅
10. Bid saved with all discount fields

### Journey 3: Buyer Evaluates Hybrid Auction

1. Create demand with **Hibrit** mode:
   - Round 1: 2025-10-20 to 2025-10-23 (Gizli)
   - Round 2: 2025-10-24 to 2025-10-26 (Açık)
2. Publish demand
3. **Round 1**: Suppliers submit bids (can't see others)
4. **2025-10-23 17:00**: Round 1 ends
5. Owner sees **"2. Tura Geç"** button
6. Click button → Phase changes to "open"
7. **Round 2**: Suppliers see all prices (masked names)
8. Suppliers can improve bids to stay competitive
9. **2025-10-26 17:00**: Round 2 ends, countdown expires
10. Owner reviews final bids sorted by net price

### Journey 4: Multi-Company Switching

1. User logs in (has 2 companies)
2. Dashboard header shows: **Firma: [Acme Corp ▼]**
3. Dropdown shows:
   - Acme Corp ✓
   - Beta Industries
4. Create demand → Saved under Acme Corp context
5. Switch to **Beta Industries**
6. Page reloads
7. Dashboard shows different metrics (if company filtering enabled)
8. Create new demand → Saved under Beta context

### Journey 5: FX Rate Monitoring

1. Dashboard loads
2. FX Widget shows:
   ```
   TCMB Kurları
   USD/TRY: 34.5678
   EUR/TRY: 37.1234
   Tarih: 2025-10-18
   ```
3. Cloud Function fetches from TCMB XML
4. **60 seconds later**: Auto-refresh
5. New rates appear without page reload
6. Buyer uses current rates for demand budgeting

---

## 🎯 Key Workflow Features

### Automatic Supplier Targeting
- Demand categories: ["Makine-İmalat", "Elektrik"]
- Query suppliers: `categories array-contains-any ["Makine-İmalat", "Elektrik"]`
- Matched suppliers added to `viewerIds` automatically
- Suppliers see demand in "Gelen Talepler"

### Draft → Edit → Publish Cycle
1. Create demand → Draft (visible only to owner)
2. Click **"Düzenle"** → Edit mode in `demand-new.html`
3. Modify fields → Save
4. Old items deleted, new items created
5. Click **"Yayınla"** when ready
6. Demand visible to suppliers

### Bid Visibility by Mode
- **Secret**: Supplier sees only own bids
- **Open**: Supplier sees all prices, names masked
- **Hybrid R1**: Like Secret
- **Hybrid R2**: Like Open (after transition)

### Company Context Persistence
- Selected company saved to Firestore + localStorage
- Survives page refresh
- Consistent across all pages
- Future: Filter demands by `companyId`

---

## 📚 Related Documentation

- **Deployment**: `DASHBOARD_DEPLOYMENT_GUIDE.md`
- **Implementation**: `DASHBOARD_IMPLEMENTATION_SUMMARY.md`
- **Bidding Modes**: `BIDDING_MODE_GUIDE.md`
- **Grouping/Editing**: `GROUPING_EDITING_GUIDE.md`
- **ACL Setup**: `ACL_SETUP_GUIDE.md`

---

## 🎉 Complete Feature Set

✅ **Dashboard** with real-time metrics and FX rates  
✅ **Common Header** with company selector on all pages  
✅ **Multi-Company Support** with automatic default creation  
✅ **17 Shared Categories** for consistent classification  
✅ **Automatic Supplier Targeting** based on category match  
✅ **3 Bidding Modes** (Secret, Open, Hybrid)  
✅ **Time-Bound Phases** with countdown timers  
✅ **Round Transitions** for Hybrid mode  
✅ **Multiple Discounts** (1-5) with auto net price calc  
✅ **TCMB FX Integration** via Cloud Function  
✅ **Draft → Edit → Publish** workflow  
✅ **Grouping & Filtering** in demands list  
✅ **Pagination** (20 items per page)  
✅ **PDF/Excel Export** for demands  
✅ **KVKK Compliance** with consent tracking  

**Ready for Production!** 🚀
