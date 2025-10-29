# Grouping, Filtering & Draft Editing Guide

## 🎯 Overview

This guide covers the new features added to the demand management system:
- **Grouping & Filtering** in the demands list
- **Pagination** for better navigation
- **Draft Editing** workflow

## 📋 Features Implemented

### 1. Demands List (demands.html)

#### Filtering Options
- **Status Filter**: Draft / Published / All
- **Priority Filter**: Price / Speed / Quality / All

#### Grouping Options
- **By Site (Şantiye)**: Groups demands by construction site
- **By Category**: Groups demands by their categories
- **By Status**: Groups demands by draft/published status
- **By Priority**: Groups demands by priority level
- **By Month**: Groups demands by creation month (YYYY-MM)

#### Features
- ✅ Collapsible group headers (click to expand/collapse)
- ✅ Shows count for each group
- ✅ Pagination (20 items per page) when not grouped
- ✅ Delete button for owners (only own demands)
- ✅ Improved table columns: STF No, Title, Categories, Due Date, Priority, Site, Status, Created Date, Actions

### 2. Draft Editing Flow

#### Edit Button
- **Location**: Demand detail page, in owner actions section
- **Visibility**: Only visible when:
  - User is the owner (createdBy == currentUser.uid)
  - Demand is in draft status (published == false)

#### Edit Mode (demand-new.html?id=...)
- Loads existing demand data
- Pre-fills all form fields
- Loads all line items
- Updates existing demand on save
- Maintains draft status (published=false)

## 🔄 Complete Workflow

### Scenario 1: Create → Edit → Publish

```
1. Create new demand
   demands.html → "+ Yeni talep oluştur"
   → Fill form → "Talebi Kaydet"
   → Status: Taslak

2. Edit draft
   demand-detail.html → "Düzenle" button
   → demand-new.html (edit mode)
   → Modify fields → "Değişiklikleri Kaydet"
   → Back to detail page

3. Publish
   demand-detail.html → "Tedarikçilere Gönder"
   → Status: Gönderildi
   → "Düzenle" button disappears
```

### Scenario 2: Publish → Unpublish → Edit

```
1. Published demand
   Status: Gönderildi
   "Düzenle" button: Hidden

2. Unpublish (withdraw)
   demand-detail.html → "Geri Çek"
   → Status: Taslak
   → "Düzenle" button: Visible

3. Edit
   Click "Düzenle" → Make changes → Save
   → Status remains: Taslak

4. Re-publish
   "Tedarikçilere Gönder"
   → Status: Gönderildi
```

## 🎨 UI/UX Details

### Grouping View

When grouping is active:
- Regular table is hidden
- Grouped container is shown
- Each group has a collapsible header with count
- Groups are sorted alphabetically (Turkish locale)
- Items within groups are sorted by creation date (newest first)
- Pagination is disabled

**Group Header Example:**
```
Elektrik (5)  ← Click to collapse/expand
├── Mini table with all 5 items
```

### Category Grouping

Special behavior for category grouping:
- If a demand has multiple categories, it appears in ALL matching groups
- Example: Demand with ["Elektrik", "Hırdavat"] appears in both groups

### Pagination

When grouping is OFF:
- Shows 20 items per page
- Navigation buttons: "← Önceki" | "Sonraki →"
- Shows current page and total: "Sayfa 1 / 3 (Toplam 45 talep)"

## 🔧 Implementation Details

### demands.html

#### State Management
```javascript
let merged = [];        // All demands with full data
const PAGE_SIZE = 20;   // Items per page
let currentPage = 0;    // Current page number
```

#### Key Functions

**groupKey(rec, by)**: Determines group key for a record
```javascript
// Returns string for most groups
// Returns array for category (multi-category support)
```

**buildGroups(rows, by)**: Builds Map<groupName, Record[]>
```javascript
// Handles both single and multi-valued keys
// Each record can appear in multiple groups (categories)
```

**renderGrouped(groupsMap)**: Renders grouped view
```javascript
// Creates collapsible sections
// Each group has its own mini table
// Hides pagination
```

**renderTable(filtered)**: Renders regular table view
```javascript
// Shows current page only
// Pagination enabled
```

#### Delete Functionality
- Only owners see delete button
- Confirmation dialog before deletion
- Updates local state (merged array)
- Re-applies filters after deletion

### demand-detail.html

#### Edit Button Logic
```javascript
function updateEditButton() {
  if (isOwner && !isPublished) {
    btnEdit.style.display = "inline-block";
  } else {
    btnEdit.style.display = "none";
  }
}
```

Called when:
- Page loads
- Publish button clicked
- Unpublish button clicked

### demand-new.html

#### Edit Mode Detection
```javascript
const params = new URLSearchParams(location.search);
const editId = params.get("id");
let editing = false;
```

#### Edit Mode Flow

1. **Load Existing Data**
   ```javascript
   if (editId) {
     editing = true;
     // Load demand header
     // Load items subcollection
     // Populate form fields
   }
   ```

2. **Save Changes**
   ```javascript
   if (editing) {
     // Update header document
     // Delete old items
     // Add new items
     // Redirect to detail page
   }
   ```

#### Security Checks

When in edit mode:
- ✅ Verify demand exists
- ✅ Verify user is owner
- ✅ Verify demand is not published
- ❌ Redirect if any check fails

## 📊 Data Structure

### Demand Document (Enhanced)
```javascript
{
  // ... existing fields ...
  published: boolean,        // Draft vs Published
  categoryTags: string[],    // Multiple categories
  customCategory: string,    // Custom category
  siteName: string,          // For site grouping
  createdAt: Timestamp,      // For month grouping
  priority: string,          // For priority grouping
  // ... other fields ...
}
```

## 🔐 Security & Permissions

### Edit Permissions
- ✅ Only owner can edit
- ✅ Only drafts can be edited
- ✅ Published demands must be unpublished first

### Delete Permissions
- ✅ Only owner can delete
- ✅ Works for both draft and published demands
- ⚠️ Consider adding restriction: only allow deleting drafts

### Firestore Rules
Already in place from previous implementation:
- Owner can update their own demands
- ViewerIds control read access

## 🎯 Testing Checklist

### Filtering & Grouping
- [ ] Status filter works (Draft/Published/All)
- [ ] Priority filter works (Price/Speed/Quality/All)
- [ ] Group by Site shows correct groups
- [ ] Group by Category shows correct groups
- [ ] Group by Status shows Draft/Gönderildi groups
- [ ] Group by Priority shows correct groups
- [ ] Group by Month shows YYYY-MM format
- [ ] Group headers are collapsible
- [ ] Group counts are accurate
- [ ] Pagination disappears when grouped
- [ ] Pagination works when not grouped

### Draft Editing
- [ ] Edit button visible for owner + draft
- [ ] Edit button hidden for non-owner
- [ ] Edit button hidden for published demands
- [ ] Edit mode loads all fields correctly
- [ ] Edit mode loads all items correctly
- [ ] Edit mode saves changes correctly
- [ ] Can't edit published demands directly
- [ ] Can unpublish → edit → republish
- [ ] Edit button reappears after unpublish
- [ ] Edit button disappears after publish

### Delete Functionality
- [ ] Delete button only for owners
- [ ] Delete confirmation dialog works
- [ ] Delete removes demand from list
- [ ] Delete updates UI immediately

## 🐛 Known Limitations

1. **Firestore Index Required**
   - First-time grouping/filtering may be slow
   - Create indexes as suggested by Firebase

2. **Category Grouping**
   - Demands with many categories appear in multiple groups
   - This is intentional but may seem like duplication

3. **Delete Items Subcollection**
   - Current implementation deletes demand document
   - Items subcollection orphaned (but invisible)
   - Consider adding cleanup: delete items before deleting demand

4. **Pagination State**
   - Resets to page 1 when filters change
   - This is expected behavior

## 💡 Best Practices

### For Users

1. **Before Publishing**
   - Review all details
   - Check categories are correct
   - Verify items list

2. **To Edit Published Demand**
   - Click "Geri Çek" first
   - Make edits
   - Re-publish with "Tedarikçilere Gönder"

3. **Using Grouping**
   - Use "By Category" to see demand distribution
   - Use "By Month" for historical analysis
   - Use "By Status" to focus on drafts or published

### For Developers

1. **Adding New Group Options**
   - Add option to `#f-group` select
   - Add case to `groupKey()` function
   - Return string for single group, array for multi-group

2. **Changing Pagination Size**
   - Modify `PAGE_SIZE` constant
   - No other changes needed

3. **Adding Filters**
   - Add filter control to HTML
   - Add listener in `applyFilters()`
   - Add filtering logic to `filtered` array

## 🚀 Future Enhancements

Potential improvements:
1. **Advanced Filters**
   - Date range filter
   - Multi-category filter
   - Search by text

2. **Sorting Options**
   - Sort by any column
   - Ascending/descending toggle

3. **Bulk Actions**
   - Select multiple demands
   - Bulk publish/unpublish
   - Bulk delete

4. **Export Grouped Data**
   - Export current view to Excel
   - Export specific group

5. **Edit Published Demands**
   - Allow minor edits to published demands
   - Track change history
   - Notify suppliers of changes

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify Firestore indexes are created
3. Ensure user has proper permissions
4. Check demand status (draft vs published)

## ✅ Summary

This implementation provides:
- ✅ Flexible grouping and filtering
- ✅ Smooth draft editing workflow
- ✅ Better list navigation with pagination
- ✅ Owner-only delete functionality
- ✅ Improved UX for managing demands

The system now supports the complete demand lifecycle from creation through editing to publication!
