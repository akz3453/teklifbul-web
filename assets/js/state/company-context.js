// Teklifbul Rule v1.0 - Company Context Resolver
// Amaç: companyId / companyJoinStatus / company doc tutarlılığını tek noktadan yönetmek

import { db, auth } from '../firebase.js';

// PERFORMANS: Kısa süreli cache (5 saniye) - gereksiz tekrar çağrıları önler
let contextCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 saniye
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { logger } from '../../../src/shared/log/logger.js';
import { toast } from '../../../src/shared/ui/toast.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';

/**
 * Tek bir yerden şirket bağlamını çözer.
 *
 * @param {import('firebase/auth').User} user - Firebase auth kullanıcısı
 * @param {object} options
 * @param {boolean} [options.allowPending=false] - pending durumda bile devam et (örn. bekleme ekranı)
 * @param {boolean} [options.redirectOnPending=true] - pending ise company-join-waiting.html sayfasına yönlendir
 * @returns {Promise<{ userDocData: any; companyId: string | null; joinStatus: string | null; companyDocData: any | null; resolvedFrom: string; }>}
 */
export async function resolveCompanyContext(user, options = {}) {
  const {
    allowPending = false,
    redirectOnPending = true
  } = options || {};

  // PERFORMANS: Cache kontrolü - son 5 saniye içinde çağrıldıysa cache'den dön
  const now = Date.now();
  if (contextCache && (now - cacheTimestamp) < CACHE_TTL && contextCache.userId === user?.uid) {
    // Cache hit - sessizce dön, gereksiz log yok
    return contextCache;
  }

  // Sadece gerçek çağrılarda log (cache miss)
  logger.group('CompanyContextResolver');

  try {
    if (!user) {
      logger.error('resolveCompanyContext: auth user yok');
      toast.error(MESSAGES.ERROR_COMPANY_CONTEXT_SESSION_NOT_FOUND);
      throw new Error('NO_AUTH_USER');
    }

    // Kullanıcı dokümanını her çağrıda taze çek - Teklifbul Rule v1.0
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      logger.error('resolveCompanyContext: user doc bulunamadı', { uid: user.uid });
      toast.error(MESSAGES.ERROR_COMPANY_CONTEXT_USER_PROFILE_NOT_FOUND);
      throw new Error('USER_DOC_MISSING');
    }

    const userData = userSnap.data() || {};
    const joinStatus = userData.companyJoinStatus || null;
    const existingCompanyId = typeof userData.companyId === 'string' ? userData.companyId : null;
    const isPending = joinStatus === 'pending';
    const isAccepted = joinStatus === 'accepted' || joinStatus === 'approved';

    /**
     * Ortak companyId çözümleyici (dashboard/demand-new ile uyumlu)
     * Teklifbul Rule v1.x - Tüm geçerli companyId yapılarını (tax-, solo-, vb.) kabul eder.
     */
    function resolveSharedCompanyId(data) {
      if (!data) return null;
      // Öncelik sırası: activeCompanyId > companyId > ilk şirket
      const companyId = data.activeCompanyId || data.companyId || (Array.isArray(data.companies) && data.companies.length ? data.companies[0] : null);
      
      // Geçerlilik kontrolü: boş olmayan herhangi bir string
      if (companyId && typeof companyId === 'string' && companyId.trim() !== '') {
        return companyId;
      }
      return null;
    }

    let companyId = resolveSharedCompanyId(userData);
    let resolvedFrom = companyId ? 'profile' : 'none';
    let joinRequestSource = null;
    let joinRequestStatus = null;

    // Pending durumda çoğu sayfa için bekleme ekranına yönlendir
    if (isPending && !allowPending) {
      logger.warn('Şirket üyeliği pending, bekleme sayfasına yönlendiriliyor', {
        uid: user.uid,
        joinStatus
      });
      toast.info(MESSAGES.WARN_PENDING || 'Onay bekleniyor');
      if (redirectOnPending && typeof window !== 'undefined') {
        window.location.href = './company-join-waiting.html';
      }
      throw new Error('COMPANY_JOIN_PENDING');
    }

    // joinStatus accepted/approved ama companyId yoksa: companyJoinRequests / companyCode üzerinden düzeltmeyi dene
    if (isAccepted && !companyId) {
      // 1) companyJoinRequests üzerinden çözümle
      try {
        const joinRequestsRef = collection(db, 'companyJoinRequests');
        const joinRequestsQuery = query(
          joinRequestsRef,
          where('userId', '==', user.uid),
          where('status', 'in', ['pending', 'accepted', 'approved'])
        );
        const joinRequestsSnapshot = await getDocs(joinRequestsQuery);

        if (!joinRequestsSnapshot.empty) {
          const allRequests = joinRequestsSnapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            });

          const acceptedRequest =
            allRequests.find((r) => r.status === 'accepted' || r.status === 'approved') || null;
          const pendingRequest = allRequests.find((r) => r.status === 'pending') || null;

          const preferred = acceptedRequest || pendingRequest;

          if (preferred?.companyId) {
            companyId = preferred.companyId;
            joinRequestSource = 'companyJoinRequests';
            joinRequestStatus = preferred.status || null;
            resolvedFrom =
              preferred.status === 'accepted' || preferred.status === 'approved'
                ? 'companyJoinRequests'
                : 'companyJoinRequests-pending';

            logger.info("CompanyId companyJoinRequests'ten bulundu", {
              companyId,
              requestId: preferred.id,
              status: preferred.status
            });
          }
        }
      } catch (joinRequestError) {
        logger.warn("companyJoinRequests kontrolü sırasında hata (resolver)", joinRequestError);
      }

      // 2) companyCode üzerinden companies koleksiyonundan çözümle (SADECE bağlam için, yazma için değil)
      if (!companyId && userData.companyCode) {
        try {
          const companiesRef = collection(db, 'companies');
          const companiesQuery = query(
            companiesRef,
            where('code', '==', userData.companyCode)
          );
          const companiesSnapshot = await getDocs(companiesQuery);
          const first = companiesSnapshot.docs?.[0];

          if (first) {
            companyId = first.id;
            resolvedFrom = 'companyCode';
            logger.info('CompanyId companyCode üzerinden bulundu', {
              companyId,
              companyCode: userData.companyCode
            });
          }
        } catch (codeError) {
          logger.warn('companyCode ile şirket çözülürken hata', codeError);
        }
      }

      // 3) Güvenli yazma kuralları:
      //    - user.companyJoinStatus accepted/approved
      //    - joinRequest.status accepted/approved veya companyCode fallback
      //    - mevcut companyId ile çakışma yok
      // Teklifbul Rule v1.0
      const canPersistFromJoinRequest =
        !!companyId &&
        isAccepted &&
        !isPending &&
        joinRequestSource === 'companyJoinRequests' &&
        (joinRequestStatus === 'accepted' || joinRequestStatus === 'approved');

      const canPersistFromCompanyCodeFallback =
        !!companyId &&
        isAccepted &&
        !isPending &&
        resolvedFrom === 'companyCode' &&
        !existingCompanyId;

      if (canPersistFromJoinRequest || canPersistFromCompanyCodeFallback) {
        if (existingCompanyId && existingCompanyId !== companyId) {
          logger.error('CompanyId conflict - mevcut companyId ile joinRequest sonucu farklı', {
            uid: user.uid,
            existingCompanyId,
            resolvedCompanyId: companyId,
            joinRequestStatus,
            resolvedFrom
          });
          toast.error(
            (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
              ' (companyId çakışması). Lütfen destek ile iletişime geçin.'
          );
          throw new Error('COMPANY_ID_CONFLICT');
        }

        try {
          const updatePayload = {
            companyId,
            activeCompanyId: userData.activeCompanyId || companyId,
            updatedAt: serverTimestamp()
          };

          if (Array.isArray(userData.companies)) {
            if (!userData.companies.includes(companyId)) {
              updatePayload.companies = Array.from(new Set([...userData.companies, companyId]));
            }
          } else {
            updatePayload.companies = [companyId];
          }

          await updateDoc(userRef, updatePayload);
          logger.info('User companyId otomatik düzeltildi', {
            uid: user.uid,
            companyId,
            resolvedFrom,
            syncReason: canPersistFromJoinRequest ? 'accepted-join-request' : 'company-code-fallback'
          });
          toast.info(MESSAGES.SUCCESS_UPDATE || 'Güncelleme başarılı');
        } catch (updateError) {
          logger.warn('Otomatik companyId güncellemesi başarısız', updateError);
        }
      }
    }

    // Hâlâ accepted/approved ama companyId yoksa: hard fail
    if (isAccepted && !companyId) {
      logger.error('Accepted/approved kullanıcı için companyId çözülemedi (DATA ERROR)', {
        uid: user.uid,
        email: user.email,
        joinStatus,
        docFields: Object.keys(userData),
        // Kritik veriler (bazılarını maskeleme gerekebilir ama debug için önemli)
        companyCode: userData.companyCode || 'N/A',
        companiesLength: Array.isArray(userData.companies) ? userData.companies.length : 'not_an_array'
      });
      toast.error(
        (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. Veri bütünlüğü hatası. Lütfen destek ile iletişime geçin.'
      );
      throw new Error('COMPANY_ID_MISSING');
    }

    // Şirket dokümanını yükle (varsa)
    let companyDocData = null;
    if (companyId) {
      try {
        const companySnap = await getDoc(doc(db, 'companies', companyId));
        if (companySnap.exists()) {
          companyDocData = {
            id: companyId,
            ...companySnap.data()
          };
        } else {
          logger.warn('Company dokümanı bulunamadı', { companyId });
        }
      } catch (companyError) {
        logger.warn('Company dokümanı yüklenirken hata', {
          companyId,
          error: companyError
        });
      }
    }

    const context = {
      userDocData: userData,
      companyId: companyId || null,
      joinStatus,
      companyDocData,
      resolvedFrom
    };

    // PERFORMANS: Cache'e kaydet
    contextCache = {
      ...context,
      userId: user.uid
    };
    cacheTimestamp = now;
    
    // Sadece ilk çağrıda veya önemli değişikliklerde log
    logger.info('Company context çözüldü', {
      userId: user.uid,
      companyId: context.companyId,
      joinStatus: context.joinStatus,
      resolvedFrom: context.resolvedFrom
    });
    
    logger.end();
    return context;
  } catch (error) {
    logger.error('resolveCompanyContext başarısız', error);
    logger.end();
    throw error;
  }
}

/**
 * Wrapper: Auth + Company Context
 * Sayfalar için try/catch olmadan standart kullanım sağlar.
 *
 * @param {object} options
 * @param {boolean} [options.allowPending=false]
 * @param {boolean} [options.redirectOnPending=true]
 * @returns {Promise<ReturnType<typeof resolveCompanyContext> | null>}
 */
export async function requireCompanyContext(options = {}) {
  const {
    allowPending = false,
    redirectOnPending = true
  } = options || {};

  async function getCurrentUserInternal() {
    if (auth.currentUser) return auth.currentUser;

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        toast.error(MESSAGES.ERROR_SESSION || 'Oturum bulunamadı');
        reject(new Error('NO_AUTH_USER'));
      }, 8000);

      const unsubscribe = onAuthStateChanged(auth, (u) => {
        unsubscribe();
        clearTimeout(timeout);
        if (u) {
          resolve(u);
        } else {
          toast.error(MESSAGES.ERROR_AUTH || 'Giriş yapmanız gerekiyor');
          reject(new Error('NO_AUTH_USER'));
        }
      });
    });
  }

  try {
    const user = await getCurrentUserInternal();
    const ctx = await resolveCompanyContext(user, { allowPending, redirectOnPending });
    return ctx;
  } catch (error) {
    const code = error && error.message;

    if (code === 'NO_AUTH_USER') {
      logger.warn('requireCompanyContext: auth user yok');
      return null;
    }

    if (code === 'COMPANY_JOIN_PENDING') {
      // Toast + redirect zaten resolver içinde yapıldı
      logger.info('requireCompanyContext: companyJoinStatus pending, bekleme sayfasına yönlendirme tetiklendi');
      return null;
    }

    if (
      code === 'USER_DOC_MISSING' ||
      code === 'COMPANY_ID_MISSING' ||
      code === 'COMPANY_ID_CONFLICT'
    ) {
      // Bu hatalar için resolver kullanıcıya already toast gösteriyor
      logger.warn('requireCompanyContext: kritik company context hatası', { code });
      return null;
    }

    logger.error('requireCompanyContext: beklenmeyen hata', error);
    toast.error(MESSAGES.ERROR_GENERAL || 'Bir hata oluştu, lütfen tekrar deneyin');
    return null;
  }
}
