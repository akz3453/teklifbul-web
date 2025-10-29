# Pre-Deployment Validation Checklist

**Date:** 2025-10-20  
**Feature:** Multi-Role + Tax Certificate Deletion + Category Targeting

---

## Code Quality Checks

### ✅ Syntax & Linting
- [x] No syntax errors in `settings.html`
- [x] No syntax errors in `demand-detail.html`
- [x] No syntax errors in `firestore.rules`
- [x] No syntax errors in `storage.rules`
- [x] All imports are correct
- [x] All function calls have proper parameters

### ✅ Code Standards
- [x] DRY principle applied (modular functions)
- [x] Debug console.log statements included
- [x] Error handling with try-catch blocks
- [x] User-friendly error messages

---

## Functionality Checks

### Settings Page (`settings.html`)

#### UI Elements
- [ ] Role checkboxes visible (Alıcı, Tedarikçi)
- [ ] Premium checkbox visible
- [ ] Supplier categories section (hidden by default)
- [ ] Buyer categories section (hidden by default)
- [ ] Tax certificate upload field
- [ ] Tax certificate info display
- [ ] Tax certificate remove button (when file exists)

#### Behavior
- [ ] Checking "Tedarikçi" shows supplier categories section
- [ ] Checking "Alıcı" shows buyer categories section
- [ ] Checking both shows both sections
- [ ] Unchecking hides respective sections
- [ ] Adding category creates chip/tag
- [ ] Clicking chip removes it
- [ ] Save button validates required fields
- [ ] Save button requires at least one supplier category if supplier role selected
- [ ] Tax certificate upload works
- [ ] Tax certificate remove button deletes from Storage
- [ ] Tax certificate remove sets path to null in Firestore
- [ ] Page refreshes after tax deletion

#### Data Persistence
- [ ] Old `role` field converts to `roles` array on load
- [ ] Old `categories` field maps to `supplierCategories`
- [ ] New users default to buyer role
- [ ] Roles save as array
- [ ] Premium flag saves correctly
- [ ] Supplier categories save when supplier role active
- [ ] Buyer categories save when buyer role active
- [ ] Both category sets save when both roles active

### Demand Detail Page (`demand-detail.html`)

#### Publishing Logic
- [ ] Publish button visible for owner
- [ ] Publish modal appears on click
- [ ] System extracts demand categories correctly
- [ ] Query finds suppliers with "supplier" in roles array
- [ ] Query matches categories using array-contains-any
- [ ] Owner excluded from viewerIds
- [ ] Warning shown if no matching suppliers
- [ ] Supplier count displayed after publish
- [ ] viewerIds saved to demand document
- [ ] published flag set to true
- [ ] sentAt timestamp recorded

#### Category Extraction
- [ ] categoryTags array processed
- [ ] customCategory included
- [ ] categories array included (backward compatibility)
- [ ] category string included (backward compatibility)
- [ ] Duplicates removed
- [ ] Empty values filtered out

---

## Security Checks

### Firestore Rules

#### Users Collection
- [ ] User can read own document
- [ ] User can write own document
- [ ] Suppliers readable for targeting (role or roles check)
- [ ] Backward compatibility: old `role` field supported
- [ ] Backward compatibility: new `roles` array supported

#### Demands Collection
- [ ] Owner can read own demands
- [ ] Users in viewerIds can read demand
- [ ] Null-safe check for viewerIds
- [ ] Owner can create demands (createdBy check)
- [ ] Owner can update own demands
- [ ] Owner can delete own demands
- [ ] Non-owners cannot update demands
- [ ] Non-owners cannot delete demands

#### Items Subcollection
- [ ] Owner can read items
- [ ] Users in demand viewerIds can read items
- [ ] Null-safe check for viewerIds
- [ ] Owner can create items
- [ ] Owner can update items
- [ ] Owner can delete items
- [ ] Non-owners cannot modify items

### Storage Rules

#### Suppliers Path
- [ ] Authenticated users can read
- [ ] Only owner can write
- [ ] Only owner can delete
- [ ] Path format: `suppliers/{uid}/{fileName}`

#### Demands Path
- [ ] Authenticated users can read
- [ ] Only uploader can write
- [ ] Only uploader can delete
- [ ] Path format: `demands/{demandId}/{userId}/{fileName}`

---

## Test Execution

### Automated Tests (`test/test_multi_role.html`)
- [ ] Test 1: Role conversion passes
- [ ] Test 2: Multi-role support passes
- [ ] Test 3: Category targeting query passes
- [ ] Test 4: Premium flag passes

### Manual Tests

#### Test Case 1: Single Buyer
**Steps:**
1. Create new account
2. Go to settings
3. Check only "Alıcı"
4. Add buyer categories: ["Test Cat 1"]
5. Fill company info
6. Save

**Expected:**
- ✓ Buyer categories section visible
- ✓ Supplier categories section hidden
- ✓ Data saves with roles: ["buyer"]
- ✓ buyerCategories: ["Test Cat 1"]
- ✓ supplierCategories: []

**Result:** [ ] PASS [ ] FAIL

---

#### Test Case 2: Single Supplier
**Steps:**
1. Create new account
2. Go to settings
3. Check only "Tedarikçi"
4. Add supplier categories: ["Elektrik"]
5. Upload tax certificate
6. Fill company info
7. Save

**Expected:**
- ✓ Supplier categories section visible
- ✓ Buyer categories section hidden
- ✓ Data saves with roles: ["supplier"]
- ✓ supplierCategories: ["Elektrik"]
- ✓ buyerCategories: []
- ✓ taxCertificatePath exists

**Result:** [ ] PASS [ ] FAIL

---

#### Test Case 3: Dual Role
**Steps:**
1. Create new account
2. Go to settings
3. Check BOTH "Alıcı" and "Tedarikçi"
4. Add supplier categories: ["Elektrik", "Elektronik"]
5. Add buyer categories: ["Makine"]
6. Check Premium
7. Upload tax certificate
8. Fill company info
9. Save

**Expected:**
- ✓ Both category sections visible
- ✓ Data saves with roles: ["buyer", "supplier"]
- ✓ supplierCategories: ["Elektrik", "Elektronik"]
- ✓ buyerCategories: ["Makine"]
- ✓ isPremium: true
- ✓ taxCertificatePath exists

**Result:** [ ] PASS [ ] FAIL

---

#### Test Case 4: Tax Certificate Deletion
**Steps:**
1. Login as user with tax certificate
2. Go to settings
3. Verify "✓ Yüklü: [filename]" displayed
4. Click "Kaldır" button
5. Confirm deletion
6. Wait for page reload

**Expected:**
- ✓ File deleted from Storage
- ✓ taxCertificatePath becomes null
- ✓ Success message shown
- ✓ Page reloads
- ✓ No file info displayed

**Result:** [ ] PASS [ ] FAIL

---

#### Test Case 5: Category-Based Publishing
**Setup:**
1. Create Supplier A: categories ["Elektrik"]
2. Create Supplier B: categories ["Elektronik"]
3. Create Supplier C: categories ["Makine"]
4. Create Buyer with demand: categories ["Elektrik", "Elektronik"]

**Steps:**
1. Login as buyer
2. Create demand with categories ["Elektrik", "Elektronik"]
3. Click "Tedarikçilere Gönder"
4. Confirm

**Expected:**
- ✓ System shows "2 tedarikçi" (or actual count)
- ✓ viewerIds includes Supplier A
- ✓ viewerIds includes Supplier B
- ✓ viewerIds does NOT include Supplier C
- ✓ viewerIds does NOT include buyer (owner)
- ✓ published: true
- ✓ sentAt timestamp set

**Result:** [ ] PASS [ ] FAIL

---

#### Test Case 6: Backward Compatibility
**Setup:**
Create user document manually with old format:
```javascript
{
  role: "supplier",
  categories: ["Elektrik", "Elektronik"],
  companyName: "Old Format Co."
}
```

**Steps:**
1. Login as this user
2. Go to settings
3. Observe loaded data

**Expected:**
- ✓ "Tedarikçi" checkbox is checked
- ✓ Supplier categories show ["Elektrik", "Elektronik"]
- ✓ No errors in console
- ✓ Can save successfully
- ✓ After save, roles: ["supplier"] exists

**Result:** [ ] PASS [ ] FAIL

---

## Performance Checks

### Query Performance
- [ ] Category targeting query executes in < 2 seconds
- [ ] Settings page loads in < 1 second
- [ ] Demand publish completes in < 3 seconds

### Storage Performance
- [ ] Tax certificate upload < 5 seconds (for 2MB file)
- [ ] Tax certificate delete < 2 seconds

---

## Browser Compatibility

### Desktop
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Safari (latest)

### Mobile
- [ ] Chrome Mobile
- [ ] Safari Mobile

---

## Deployment Checklist

### Pre-Deployment
- [ ] All code committed to version control
- [ ] Step documentation completed
- [ ] Implementation guide created
- [ ] Quick guide created
- [ ] Test suite created
- [ ] All automated tests pass
- [ ] All manual tests pass

### Deployment
- [ ] Backup current Firestore rules
- [ ] Backup current Storage rules
- [ ] Deploy new Firestore rules
- [ ] Deploy new Storage rules
- [ ] Verify rules deployed successfully
- [ ] Create required Firestore indexes
- [ ] Test in production environment

### Post-Deployment
- [ ] Monitor error logs for 24 hours
- [ ] Test all critical paths
- [ ] Verify no user complaints
- [ ] Update documentation if needed
- [ ] Mark step as complete

---

## Risk Assessment

### Low Risk ✅
- UI changes in settings.html (only affects settings page)
- Tax certificate deletion (optional feature)
- Premium flag (currently unused)

### Medium Risk ⚠️
- Multi-role support (affects user profile structure)
- Category separation (changes data model)
- Publishing logic (changes who sees demands)

### High Risk 🔴
- Firestore rules changes (affects all data access)
- Storage rules changes (affects file access)

**Mitigation:**
- ✅ Backward compatibility for old data format
- ✅ Null-safe checks in rules
- ✅ Thorough testing before deployment
- ✅ Can rollback rules if issues occur

---

## Rollback Plan

If critical issues occur:

1. **Rollback Rules** (Immediate)
   ```bash
   # Restore previous rules from backup
   firebase deploy --only firestore:rules,storage:rules
   ```

2. **Keep Code Changes** (Low Risk)
   - Settings page changes are backward compatible
   - Users can continue with old format

3. **Data Migration** (If Needed)
   - Old `role` → `roles` conversion is automatic
   - No manual migration required
   - Can revert in emergency

---

## Sign-Off

### Developer
- [ ] All code implemented
- [ ] All tests passed
- [ ] Documentation complete
- [ ] Ready for deployment

**Signature:** _______________ **Date:** _______________

### QA (if applicable)
- [ ] All test cases executed
- [ ] No critical bugs found
- [ ] Performance acceptable
- [ ] Ready for production

**Signature:** _______________ **Date:** _______________

### Deployment
- [ ] Rules deployed
- [ ] Indexes created
- [ ] Production tested
- [ ] Monitoring active

**Signature:** _______________ **Date:** _______________

---

## Notes

Space for additional notes, observations, or issues encountered:

```




```

---

**Checklist Version:** 1.0  
**Last Updated:** 2025-10-20
