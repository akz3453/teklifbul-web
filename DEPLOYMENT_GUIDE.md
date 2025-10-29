# Teklifbul Deployment Guide

This guide provides step-by-step instructions for deploying the Teklifbul application with all the new features.

## Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Node.js 18+ installed
- Firebase project created
- Service account key downloaded

## Deployment Steps

### 1. Deploy Firestore Rules

```bash
# Deploy the updated security rules
firebase deploy --only firestore:rules
```

**What this does:**
- Updates Firestore security rules with new RBAC helpers
- Enables role-based access control for demands
- Supports new visibility model (public/company/private)

### 2. Deploy Firestore Indexes

```bash
# Deploy the composite indexes
firebase deploy --only firestore:indexes
```

**What this does:**
- Creates required composite indexes for efficient queries
- Enables filtering by `isPublished` + `visibility` + `createdAt`
- Supports bid queries by `demandId` and `supplierId`
- Adds audit log indexes for tracking changes

### 3. Deploy Firebase Functions

```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Deploy functions
firebase deploy --only functions
```

**What this does:**
- Deploys category normalization functions
- Deploys SATFK generation function for new demands
- Deploys search by SATFK HTTP function
- Automatically converts category names to slugs
- Adds audit logging for publish/unpublish events
- Triggers on demand and user document changes

### 4. Run Backfill Scripts

```bash
# Set up service account authentication
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"

# Run category backfill
npm run backfill:categories

# Run SATFK backfill
npm run backfill:satfk
```

**What this does:**
- **Category Backfill**: Normalizes existing category data to slug format
- **SATFK Backfill**: Generates SATFK for existing demands without one
- Updates both demands and supplier categories
- Ensures consistent category matching and ID generation
- Processes data in batches for efficiency

### 5. Verify Deployment

#### Test Firestore Rules
```bash
# Start Firestore emulator
firebase emulators:start --only firestore

# Run tests (if available)
npm test
```

#### Test Functions
```bash
# Check function logs
firebase functions:log

# Test category normalization
# Create a test demand with non-slug categories
# Verify they get normalized automatically
```

#### Test UI Features
1. **Publish Flow**: Create a demand and test publish/unpublish
2. **Visibility**: Test public/company/private visibility settings
3. **SATFK Generation**: Create new demands and verify SATFK is auto-generated
4. **SATFK Search**: Test search functionality with SATFK codes
5. **SATFK Immutability**: Verify SATFK cannot be changed after creation
6. **Error Handling**: Verify error states display properly
7. **Category Matching**: Test supplier matching with normalized categories

## Configuration

### Environment Variables
No additional environment variables are required. The application uses Firebase's built-in configuration.

### Service Account Permissions
Ensure your service account has the following roles:
- Firestore Service Agent
- Cloud Functions Admin
- Firebase Admin

## Troubleshooting

### Common Issues

#### 1. Index Creation Errors
**Error**: "The query requires an index"
**Solution**: 
- Check Firebase Console > Firestore > Indexes
- Wait for index creation to complete
- Verify all required indexes are present

#### 2. Permission Denied Errors
**Error**: "Permission denied" when accessing demands
**Solution**:
- Verify Firestore rules are deployed correctly
- Check user authentication status
- Ensure user has proper role assignments

#### 3. Function Deployment Errors
**Error**: Function deployment fails
**Solution**:
- Check Node.js version (requires 18+)
- Verify all dependencies are installed
- Check Firebase project configuration

#### 4. Category Normalization Not Working
**Error**: Categories not being normalized
**Solution**:
- Verify functions are deployed
- Check function logs for errors
- Ensure triggers are enabled

### Monitoring

#### Firestore Rules
- Monitor rule evaluation in Firebase Console
- Check for permission denied errors in logs

#### Functions
- Monitor function execution in Firebase Console
- Check function logs for errors
- Monitor function performance metrics

#### Indexes
- Monitor index usage in Firebase Console
- Check for slow queries
- Verify index creation status

## Rollback Plan

If issues occur after deployment:

### 1. Rollback Firestore Rules
```bash
# Deploy previous version of rules
firebase deploy --only firestore:rules --project your-project-id
```

### 2. Rollback Functions
```bash
# Deploy previous version of functions
firebase deploy --only functions --project your-project-id
```

### 3. Rollback Indexes
```bash
# Deploy previous version of indexes
firebase deploy --only firestore:indexes --project your-project-id
```

## Post-Deployment Checklist

- [ ] Firestore rules deployed successfully
- [ ] All indexes created and ready
- [ ] Functions deployed and running
- [ ] Category backfill completed
- [ ] SATFK backfill completed
- [ ] SATFK generation working for new demands
- [ ] SATFK search functionality working
- [ ] SATFK immutable rule enforced
- [ ] Publish flow working correctly
- [ ] Visibility settings functioning
- [ ] Error handling displaying properly
- [ ] No console errors in browser
- [ ] All existing features still working
- [ ] Performance metrics within acceptable range

## Deploy Category Groups Feature

### 1. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 2. Deploy Firebase Functions (if any)
```bash
firebase deploy --only functions
```

### 3. Build Static Assets (if needed)
```bash
# No build step required for vanilla JS modules
```

### 4. Test Category Groups
- Navigate to demand creation page
- Verify "Kategori Grupları" section appears
- Test creating a new group
- Test applying group to category chips
- Test group management (edit/delete)

### 5. Post-Deployment Checklist
- [ ] Category groups section visible on demand creation page
- [ ] Can create new category groups
- [ ] Can select and apply existing groups
- [ ] Group management modal works
- [ ] Categories are stored as slugs
- [ ] User isolation works (users only see their own groups)
- [ ] No console errors
- [ ] Existing demand functionality unchanged

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Firebase Console logs
3. Check browser console for client-side errors
4. Verify all deployment steps were completed

## Security Notes

- All new rules maintain backward compatibility
- Existing data remains accessible
- New features are opt-in (demands default to private)
- Audit logs track all publish/unpublish changes
- Category normalization is automatic and safe