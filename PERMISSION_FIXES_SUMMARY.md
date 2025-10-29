# Permission Fixes Summary

This document summarizes all the changes made to fix permission issues in the Teklifbul application.

## 1. Bids.html Updates

### Problem
- Direct access to `users/{uid}` collection causing "permission-denied" errors
- Supplier information loading was not secure

### Solution
- Added `getSupplierNameFromBid` and `getSupplierCompanyFromBid` functions that:
  1. First check embedded data in the bid object
  2. Fallback to `publicProfiles` collection (publicly readable)
  3. Mask UID if no other data is available
- Updated `renderBids` function to use these secure functions
- Improved error handling for async operations

### Key Functions Added
```javascript
/** Bidden tedarikçi adını al: 1) supplierPublic 2) publicProfiles 3) uid mask */
export async function getSupplierNameFromBid(b){
  // 1) Bid içindeki embed alan
  const embedName = b?.supplierPublic?.displayName || b?.supplierPublic?.companyName;
  if (embedName) return embedName;

  // 2) publicProfiles fallback (herkese okunur, rules eklendi)
  try {
    const p = await getDoc(doc(db,"publicProfiles", b.supplierId));
    if (p.exists()){
      const d = p.data();
      return d?.displayName || d?.companyName || (b.supplierId?.slice(0,6)+"…");
    }
  } catch (_) { /* izin yoksa sessiz geç */ }

  // 3) en kötü: UID maskele
  return (b.supplierId?.slice(0,6)+"…");
}

/** (İsteğe bağlı) Tedarikçi firma adı */
export async function getSupplierCompanyFromBid(b){
  const embedCompany = b?.supplierPublic?.companyName;
  if (embedCompany) return embedCompany;
  try{
    const p = await getDoc(doc(db,"publicProfiles", b.supplierId));
    if (p.exists()){
      const d = p.data();
      return d?.companyName || "-";
    }
  }catch(_){}
  return "-";
}
```

## 2. Demands.html Updates

### Problem
- Company loading/creation logic was not handling permissions correctly
- Was attempting to create companies that didn't belong to the user

### Solution
- Completely rewrote `loadCompanyForUser` function with proper flow:
  1. First try to load company from `users/{uid}.companies[0]`
  2. Only create default company if ID follows `solo-{uid}` pattern
  3. Use `setDoc` without merge to ensure `ownerId` is visible in request
  4. Properly handle permission errors without crashing

### Key Function Updated
```javascript
/**
 * loadCompanyForUser
 *  - users/{uid}.companies[0] varsa: /companies/{id} oku (başarılıysa bitir)
 *  - okunamazsa: fallback'e ZORLA geçme; yalnız "solo-uid" senaryosunda yarat
 *  - yaratacaksan: setDoc(ownerId: uid, name, createdAt)  (merge YOK)
 */
export async function loadCompanyForUser() {
  const u = auth.currentUser;
  if (!u) return { id:null, name:"-" };

  let companyId = null;

  // 1) users/{uid}.companies[0] oku
  try {
    console.log("🔍 Loading companies for user:", u.uid);
    const uSnap = await getDoc(doc(db,"users",u.uid));
    const companies = (uSnap.exists() && Array.isArray(uSnap.data().companies)) ? uSnap.data().companies : [];
    console.log("🔍 User data companies:", companies);
    if (companies.length > 0) {
      companyId = String(companies[0]);
      console.log("🔍 Attempting to load 1 company documents");
      console.log("🔍 Creating ref for company ID:", companyId);
      const cRef = doc(db,"companies", companyId);
      console.log("🔍 Loading company:", cRef);
      const cSnap = await getDoc(cRef);
      if (cSnap.exists()) {
        const d = cSnap.data();
        console.log("✅ Company name loaded successfully");
        return { id: cSnap.id, name: d?.name || d?.title || ("Şirket " + cSnap.id.slice(0,6)) };
      } else {
        // Doc yoksa: yalnız "solo-uid" pattern ise oluştur
        if (companyId === `solo-${u.uid}`) {
          try {
            console.log("🔍 Attempting to create default company:", companyId, { ownerId: u.uid });
            await setDoc(cRef, {
              ownerId: u.uid,
              name: "Şirketim",
              createdAt: serverTimestamp()
            }); // merge YOK → ownerId request'te görünür
            console.log("✅ Default company created:", companyId);
            return { id: companyId, name: "Şirketim" };
          } catch (e) {
            console.warn("⚠️ Could not create default company:", e?.message || e);
            return { id:null, name:"-" };
          }
        }
        // solo değilse: yaratma → UI'da "-" göster
        return { id:null, name:"-" };
      }
    }
  } catch (e) {
    // Burada permission-denied olabilir (companyId vardı ama okuyamadın)
    console.warn("⚠️ users→companies load warning:", e?.code || e);
    // Bu durumda YARATMAYA kalkışma; doc sahibin olmayabilir
    return { id:null, name:"-" };
  }

  // 2) Hiç companies yoksa: solo-uid'i tek sefer dene
  const soloId = `solo-${u.uid}`;
  try {
    console.log("🔍 Attempting to create default company:", soloId, { ownerId: u.uid });
    await setDoc(doc(db,"companies", soloId), {
      ownerId: u.uid,
      name: "Şirketim",
      createdAt: serverTimestamp()
    });
    console.log("✅ Default company created:", soloId);
    return { id: soloId, name: "Şirketim" };
  } catch (e) {
    console.warn("⚠️ Could not create default company:", e?.message || e);
    return { id:null, name:"-" };
  }
}
```

## 3. Firestore Rules Updates

### Problem
- Missing `publicProfiles` collection rules
- Company creation rules needed to ensure `ownerId` visibility

### Solution
- Added `publicProfiles` rules allowing read for authenticated users and write for owners
- Verified company creation rules require `ownerId == request.auth.uid`

### Rules Added
```javascript
// -------- PUBLIC PROFILES --------
match /publicProfiles/{uid} {
  allow read: if isSignedIn();
  allow create, update, delete: if isSelf(uid);
}
```

## 4. Verification

### Expected Results
- No more "Could not load supplier … permission-denied" errors
- Proper company loading with correct ownership
- Secure supplier information fetching
- Graceful handling of permission errors

### Testing
- Server correctly serves bids.html
- Functions properly handle different data scenarios
- Permission errors are caught and handled gracefully