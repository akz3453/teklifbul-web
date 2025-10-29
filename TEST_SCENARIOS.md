# Test Scenarios for Teklifbul Fixes

## 1. "Talep Detayı" Permission Error Fix

### Scenario 1.1: User accessing their own demand
- **Precondition**: User has created a demand
- **Action**: User navigates to the demand detail page for their own demand
- **Expected Result**: User can view the demand details without permission error

### Scenario 1.2: User accessing shared demand
- **Precondition**: Another user has created a published demand and added current user to viewerIds
- **Action**: User navigates to the demand detail page for a shared demand
- **Expected Result**: User can view the demand details without permission error

### Scenario 1.3: User accessing unauthorized demand
- **Precondition**: User tries to access a demand they don't own and isn't shared with them
- **Action**: User navigates to the demand detail page for an unauthorized demand
- **Expected Result**: User receives appropriate error message and is redirected

## 2. Company Creation During User Registration

### Scenario 2.1: New user registration
- **Precondition**: New user signs up and selects a role
- **Action**: User completes the role selection and profile creation process
- **Expected Result**: 
  - A company document is created in the companies collection
  - User profile includes reference to the created company
  - User is redirected to demands page

### Scenario 2.2: Existing user profile update
- **Precondition**: Existing user with profile updates their information
- **Action**: User updates their profile information
- **Expected Result**: 
  - Company information is updated if changed
  - User profile is updated with new information
  - Company reference remains intact

## 3. Firestore Security Rules

### Scenario 3.1: User accessing their own company
- **Precondition**: User has a company associated with their profile
- **Action**: User tries to read their company document
- **Expected Result**: User can read the company document

### Scenario 3.2: User accessing another user's company
- **Precondition**: User tries to access a company they don't own
- **Action**: User tries to read another user's company document
- **Expected Result**: User receives permission denied error

### Scenario 3.3: User creating a company
- **Precondition**: Authenticated user
- **Action**: User tries to create a company document
- **Expected Result**: 
  - User can create a company with themselves as ownerId
  - User cannot create a company with someone else as ownerId

## 4. Error Handling and Logging

### Scenario 4.1: Network error during demand load
- **Precondition**: Simulate network error
- **Action**: User tries to load a demand detail page
- **Expected Result**: 
  - Appropriate error message is displayed
  - User is redirected to demands page
  - Error is logged in console

### Scenario 4.2: Permission error during bids load
- **Precondition**: User without proper permissions tries to load bids
- **Action**: User navigates to bids page
- **Expected Result**: 
  - User-friendly error message is displayed
  - Error is logged in console
  - User can navigate to other pages

## 5. Multi-role Support

### Scenario 5.1: User with both buyer and supplier roles
- **Precondition**: User has both buyer and supplier roles
- **Action**: User accesses different sections of the application
- **Expected Result**: 
  - User can access both buyer and supplier features
  - UI adapts to show relevant options for each role
  - Company information is correctly associated

### Scenario 5.2: Role switching
- **Precondition**: User updates their roles in settings
- **Action**: User changes their roles
- **Expected Result**: 
  - User profile is updated with new roles
  - UI updates to reflect new role capabilities
  - Existing data remains accessible