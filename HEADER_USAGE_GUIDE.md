# Header Usage Guide

## Overview

The `header.js` file provides shared header functionality for simpler pages. Complex pages (dashboard, demands, demand-detail, etc.) already have embedded header logic with company selection dropdowns and should continue using their existing implementation.

---

## When to Use `header.js`

✅ **Use for:**
- Simple admin pages
- Test pages  
- New utility pages
- Pages without company selection needs

❌ **Don't use for:**
- Pages that already have embedded header logic
- Pages with company selection dropdowns (dashboard, demands, demand-detail, demand-new, settings)

---

## How to Use

### 1. Add Header HTML

Add this header bar to your page's `<body>`:

```html
<!-- Common Header -->
<header style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:white;margin-bottom:20px">
  <div style="display:flex;gap:12px;align-items:center">
    <strong style="font-size:18px;color:#1f2937">Teklifbul</strong>
  </div>
  <div style="display:flex;gap:12px;align-items:center">
    <label style="font-size:12px;opacity:.8">Firma:</label>
    <span id="firmName" style="font-size:13px;color:#6b7280">-</span>
    <span id="userLabel" style="font-size:13px;color:#6b7280;opacity:.8">-</span>
    <button id="logoutBtn" style="padding:8px 14px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500">Çıkış</button>
  </div>
</header>
```

### 2. Add Script Before `</body>`

```html
<script type="module" src="./header.js"></script>
</body>
</html>
```

---

## What `header.js` Does

| Element | ID | Functionality |
|---------|-----|---------------|
| **Firm Name** | `firmName` | Fetches company name from `users/{uid}.companyName` or `profiles/{uid}.companyName` |
| **User Label** | `userLabel` | Displays user email or UID |
| **Logout Button** | `logoutBtn` | Handles logout → redirects to `index.html` |

---

## Example: Simple Page

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Simple Page</title>
  <link rel="stylesheet" href="./utils.css" />
</head>
<body>
  <!-- Header -->
  <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:white;margin-bottom:20px">
    <div>
      <strong style="font-size:18px;color:#1f2937">Teklifbul</strong>
    </div>
    <div style="display:flex;gap:12px;align-items:center">
      <label style="font-size:12px;opacity:.8">Firma:</label>
      <span id="firmName" style="font-size:13px;color:#6b7280">-</span>
      <span id="userLabel" style="font-size:13px;color:#6b7280;opacity:.8">-</span>
      <button id="logoutBtn" class="btn danger">Çıkış</button>
    </div>
  </header>

  <!-- Page Content -->
  <div style="padding:20px;max-width:1200px;margin:0 auto">
    <h1>My Simple Page</h1>
    <p>Content here...</p>
  </div>

  <!-- Shared Header Script -->
  <script type="module" src="./header.js"></script>
</body>
</html>
```

---

## Current Status

### ✅ Pages with Embedded Headers (Keep As-Is)
- `dashboard.html` - Has company selector + clock + complex logic
- `demands.html` - Has company selector + clock + complex logic
- `demand-detail.html` - Has company selector + clock + complex logic
- `demand-new.html` - Has company selector + clock + complex logic
- `settings.html` - Has company selector + clock + complex logic

### 🆕 Pages That Can Use `header.js`
- New admin pages
- Test pages (`test-queries.html`, etc.)
- Simple utility pages

---

## Migration (Optional)

If you want to refactor existing pages to use `header.js`:

1. Remove the embedded header script blocks
2. Replace company selector with simple `<span id="firmName">`
3. Add `<script type="module" src="./header.js"></script>` before `</body>`

**Note:** This is optional and not recommended for pages with complex company selection logic.

---

## Future Enhancement: Multi-Company Support

When multi-company support is added:

1. Replace `<span id="firmName">` with `<select id="companySelect">`
2. Update `header.js` to:
   - Fetch user's companies from `users/{uid}.companies[]`
   - Populate dropdown
   - Handle company switching
   - Store active company in localStorage/Firestore

---

## Troubleshooting

**Problem: Firm name shows "-"**
- Check: Does `users/{uid}` or `profiles/{uid}` have `companyName` field?
- Check: Are Firestore rules allowing read access?

**Problem: Logout button doesn't work**
- Check: Is `firebase.js` properly imported?
- Check: Console for errors

**Problem: User label shows "-"**
- Check: Is user authenticated?
- Check: `requireAuth()` completing successfully?

---

## Summary

✅ `header.js` created and ready to use  
✅ Existing pages can keep their embedded header logic  
✅ New/simple pages can use `header.js` for quick setup  
✅ Future-proof for multi-company support  
