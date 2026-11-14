# ManiPOS Android (Google Play Store) Build & Release Guide

- **Package ID (`applicationId`)**: `com.manipos.pos`
- **App Name**: `ManiPOS`
- **Features Included**:
  - Continuous loud ringing order alert engine (`src/lib/orderAlarm.js` + `IncomingOrderAlarmOverlay.jsx`) using multi-harmonic bell audio + HTMLAudio WAV fallback + Android high-importance notification channel (`manipos_orders_alarm`) + device vibration until pending orders are Accepted or Declined.
  - Native launch directly to Staff / Restaurant Sign-In screen (`PinLogin`) when launched inside Capacitor native runtime.

## 1. Sync Web Build Into Android Project
```bash
npm run android:sync
```

## 2. Generate Play Store Upload Keystore (First Time Only)
```bash
keytool -genkey -v -keystore android/manipos-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias manipos
```
Keep `manipos-upload-key.jks` outside Git (never commit keystores or `keystore.properties` secrets).

## 3. Configure Signing & Build Signed AAB
Create `android/keystore.properties`:
```properties
storeFile=../manipos-upload-key.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=manipos
keyPassword=YOUR_KEY_PASSWORD
```
Then open `android/` in Android Studio (`npm run android:open`) or run Gradle:
```bash
cd android
./gradlew bundleRelease
```
Upload `android/app/build/outputs/bundle/release/app-release.aab` to Google Play Console (`Internal testing` -> `Production`).
