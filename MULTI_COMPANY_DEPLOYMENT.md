# Multi-Company Membership System Deployment Guide

## Overview

This guide explains how to deploy the new multi-company membership system that allows users to:
1. Create and join companies
2. Manage company memberships
3. Filter demands by company

## Files Created

1. **[company-invite.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/company-invite.html)** - Admin page to generate company invitation codes
2. **[company-join.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/company-join.html)** - User page to join companies using invitation codes
3. **[firestore.rules](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/firestore.rules)** - Updated Firestore security rules with company membership support

## Updated Files

1. **[demand-new.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/demand-new.html)** - Added companyId to demand creation
2. **[demands.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/demands.html)** - Added company filtering to demand listing
3. **[dashboard.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/dashboard.html)** - Updated company creation logic
4. **[demand-detail.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/demand-detail.html)** - Updated company loading logic

## Deployment Steps

### 1. Deploy Firestore Rules

The new Firestore rules implement a comprehensive membership system:

```javascript
// Companies can only be read by owner or members
allow read: if isSignedIn() && (
  resource.data.ownerId == request.auth.uid ||
  exists(/databases/$(database)/documents/companies/$(companyId)/memberships/$(request.auth.uid))
);

// Companies can only be created by setting ownerId to current user
allow create: if isSignedIn() && request.resource.data.ownerId == request.auth.uid;

// Companies can only be updated/deleted by owner
allow update, delete: if isSignedIn() && resource.data.ownerId == request.auth.uid;

// Demands can only be created by members of the company
allow create: if isSignedIn() &&
  request.resource.data.createdBy == request.auth.uid &&
  request.resource.data.companyId is string &&
  exists(/databases/$(database)/documents/companies/$(request.resource.data.companyId)/memberships/$(request.auth.uid));

// Demands can only be updated/deleted by owner or company members
allow update, delete: if isSignedIn() && (
  resource.data.createdBy == request.auth.uid ||
  (
    resource.data.companyId is string &&
    exists(/databases/$(database)/documents/companies/$(resource.data.companyId)/memberships/$(request.auth.uid))
  )
);
```

To deploy the rules:

1. Copy the contents of [firestore.rules](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/firestore.rules) to your Firebase Console
2. Click "Publish"

### 2. Upload New HTML Files

Upload these new files to your web server:
- [company-invite.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/company-invite.html)
- [company-join.html](file:///c:/Users/faruk/OneDrive/Desktop/teklifbul-web/company-join.html)

### 3. Test the System

1. **Create a company**:
   - Log in as a user
   - Visit dashboard.html to auto-create your default company

2. **Generate an invitation**:
   - Log in as a company owner
   - Visit company-invite.html
   - Enter your companyId
   - Click "Yeni Davet Kodu"
   - Copy the generated invitation code

3. **Join a company**:
   - Log in as another user
   - Visit company-join.html
   - Enter the companyId and invitation code
   - Click "Katıl"

4. **Create demands**:
   - Visit demand-new.html
   - Select a company from the dropdown
   - Create a new demand
   - Verify the companyId is stored with the demand

5. **Filter demands**:
   - Visit demands.html
   - Select different companies from the dropdown
   - Verify demands are filtered by company

## Data Model Changes

### Users Collection
```javascript
{
  companies: string[],        // Array of company IDs user has access to
  activeCompanyId: string     // Currently selected company ID
}
```

### Companies Collection
```javascript
{
  name: string,               // Company name
  ownerId: string,            // User ID of company owner
  createdAt: timestamp        // Creation timestamp
}
```

### Companies Subcollections

#### invites
```javascript
{
  active: boolean,            // Whether the invite is active
  createdAt: timestamp,       // Creation timestamp
  ownerId: string             // User ID of company owner
}
```

#### memberships
```javascript
{
  token: string,              // Invitation token used to join
  joinedAt: timestamp         // When the user joined
}
```

### Demands Collection
```javascript
{
  // ... existing fields ...
  companyId: string           // ID of company this demand belongs to
}
```

## Security Features

1. **Membership Verification**: Users can only access companies they're members of
2. **Company Ownership**: Only company owners can create/delete companies
3. **Demand Ownership**: Only company members can create demands for that company
4. **Invite System**: Controlled company membership through invitation codes
5. **Data Isolation**: Users can only see demands from their companies

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**:
   - Ensure Firestore rules are published
   - Verify user is a member of the company
   - Check that companyId is correctly set on demands

2. **Company Not Found**:
   - Verify company document exists
   - Check companyId spelling
   - Ensure user has membership document

3. **Invitation Not Working**:
   - Verify invite token is active
   - Check that invite document exists
   - Ensure companyId matches

### Debugging Tips

1. **Enable Firestore Logging**:
   ```javascript
   import { enableLogging } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
   enableLogging(true);
   ```

2. **Check Browser Console**:
   - Look for error messages
   - Verify network requests
   - Check Firestore rules evaluation

3. **Verify Data Structure**:
   - Check Firestore Console for correct document structure
   - Verify subcollections are created properly
   - Confirm field names match expected values

## Migration Notes

Existing data will continue to work with the new system:

1. **Existing Companies**: Will need to be updated to use ownerId instead of createdBy
2. **Existing Demands**: Will be visible to all users until companyId is set
3. **Existing Users**: Will auto-create "Kendi Firmam" company on first login

To migrate existing data:

1. Update company documents to include ownerId field
2. Set companyId on existing demands
3. Add companies array to user documents

## Future Enhancements

1. **Company Settings Page**: Allow owners to manage company details
2. **Member Management**: Allow owners to remove members
3. **Role-Based Access**: Different permission levels within companies
4. **Company Switching**: Quick company switching without page reload
5. **Company Analytics**: Statistics and reports by company