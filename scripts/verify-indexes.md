# Firestore Index Requirements for Category Matching

## Required Composite Indexes

The category matching system requires the following Firestore composite indexes to function properly.

### Index 1: Supplier Matching by Category IDs

**Collection:** `users`

**Fields:**
- `roles` (Ascending) - array-contains filter
- `isActive` (Ascending) - equality filter  
- `supplierCategoryIds` (Ascending) - array-contains-any filter

**Query Pattern:**
```javascript
query(
  collection(db, 'users'),
  where('isActive', '==', true),
  where('roles', 'array-contains', 'supplier'),
  where('supplierCategoryIds', 'array-contains-any', ['CAT.ELEKTRIK', 'CAT.AYDINLATMA'])
)
```

**Firestore Console Link:**
(Will be provided by Firestore error message when query is first run)

---

### Index 2: Supplier Matching by Legacy Slugs (Backward Compatibility)

**Collection:** `users`

**Fields:**
- `roles` (Ascending) - array-contains filter
- `isActive` (Ascending) - equality filter
- `supplierCategoryKeys` (Ascending) - array-contains-any filter

**Query Pattern:**
```javascript
query(
  collection(db, 'users'),
  where('isActive', '==', true),
  where('roles', 'array-contains', 'supplier'),
  where('supplierCategoryKeys', 'array-contains-any', ['elektrik', 'aydinlatma'])
)
```

**Firestore Console Link:**
(Will be provided by Firestore error message when query is first run)

---

### Index 3: Supplier Matching by Legacy Names (Backward Compatibility)

**Collection:** `users`

**Fields:**
- `roles` (Ascending) - array-contains filter
- `isActive` (Ascending) - equality filter
- `supplierCategories` (Ascending) - array-contains-any filter

**Query Pattern:**
```javascript
query(
  collection(db, 'users'),
  where('isActive', '==', true),
  where('roles', 'array-contains', 'supplier'),
  where('supplierCategories', 'array-contains-any', ['Elektrik', 'Aydınlatma'])
)
```

**Firestore Console Link:**
(Will be provided by Firestore error message when query is first run)

---

## How to Create Indexes

### Method 1: Automatic (Recommended)

1. Run the application and trigger a supplier matching query
2. Firestore will log an error with a direct link to create the required index
3. Click the link in the console/error message
4. Firestore Console will open with the index creation form pre-filled
5. Click "Create Index"

### Method 2: Manual (Firestore Console)

1. Go to [Firestore Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to Firestore Database → Indexes
4. Click "Create Index"
5. Configure each index as described above

### Method 3: Firebase CLI (firestore.indexes.json)

Create/update `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "roles",
          "arrayConfig": "CONTAINS"
        },
        {
          "fieldPath": "isActive",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "supplierCategoryIds",
          "arrayConfig": "CONTAINS"
        }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "roles",
          "arrayConfig": "CONTAINS"
        },
        {
          "fieldPath": "isActive",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "supplierCategoryKeys",
          "arrayConfig": "CONTAINS"
        }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "roles",
          "arrayConfig": "CONTAINS"
        },
        {
          "fieldPath": "isActive",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "supplierCategories",
          "arrayConfig": "CONTAINS"
        }
      ]
    }
  ]
}
```

Then deploy:
```bash
firebase deploy --only firestore:indexes
```

---

## Verification

After creating indexes, verify they are active:

1. Go to Firestore Console → Indexes
2. Check that all three indexes show "Enabled" status
3. Index building may take a few minutes for large collections

---

## Notes

- **Index Building Time:** Large collections may take 10-30 minutes to build indexes
- **Cost:** Composite indexes consume additional storage but enable efficient queries
- **Maintenance:** Indexes are automatically maintained by Firestore as data changes

---

**Last Updated:** 2025-11-02

