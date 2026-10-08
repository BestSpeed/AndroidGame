# ساخت بسته اندروید (Capacitor)

این پوشه پیکربندی لایه بومی اندروید را نگه می‌دارد. ساخت واقعی به **Android SDK** نیاز دارد
و باید روی ماشین توسعه اجرا شود (محیط فعلی فاقد آن است — در `TODO.md` ثبت شده).

## مراحل (یک‌بار)
```bash
npm i -D @capacitor/core @capacitor/cli @capacitor/android
npx cap init bazikhuneh com.bazikhuneh.app --web-dir=client
npx cap add android
```

## هر بیلد
```bash
# ۱) پیکربندی سرور در capacitor.config.json (آدرس گیم‌سرور محیط موردنظر)
npx cap sync android
cd android && ./gradlew assembleDebug        # توسعه
cd android && ./gradlew bundleRelease        # AAB برای استور
```

## نکات
- **جهت:** `android:screenOrientation="portrait"` در `AndroidManifest.xml` (بند ۲).
- کلاینت هیچ سکرتی ندارد؛ تنها تنظیم لازم `server.url` است (بند ۴۸).
- ارائه‌دهنده تبلیغ و خرید واقعی (AdMob / گوگل‌پلی) در همین لایه بومی اضافه می‌شوند؛
  معماری سمت سرور (`ads.js`, `iap.js`) از همین حالا با آن‌ها سازگار است.
