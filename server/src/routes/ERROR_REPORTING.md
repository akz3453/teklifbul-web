# Client Error Reporting

**Teklifbul Rule v1.0 - Client Error Reporting v1**

Frontend'ten gelen runtime hataları backend'e gönderilir ve Firestore'da toplanır. Admin panelden görüntülenebilir.

---

## 📋 Endpoints

### 1. POST /api/client-errors

Frontend'ten gelen runtime hataları kaydet.

**Auth:** Optional (Authorization header varsa verifyToken, yoksa anonymous)

**Rate Limit:** 30 requests / 10 minutes (IP + sessionId + userId)

**Request Body:**
```json
{
  "sessionId": "abc123",
  "severity": "error",
  "message": "TypeError: Cannot read property 'x' of undefined",
  "stack": "at Object.fn (file.js:123:45)\n...",
  "pageUrl": "https://teklifbul.com/sales/123",
  "route": "/sales/:id",
  "userAgent": "Mozilla/5.0...",
  "release": "v1.2.3",
  "meta": {
    "component": "SalesDetail",
    "userId": "user123"
  },
  "fingerprint": "abc123def456",
  "companyId": "company123"
}
```

**Response (200):**
```json
{
  "ok": true,
  "id": "firestore-doc-id"
}
```

**Field Limits:**
- `message`: max 500 chars
- `stack`: max 4000 chars
- `pageUrl`: max 800 chars
- `route`: max 200 chars
- `userAgent`: max 400 chars
- `release`: max 50 chars

**Security:**
- Sensitive data masking: `Authorization: Bearer`, `token=`, `apiKey`, `secret` patterns are masked
- Meta keys: `password`, `token`, `authorization`, `secret`, `apiKey` are dropped

**Fingerprint:**
- Auto-generated if not provided (SHA256 hash of message + stack + route + pageUrl)
- Used for deduplication

---

### 2. GET /api/client-errors

Admin panelden hataları listele.

**Auth:** Required (verifyToken)

**Permission:** `admin.errors.view`

**Query Parameters:**
- `companyId` (required): Company ID (multi-tenant filter)
- `limit` (optional, default: 50, max: 200): Number of results
- `severity` (optional, default: 'all'): Filter by severity ('error', 'warn', 'all')

**Response (200):**
```json
{
  "ok": true,
  "items": [
    {
      "id": "doc-id",
      "companyId": "company123",
      "userId": "user123",
      "sessionId": "abc123",
      "severity": "error",
      "message": "TypeError: Cannot read property 'x' of undefined",
      "stack": "...",
      "pageUrl": "https://teklifbul.com/sales/123",
      "route": "/sales/:id",
      "userAgent": "Mozilla/5.0...",
      "release": "v1.2.3",
      "meta": {},
      "fingerprint": "abc123def456",
      "occurredAt": "2024-01-01T12:00:00.000Z",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

**Order:** `occurredAt` descending (newest first)

---

## 🔒 Security

### Rate Limiting

- **POST endpoint:** 30 requests / 10 minutes per IP + sessionId + userId
- **GET endpoint:** No rate limit (admin endpoint, permission-protected)

### Data Sanitization

**Sensitive Pattern Masking:**
- `Authorization: Bearer [token]` → `Authorization: Bearer [REDACTED]`
- `token=...` → `token=[REDACTED]`
- `apiKey=...` → `apiKey=[REDACTED]`
- `secret=...` → `secret=[REDACTED]`

**Meta Key Filtering:**
- Keys containing: `password`, `token`, `authorization`, `secret`, `apiKey` are dropped

### Firestore Rules

```javascript
match /client_error_reports/{reportId} {
  allow read, write: if false; // Client kapalı (sadece backend'den yazılır)
}
```

**Note:** Client-side Firestore access is disabled. All writes go through the backend API.

---

## 📊 Firestore Collection

**Collection:** `client_error_reports`

**Document Fields:**
- `companyId` (string | null): Company ID
- `userId` (string | null): User ID (if authenticated)
- `sessionId` (string): Session ID (required)
- `severity` ('error' | 'warn'): Error severity
- `message` (string, max 500): Error message
- `stack` (string | null, max 4000): Stack trace
- `pageUrl` (string | null, max 800): Page URL where error occurred
- `route` (string | null, max 200): Route path
- `userAgent` (string | null, max 400): User agent
- `release` (string | null, max 50): Release version
- `meta` (Record<string, any> | null): Additional metadata
- `fingerprint` (string): Error fingerprint (for deduplication)
- `occurredAt` (Timestamp): When error occurred
- `createdAt` (Timestamp): When report was created

---

## 🔑 Permissions

**Permission Key:** `admin.errors.view`

**Group:** Admin / Sistem

**Default Roles (true):**
- `buyer:isveren`
- `supplier:isveren`
- `buyer:ceo`
- `supplier:ceo`
- `buyer:genel_mudur`
- `supplier:genel_mudur`

**Other roles:** `false` (default)

---

## 🧪 Testing

### Test POST endpoint:

```bash
curl -X POST http://localhost:5174/api/client-errors \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "severity": "error",
    "message": "Test error message",
    "pageUrl": "https://teklifbul.com/test"
  }'
```

### Test GET endpoint (with auth):

```bash
curl -X GET "http://localhost:5174/api/client-errors?companyId=test-company&limit=10&severity=error" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📝 Privacy Notes

1. **Sensitive Data:** All sensitive patterns are automatically masked before storage
2. **User Identification:** User ID is only stored if user is authenticated
3. **Company Isolation:** All queries require `companyId` (multi-tenant)
4. **Rate Limiting:** Prevents abuse and spam
5. **Fingerprint:** Enables deduplication without storing duplicate data

---

## 🔄 Deduplication

**Fingerprint Generation:**
- SHA256 hash of: `message + stack + route + pageUrl`
- First 32 characters used as fingerprint
- Can be provided by client or auto-generated

**Use Cases:**
- Group similar errors together
- Reduce storage costs
- Identify recurring issues

---

## ⚙️ Configuration

**Environment Variables:**
- `RATE_LIMIT_CLIENT_ERROR_INGEST_MAX`: Max requests per window (default: 30)

---

## 🚀 Integration

### Frontend Example:

```javascript
async function reportError(error, context) {
  try {
    const response = await fetch('/api/client-errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        sessionId: getSessionId(),
        severity: 'error',
        message: error.message,
        stack: error.stack,
        pageUrl: window.location.href,
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        release: APP_VERSION,
        meta: context
      })
    });
    
    if (!response.ok) {
      console.warn('Failed to report error');
    }
  } catch (err) {
    // Silent fail - don't break user experience
    console.warn('Error reporting failed', err);
  }
}
```

---

## 📚 Related Documentation

- [Error Catalog](../errors/errorCatalog.ts)
- [Rate Limiting](../middleware/rateLimit.ts)
- [Permission System](../../services/permissionService.ts)

