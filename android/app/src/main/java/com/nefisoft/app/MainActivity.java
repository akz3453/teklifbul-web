package com.nefisoft.app;

import android.graphics.Bitmap;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Teklifbul Rule v1.0 — Uzak site yüklenemezse yerel offline.html göster.
 * Google OAuth: WebView "; wv" user-agent işareti disallowed_useragent 403 üretir;
 * Chrome uyumlu UA ile native Google girişi iyileştirilir.
 */
public class MainActivity extends BridgeActivity {
  private static final String OFFLINE_URL = "file:///android_asset/public/offline.html";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Teklifbul Rule v1.0 — Push/FCM: google-services.json ile FirebaseApp zorunlu
    try {
      if (com.google.firebase.FirebaseApp.getApps(this).isEmpty()) {
        com.google.firebase.FirebaseApp.initializeApp(this);
      }
    } catch (Exception ignored) {
      // Push yoksa uygulama yine açılmalı
    }
    super.onCreate(savedInstanceState);
    hardenWebView();
    clearWebViewHttpCache();
  }

  @Override
  public void onStart() {
    super.onStart();
    hardenWebView();
    if (this.bridge == null) {
      return;
    }

    this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request != null && request.isForMainFrame() && request.getUrl() != null) {
          String failingUrl = request.getUrl().toString();
          if (shouldShowOffline(failingUrl) && view != null) {
            view.loadUrl(OFFLINE_URL);
            return;
          }
        }
        super.onReceivedError(view, request, error);
      }

      @Override
      @SuppressWarnings("deprecation")
      public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        if (shouldShowOffline(failingUrl) && view != null) {
          view.loadUrl(OFFLINE_URL);
          return;
        }
        super.onReceivedError(view, errorCode, description, failingUrl);
      }

      @Override
      public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
      }
    });
  }

  private void hardenWebView() {
    if (this.bridge == null) {
      return;
    }
    try {
      WebView webView = this.bridge.getWebView();
      if (webView == null) {
        return;
      }
      WebSettings settings = webView.getSettings();
      String ua = settings.getUserAgentString();
      if (ua != null) {
        String fixed = ua.replace("; wv", "").replace(" Version/4.0", "");
        if (!fixed.contains("NEFISOFTApp")) {
          fixed = fixed + " NEFISOFTApp";
        }
        if (!fixed.equals(ua)) {
          settings.setUserAgentString(fixed);
        }
      }
      settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
      settings.setDomStorageEnabled(true);
      settings.setJavaScriptEnabled(true);
      CookieManager cookies = CookieManager.getInstance();
      cookies.setAcceptCookie(true);
      cookies.setAcceptThirdPartyCookies(webView, true);
    } catch (Exception ignored) {
      // WebView ayarı başarısız olsa da uygulama açılmalı
    }
  }

  private void clearWebViewHttpCache() {
    if (this.bridge == null) {
      return;
    }
    try {
      WebView webView = this.bridge.getWebView();
      if (webView != null) {
        webView.clearCache(true);
      }
    } catch (Exception ignored) {
      // Önbellek temizliği başarısız olsa da uygulama açılmalı
    }
  }

  private boolean shouldShowOffline(String url) {
    if (url == null || url.isEmpty()) {
      return false;
    }
    if (url.startsWith("file:///")) {
      return false;
    }
    return url.contains("teklifbul.web.app")
        || url.contains("teklifbul.firebaseapp.com")
        || url.contains("nefisoft.com");
  }
}
