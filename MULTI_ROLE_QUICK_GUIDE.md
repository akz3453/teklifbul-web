# 🚀 Multi-Role & Category Targeting - Quick Guide

## What's New?

### 1. Multiple Roles Support
You can now be both a **Buyer** (Alıcı) and **Supplier** (Tedarikçi) at the same time!

**Before:**
- Choose one role: Either Buyer OR Supplier

**Now:**
- Check both boxes: Be Buyer AND Supplier simultaneously

### 2. Premium Accounts
- New "Premium Hesap" checkbox in settings
- Reserved for future premium features

### 3. Smart Categories
- **Supplier Categories**: Control which demands you receive
- **Buyer Categories**: Organize your own demands

### 4. Tax Certificate Management
- Upload your tax certificate as before
- **NEW:** Delete it with one click if you uploaded the wrong file

### 5. Intelligent Publishing
- When you publish a demand, only suppliers with matching categories receive it
- No more spam to irrelevant suppliers!

---

## How to Use

### For Buyers (Alıcı)

#### Setting Up Your Account
1. Go to **Ayarlar** (Settings)
2. Check the **Alıcı** checkbox
3. Fill in company information
4. Add buyer categories (optional - for organizing your demands)
5. Click **Kaydet**

#### Creating a Demand
1. Create your demand as usual
2. **Important:** Select categories for your demand
3. Click **Tedarikçilere Gönder**
4. System shows how many suppliers will receive it
5. Done! Only relevant suppliers see your demand

### For Suppliers (Tedarikçi)

#### Setting Up Your Account
1. Go to **Ayarlar** (Settings)
2. Check the **Tedarikçi** checkbox
3. Fill in company information
4. **IMPORTANT:** Add your supplier categories
   - These determine which demands you'll see
   - Example: ["Elektrik", "Elektronik"]
5. Upload tax certificate
6. Click **Kaydet**

#### Receiving Demands
- You automatically see demands matching your categories
- Only published demands appear
- You won't see demands from irrelevant categories

#### Managing Tax Certificate
- If you uploaded wrong file:
  1. Go to **Ayarlar**
  2. Find "Vergi Levhası" section
  3. Click **Kaldır** button
  4. Upload correct file
  5. Click **Kaydet**

### For Both Roles

#### Dual Role Setup
1. Go to **Ayarlar**
2. Check **BOTH** Alıcı and Tedarikçi
3. Fill supplier categories (for receiving demands)
4. Fill buyer categories (for organizing your demands)
5. Upload tax certificate
6. Click **Kaydet**

**Benefits:**
- Create demands as a buyer
- Receive relevant demands as a supplier
- All in one account!

---

## Category Matching Examples

### Example 1: Perfect Match
**Demand Categories:** ["Elektrik", "Elektronik"]  
**Supplier Categories:** ["Elektrik", "Makine"]  
**Result:** ✅ Supplier receives demand (Elektrik matches)

### Example 2: No Match
**Demand Categories:** ["Gıda", "Temizlik"]  
**Supplier Categories:** ["Elektrik", "Elektronik"]  
**Result:** ❌ Supplier doesn't receive demand

### Example 3: Multiple Matches
**Demand Categories:** ["Elektrik", "Elektronik", "Makine"]  
**Supplier Categories:** ["Elektrik", "Elektronik"]  
**Result:** ✅ Supplier receives demand (2 categories match)

---

## Common Scenarios

### Scenario 1: I'm only a buyer
```
✓ Check "Alıcı"
✗ Uncheck "Tedarikçi"
✓ Add buyer categories (optional)
✓ Create and publish demands
```

### Scenario 2: I'm only a supplier
```
✗ Uncheck "Alıcı"
✓ Check "Tedarikçi"
✓ Add supplier categories (REQUIRED!)
✓ Upload tax certificate
✓ Wait for matching demands
```

### Scenario 3: I'm both
```
✓ Check "Alıcı"
✓ Check "Tedarikçi"
✓ Add supplier categories (for receiving)
✓ Add buyer categories (for organizing)
✓ Upload tax certificate
✓ Create demands AND receive relevant ones
```

### Scenario 4: I uploaded wrong tax certificate
```
1. Go to Ayarlar
2. Find "Vergi Levhası" section
3. See: "✓ Yüklü: [filename]"
4. Click "Kaldır" button
5. Confirm deletion
6. Upload correct file
7. Click "Kaydet"
```

---

## Frequently Asked Questions

### Q: Can I change my roles later?
**A:** Yes! Just go to Settings and check/uncheck the role boxes.

### Q: What happens if I don't select supplier categories?
**A:** If you're a supplier, you **must** select at least one category. Otherwise, you won't receive any demands.

### Q: Can I have different categories for buying vs. supplying?
**A:** Yes! That's the whole point. Buyer categories are for organizing your demands. Supplier categories determine which demands you receive.

### Q: Will I see my own demands?
**A:** Yes, as the owner, you always see your demands regardless of categories.

### Q: What if no suppliers match my demand categories?
**A:** The system will warn you but allow publishing anyway. You might want to reconsider your category selection.

### Q: Does deleting tax certificate affect my account?
**A:** No, it only removes the file. You can upload a new one anytime.

### Q: Can I be a premium user?
**A:** The premium flag is currently for future features. Check it if you want, but it doesn't change functionality yet.

### Q: How many categories can I select?
**A:** As many as needed, but keep in mind:
- More supplier categories = more demands (might be overwhelming)
- More buyer categories = better organization
- Firestore limits category matching to 10 per query

---

## Tips & Best Practices

### For Suppliers
✅ **DO:**
- Select specific, relevant categories
- Keep your categories updated
- Upload clear tax certificate

❌ **DON'T:**
- Select all categories (you'll get irrelevant demands)
- Forget to upload tax certificate
- Leave supplier categories empty

### For Buyers
✅ **DO:**
- Select accurate demand categories
- Be specific to get relevant suppliers
- Check supplier count before publishing

❌ **DON'T:**
- Select unrelated categories
- Publish without categories
- Ignore the supplier count warning

### For Both
✅ **DO:**
- Keep company information updated
- Review your categories regularly
- Test with a small demand first

❌ **DON'T:**
- Confuse buyer vs. supplier categories
- Forget to save changes
- Assume all suppliers see your demands

---

## Troubleshooting

### Problem: I don't see any demands
**Solutions:**
1. Check you're marked as "Tedarikçi"
2. Verify you have supplier categories selected
3. Wait for demands matching your categories
4. Check if any demands are published (not draft)

### Problem: My demand isn't reaching suppliers
**Solutions:**
1. Check you added categories to your demand
2. Verify suppliers exist with those categories
3. Make sure you clicked "Tedarikçilere Gönder"
4. Check the supplier count shown after publishing

### Problem: Can't delete tax certificate
**Solutions:**
1. Make sure you're logged in
2. Check you're the owner of the file
3. Try refreshing the page
4. Contact support if issue persists

### Problem: Categories not saving
**Solutions:**
1. Make sure you pressed Enter after typing category
2. Check category appears as a chip/tag
3. Click "Değişiklikleri Kaydet" button
4. Wait for success message before leaving page

---

## Quick Reference

| Action | Steps |
|--------|-------|
| **Add Role** | Settings → Check role checkbox → Save |
| **Add Category** | Settings → Type in category field → Press Enter → See chip appear → Save |
| **Delete Tax Cert** | Settings → Find "Vergi Levhası" → Click "Kaldır" → Confirm |
| **Publish Demand** | Demand Detail → "Tedarikçilere Gönder" → Confirm |
| **View Received Demands** | Talepler page (automatically filtered by your categories) |

---

## Need Help?

- 📖 Read the full implementation guide: `MULTI_ROLE_IMPLEMENTATION.md`
- 🧪 Run tests: Open `test/test_multi_role.html` in browser
- 📋 Check detailed steps: `step_todo/step_001_multi_role_tax_deletion.md`

---

**Last Updated:** 2025-10-20  
**Version:** 1.0
