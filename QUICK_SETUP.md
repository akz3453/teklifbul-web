# Quick Setup Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Deploy Security Rules

**Option A: Firebase Console (Recommended)**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. **Firestore Rules**: 
   - Navigate to Firestore Database → Rules
   - Copy content from [`firestore.rules`](firestore.rules)
   - Paste and click **Publish**

3. **Storage Rules**:
   - Navigate to Storage → Rules
   - Copy content from [`storage.rules`](storage.rules)
   - Paste and click **Publish**

**Option B: Firebase CLI**

```bash
firebase deploy --only firestore:rules,storage:rules
```

Or use the provided script:
```bash
deploy-rules.bat
```

### Step 2: Create Firestore Indexes

In Firebase Console → Firestore → Indexes, create:

1. **Demands - Owner View**
   - Collection: `demands`
   - Fields: `createdBy` (Ascending), `createdAt` (Descending)

2. **Demands - Supplier View**
   - Collection: `demands`
   - Fields: `viewerIds` (Array-contains), `createdAt` (Descending)

3. **Users - Supplier Targeting**
   - Collection: `users`
   - Fields: `role` (Ascending), `categories` (Array-contains)

**OR** just wait for Firebase to show index creation links in console errors when you first run queries.

### Step 3: Test the Application

1. **Create Supplier Account**
   ```
   signup.html → supplier1@test.com
   → Choose "Tedarikçi"
   → Select categories: "Elektrik", "Elektronik"
   → Fill company info
   → Check KVKK consent
   → Save
   ```

2. **Create Buyer Account**
   ```
   signup.html → buyer1@test.com
   → Choose "Alıcı"
   → Fill company info
   → Check KVKK consent
   → Save
   ```

3. **Create Demand (as Buyer)**
   ```
   demands.html → + Yeni Talep
   → Fill form
   → Select category: "Elektrik"
   → Add items
   → Create
   ```

4. **Verify Auto-Targeting**
   - Check browser console: "Matching suppliers: 1"
   - Check Firestore: demand's `viewerIds` should include supplier UID

5. **Publish Demand**
   ```
   demand-detail.html → "Tedarikçilere Gönder"
   ```

6. **View as Supplier**
   ```
   Sign in as supplier1@test.com
   → demands.html
   → Should see the published demand
   → Click to view details
   → Submit bid
   ```

## 📁 Key Files

| File | Purpose |
|------|---------|
| [`categories.js`](categories.js) | Shared category dictionary (17 categories) |
| [`firestore.rules`](firestore.rules) | Firestore security rules |
| [`storage.rules`](storage.rules) | Storage security rules |
| [`role-select.html`](role-select.html) | Enhanced supplier/buyer registration |
| [`demand-new.html`](demand-new.html) | Demand creation with auto-targeting |
| [`demand-detail.html`](demand-detail.html) | Demand details with visibility rules |

## 📚 Documentation

- [`IMPLEMENTATION_SUMMARY.md`](IMPLEMENTATION_SUMMARY.md) - Complete overview
- [`RULES_DEPLOYMENT.md`](RULES_DEPLOYMENT.md) - Detailed deployment guide
- [`TESTING_GUIDE.md`](TESTING_GUIDE.md) - Step-by-step testing scenarios

## ✅ Checklist

- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Indexes created (or will auto-create on first query)
- [ ] Tested supplier registration
- [ ] Tested buyer registration
- [ ] Tested demand creation
- [ ] Verified auto-targeting works
- [ ] Tested publish/unpublish
- [ ] Tested bid submission
- [ ] Verified visibility rules

## 🐛 Common Issues

**"Permission denied" errors**
- ✅ Make sure rules are published
- ✅ User must be authenticated
- ✅ Check `createdBy` and `viewerIds` fields exist

**Supplier doesn't see demand**
- ✅ Demand must be published
- ✅ Categories must match exactly
- ✅ Check supplier is in `viewerIds` array

**File upload fails**
- ✅ Storage rules must be published
- ✅ File must be < 10 MB
- ✅ User must be authenticated

**Index errors**
- ✅ Click the link in the error to auto-create
- ✅ Or create manually in Firebase Console

## 🎯 What's New

### Unified Category System
- Single shared list of 17 categories
- Used in both registration and demand creation
- Consistent across the app

### Enhanced Supplier Registration
- Company details (name, tax #, MERSIS, address, website)
- Multiple contact emails and phones (chip input)
- Category selection from standard list
- Tax certificate upload
- KVKK consent tracking with timestamp

### Automatic Supplier Targeting
- Queries suppliers by matching categories
- Automatically populates `viewerIds` array
- Suppliers see relevant published demands
- No manual selection needed

### Visibility Rules
- **Draft**: Owner sees all, suppliers see nothing
- **Published & Owner**: Sees bid list, can't bid
- **Published & Supplier**: Can bid, can't see other bids

### KVKK Compliance
- Required consent checkbox
- Optional marketing consent
- Timestamp of consent
- Legal text with link to full policy

## 🚀 Next Steps

After successful setup and testing:

1. **Customize Categories**: Edit [`categories.js`](categories.js)
2. **Update KVKK Text**: Edit legal text in [`role-select.html`](role-select.html)
3. **Add Email Notifications**: Notify suppliers when matched to demands
4. **Implement Rating System**: Allow buyers to rate suppliers
5. **Add Bid Comparison**: Help buyers compare bids side-by-side

## 💡 Pro Tips

- Use Chrome DevTools to monitor Firestore queries
- Check Firebase Console → Usage tab for rule evaluations
- Enable Firebase Analytics for user insights
- Set up Firebase Performance Monitoring
- Use Firebase Emulator Suite for local development

## 📞 Need Help?

1. Check browser console for detailed error messages
2. Review Firebase Console for rule violations
3. Consult [`TESTING_GUIDE.md`](TESTING_GUIDE.md) for troubleshooting
4. Check Firestore data structure matches expected schema
