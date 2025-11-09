# 🧠 Cursor Development Prompt - Settings.html Enhancement

## Context
We are enhancing settings.html after applying SETTINGS_APPROVAL_POLICY_PATCH.md. The patch added approval policy management with role-based permissions. Now fix remaining issues and strengthen reliability.

## Goals

### 1. Replace setTimeout Auth Check with Robust Async Listener
**Current Issue**: Using `setTimeout` with 100ms delay for auth check is unreliable.
**Solution**: 
- Use `onAuthStateChanged(auth, user => ...)` to ensure db/auth are ready
- Remove setTimeout-based auth checks
- Ensure auth state is properly observed before making Firestore calls

```javascript
// Example implementation:
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // User is authenticated, proceed with data loading
    await loadAndSetupApprovalPolicyManagement(companyId, userData);
  }
});
```

### 2. Strengthen Role-Based Permission
**Current Issue**: Permission check is only client-side.
**Solution**:
- Keep `unlimitedApprovalRoles` client-side for UI visibility
- Add Firestore security rules check concept (client-side verification)
- Verify user role in `saveApprovalPolicy` before allowing write
- Add serverTimestamp to track who last modified

```javascript
// Before save, verify:
const userRole = userData.companyRole || userData.requestedCompanyRole || '';
if (!unlimitedApprovalRoles.includes(userRole)) {
  toast.error('❌ Bu işlem için yetkiniz yok.');
  return;
}
```

### 3. Implement Proper Audit Logging
**Current Issue**: Audit logging exists but may be incomplete.
**Solution**:
- Log document to "audit" collection with:
  - `action`: 'APPROVAL_POLICY_UPDATED'
  - `actor_user_id`: current user UID
  - `actor_role_key`: user role
  - `timestamp`: serverTimestamp()
  - `policyDiff`: object showing what changed (before/after)
  - `entity_type`: 'company'
  - `entity_id`: companyId
  - `result`: 'success' | 'failed'
  - `metadata`: full policy object

```javascript
const auditData = {
  entity_type: 'company',
  entity_id: companyId,
  action: 'APPROVAL_POLICY_UPDATED',
  actor_user_id: auth.currentUser?.uid,
  actor_role_key: userRole,
  result: 'success',
  policyDiff: {
    limitsAdded: newLimits.length,
    limitsRemoved: oldLimits.length - newLimits.length,
    limitsModified: modifiedCount
  },
  metadata: { approvalPolicy },
  created_at: serverTimestamp()
};
```

### 4. Add Client-Side Validation for Approval Limit Values
**Current Issue**: No validation for limit values.
**Solution**:
- Must be numeric and >= 0
- Role must be selected
- Description is optional but should be sanitized
- Show validation errors with toast notifications

```javascript
function validateApprovalLimit(maxAmount, role) {
  if (role && !maxAmount) {
    return { valid: false, error: 'Maksimum tutar belirtilmelidir' };
  }
  if (maxAmount && isNaN(parseFloat(maxAmount))) {
    return { valid: false, error: 'Maksimum tutar sayı olmalıdır' };
  }
  if (maxAmount < 0) {
    return { valid: false, error: 'Maksimum tutar negatif olamaz' };
  }
  return { valid: true };
}
```

### 5. Sort Approval Limits by Role Priority Before Saving
**Current Issue**: Limits saved in random order.
**Solution**:
- Define role priority order
- Sort limits by priority before saving
- Highest priority roles first (CEO, İşveren, YKB, Genel Müdür should be at top if present)

```javascript
const rolePriority = {
  'buyer:ceo': 1,
  'buyer:isveren': 2,
  'buyer:yonetim_kurulu_baskani': 3,
  'buyer:genel_mudur': 4,
  'buyer:genel_mudur_yardimcisi': 5,
  'buyer:satinalma_muduru': 6,
  'buyer:satinalma_yetkilisi': 7,
  'buyer:satinalma_uzmani': 8,
  'buyer:satinalma_uzman_yardimcisi': 9
};

approvalLimits.sort((a, b) => {
  const priorityA = rolePriority[a.role] || 999;
  const priorityB = rolePriority[b.role] || 999;
  return priorityA - priorityB;
});
```

### 6. Replace Flag-Based Event Binding with Safer CloneNode Binding Helper
**Current Issue**: Using flags to prevent duplicate listeners is fragile.
**Solution**:
- Create a helper function that safely binds events
- Use cloneNode to remove old listeners
- Ensure only one listener per element

```javascript
function safeBindEventListener(elementId, eventType, handler) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element ${elementId} not found`);
    return;
  }
  
  // Clone to remove old listeners
  const newElement = element.cloneNode(true);
  element.parentNode.replaceChild(newElement, element);
  
  // Add new listener
  newElement.addEventListener(eventType, handler);
  
  return newElement;
}
```

### 7. Add Toast Notifications
**Current Issue**: Using `alert()` is not user-friendly.
**Solution**:
- Replace all `alert()` calls with toast notifications
- Success: green toast with checkmark
- Error: red toast with X icon
- Warning: yellow toast with warning icon
- Info: blue toast with info icon

```javascript
// Toast helper functions (if not already available)
function toastSuccess(message) {
  // Use existing toast library or create simple implementation
  console.log('✅', message);
  // Show toast UI
}

function toastError(message) {
  console.error('❌', message);
  // Show error toast UI
}

function toastWarning(message) {
  console.warn('⚠️', message);
  // Show warning toast UI
}

function toastInfo(message) {
  console.info('ℹ️', message);
  // Show info toast UI
}
```

### 8. Add Fallback Defaults in loadAndSetupApprovalPolicyManagement
**Current Issue**: When no policy exists, defaults may not be complete.
**Solution**:
- Ensure all required fields have defaults
- Validate policy structure after loading
- Show informative message if creating new policy

```javascript
const defaultPolicy = {
  require_at_least_one_top_approver: true,
  top_approver_roles: [
    'buyer:genel_mudur',
    'buyer:genel_mudur_yardimcisi',
    'buyer:ceo',
    'buyer:isveren',
    'buyer:yonetim_kurulu_baskani',
    'buyer:yonetim_kurulu_uyesi'
  ],
  reminder_hours: [24, 48],
  strict_top_required: false,
  allowed_final_approver_roles: ['buyer:genel_mudur'],
  approval_limits: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
};

const currentPolicy = companyData.approvalPolicy || defaultPolicy;
```

### 9. Use Await Import for Firebase Modules Dynamically with Caching
**Current Issue**: Multiple dynamic imports may be inefficient.
**Solution**:
- Cache imported modules after first load
- Use a module cache object
- Ensure imports are only done once per session

```javascript
// Module cache
const firebaseModuleCache = {
  firestore: null,
  auth: null
};

async function getFirestoreModules() {
  if (!firebaseModuleCache.firestore) {
    firebaseModuleCache.firestore = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
  }
  return firebaseModuleCache.firestore;
}

async function getAuthModules() {
  if (!firebaseModuleCache.auth) {
    firebaseModuleCache.auth = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js");
  }
  return firebaseModuleCache.auth;
}
```

### 10. Wrap All Firestore Calls with Try/Catch and Console.Error + ToastError
**Current Issue**: Some Firestore calls may not have proper error handling.
**Solution**:
- Wrap all Firestore operations in try/catch
- Log errors to console with context
- Show user-friendly error messages via toast
- Don't expose internal error details to users

```javascript
async function safeFirestoreOperation(operation, errorMessage) {
  try {
    return await operation();
  } catch (error) {
    console.error('❌ Firestore operation failed:', error);
    toastError(errorMessage || 'Bir hata oluştu. Lütfen tekrar deneyin.');
    throw error; // Re-throw if caller needs to handle
  }
}

// Usage:
const companyDoc = await safeFirestoreOperation(
  () => getDoc(doc(db, 'companies', companyId)),
  'Şirket bilgileri yüklenemedi'
);
```

## Code Review Checklist

Review the entire file for:

- [ ] **Unused imports**: Remove any imports that are not used
- [ ] **Variables defined but never used**: Clean up unused variables
- [ ] **Any .address or .doc.data() syntax remnants**: Ensure proper Firestore data access patterns
- [ ] **Any lingering users/{uid}.approvalPolicy writes**: Should not exist - approvalPolicy only in companies/{companyId}
- [ ] **Inconsistent error handling**: Ensure all async operations have try/catch
- [ ] **Magic numbers**: Replace with named constants
- [ ] **Hard-coded strings**: Move to constants or localization
- [ ] **Console.log in production**: Review and remove or convert to debug-only logs

## Additional Improvements

### UI/UX Enhancements
- Add "Last Updated By" and "Update Date" columns to approval limit table
- Show loading states during save operations
- Add confirmation dialog before deleting limits
- Enable drag-and-drop reordering of limits (optional)

### Performance Optimizations
- Use Firestore cache (`getDocFromCache`) for offline support
- Show online/offline status indicator
- Implement pagination if limits exceed 50 items
- Debounce save operations to prevent multiple simultaneous saves

### Error Tracking
- Add Sentry or window.onerror for client-side error logging
- Track error frequency and types
- Log user actions for debugging

### Code Style
- Use `async function` declaration instead of arrow functions for all async functions
- Consistent naming: camelCase for functions, UPPER_CASE for constants
- Add JSDoc comments to all public functions
- Keep Turkish UI labels but comment all technical changes in English

### Localization
- Replace all `alert()` with toast notifications
- Ensure all toast messages are in Turkish
- Use consistent error message format

## Expected Output

1. **Clean, production-ready settings.html** with all improvements applied
2. **Diff file** showing all changes (if requested)
3. **Updated documentation** reflecting new patterns
4. **Test cases** for critical paths

## Testing Requirements

Before considering complete, verify:

- [ ] User with correct role can add/edit/delete limits
- [ ] User without permission sees appropriate message
- [ ] Limits save correctly to Firestore
- [ ] Limits load correctly on page navigation
- [ ] Validation prevents invalid data
- [ ] Toast notifications appear correctly
- [ ] Audit logs are created
- [ ] Error handling works for all edge cases
- [ ] No console errors in production mode
- [ ] Performance is acceptable (< 2s load time)

## Notes

- Keep all Turkish UI labels and user-facing messages
- Comment all new technical changes in English
- Maintain backward compatibility with existing data
- Follow Teklifbul Rule v1.0 coding standards
- Ensure accessibility (ARIA labels, keyboard navigation)

---

**Instructions for Cursor**: Apply all improvements systematically, test each change, and ensure the final code is production-ready with proper error handling, validation, and user feedback mechanisms.

