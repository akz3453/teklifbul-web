# Teklifbul Rule v1.0 — Capacitor / Firebase / WebView keep rules (R8)
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-dontwarn com.getcapacitor.**
-keep class com.nefisoft.app.** { *; }

-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keep public class * extends java.lang.Exception

-keepclassmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
