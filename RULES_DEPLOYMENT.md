# Firestore & Storage Rules Deployment Guide

This guide explains how to deploy the updated security rules for Firestore and Storage.

## Prerequisites

1. Firebase CLI installed: `npm install -g firebase-tools`
2. Logged in to Firebase: `firebase login`
3. Firebase project initialized in this directory

## Deployment Steps

### Option 1: Deploy via Firebase Console (Recommended for Quick Updates)

#### Firestore Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules** tab
4. Copy the content from `firestore.rules` file
5. Paste it into the rules editor
6. Click **Publish**

#### Storage Rules

1. In Firebase Console, navigate to **Storage** → **Rules** tab
2. Copy the content from `storage.rules` file
3. Paste it into the rules editor
4. Click **Publish**

### Option 2: Deploy via Firebase CLI

#### Initialize Firebase (if not already done)

```bash
firebase init
```

Select:
- Firestore
- Storage

When prompted for rules files, use:
- Firestore: `firestore.rules`
- Storage: `storage.rules`

#### Deploy Rules

Deploy both at once:
```bash
firebase deploy --only firestore:rules,storage:rules
```

Or deploy individually:
```bash
# Deploy Firestore rules only
firebase deploy --only firestore:rules

# Deploy Storage rules only
firebase deploy --only storage:rules
```

## What's New in These Rules

### Firestore Rules

1. **Users Collection**: 
   - Users can read/write their own profile
   - All authenticated users can read supplier profiles (for targeting)

2. **Demands Collection**:
   - Only owner or users in `viewerIds` array can read
   - Only owner can create/update/delete

3. **Items Subcollection**:
   - Inherits parent demand permissions

4. **Bids Collection**:
   - All authenticated users can read
   - Only bid creator can update/delete their own bids

5. **Files Subcollection**:
   - Only demand owner can upload/delete
   - Viewers can read if demand is published

### Storage Rules

1. **Supplier Documents** (`suppliers/{uid}/{fileName}`):
   - Anyone authenticated can read (for verification)
   - Only the owner can upload/modify

2. **Demand Files** (`demands/{demandId}/{userId}/{fileName}`):
   - Anyone authenticated can read
   - Only the uploader can write

## Required Firestore Indexes

After deploying rules, create these composite indexes:

### Demands Collection

1. **Index 1**: For buyer's own demands
   - Collection: `demands`
   - Fields: 
     - `createdBy` (Ascending)
     - `createdAt` (Descending)

2. **Index 2**: For supplier's visible demands
   - Collection: `demands`
   - Fields:
     - `viewerIds` (Array-contains)
     - `createdAt` (Descending)

3. **Index 3**: For supplier targeting by category
   - Collection: `users`
   - Fields:
     - `role` (Ascending)
     - `categories` (Array-contains)

### Create Indexes

You can create these via:
1. Firebase Console → Firestore Database → Indexes tab
2. Or wait for Firebase to suggest them when you run queries (it will show a link in console errors)

## Verification

After deployment, test:

1. ✅ Supplier registration with categories
2. ✅ Buyer creates demand with matching categories
3. ✅ Supplier sees the demand in their list
4. ✅ File uploads work
5. ✅ Permissions are enforced correctly

## Troubleshooting

**Permission Denied Errors:**
- Check that rules are published
- Verify user is authenticated
- Check that required fields (like `createdBy`, `viewerIds`) exist in documents

**Index Required Errors:**
- Click the link in the error message to auto-create the index
- Or manually create the index as described above

**Storage Upload Fails:**
- Verify Storage rules are published
- Check file path matches rules pattern
- Ensure user is authenticated

## Support

If you encounter issues:
1. Check browser console for detailed error messages
2. Review Firebase Console → Usage tab for rule evaluation errors
3. Test rules in the Firebase Console rules simulator
