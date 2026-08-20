/**
 * Logout must delete userTokens/{uid}/tokens/{token} while still authenticated.
 * Teklifbul Rule v1.0
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('FCM logout token cleanup', () => {
  test('fcm.js deletes the current token document before signOut', () => {
    const fcm = readFileSync('assets/js/fcm.js', 'utf8');
    expect(fcm).toContain('export async function removeCurrentPushTokenFromFirestore');
    expect(fcm).toContain("doc(db, 'userTokens', user.uid, 'tokens', token)");
    expect(fcm).toContain('deleteDoc(tokenRef)');
  });

  test('logout() removes the push token before clearing local state', () => {
    const firebaseClient = readFileSync('firebase.js', 'utf8');
    const logoutStart = firebaseClient.indexOf('export async function logout()');
    expect(logoutStart).toBeGreaterThan(-1);
    const logoutBlock = firebaseClient.slice(logoutStart, logoutStart + 900);
    expect(logoutBlock).toContain('removeCurrentPushTokenFromFirestore');
    expect(logoutBlock.indexOf('removeCurrentPushTokenFromFirestore')).toBeLessThan(
      logoutBlock.indexOf('clearAuthLocalState')
    );
  });

  test('settings logout uses logout() instead of raw signOut', () => {
    const settings = readFileSync('settings.html', 'utf8');
    expect(settings).toContain('function wireLogoutButtons()');
    expect(settings).toMatch(/wireLogoutButtons[\s\S]*await logout\(\)/);
    expect(settings).not.toMatch(/wireLogoutButtons[\s\S]*await signOut\(auth\)/);
  });
});
