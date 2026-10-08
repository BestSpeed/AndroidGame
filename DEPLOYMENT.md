# DEPLOYMENT — بازی‌خونه

## ۱) اجرای سرور
```bash
SERVER_ENV=production PORT=8080 DATA_DIR=/var/lib/bazikhuneh npm start
```
توصیه عملیاتی: یک پراسس‌منیجر (مثلاً واحد مدیریتی سیستم) با ری‌استارت خودکار.
پشت پروکسی معکوس با پشتیبانی WebSocket قرار دهید (ارتقای اتصال لازم است).

## ۲) پیکربندی‌های محیطی (بند ۵۱)
| پیکربندی | مقدار |
|---|---|
| Development | `SERVER_ENV=development` — دیتابیس محلی، ربات، اندپوینت دیباگ فعال |
| Staging | `SERVER_ENV=staging` — سرور جدا برای تست نسخه‌های بعدی |
| Production | `SERVER_ENV=production` — بدون دیباگ، ذخیره متراکم |

## ۳) بیلد اندروید با Capacitor (بند ۱۶/۵۱)
این مرحله **به Android SDK نیاز دارد** که در محیط فعلی در دسترس نیست — مراحل دقیق:
```bash
npm i -D @capacitor/core @capacitor/cli @capacitor/android
npx cap init bazikhuneh com.bazikhuneh.app --web-dir=client
npx cap add android
# فایل پیکربندی: android/capacitor.config.json (در همین مخزن آماده شده)
npx cap sync
# سپس در ماشین دارای Android SDK:
cd android && ./gradlew assembleRelease        # یا: نوار ابزار استودیوی اندروید → بیلد AAB
```
نکات:
- کلاینت هیچ سکرتی ندارد (بند ۴۸)؛ فقط `API_BASE_URL` در زمان بیلد تزریق می‌شود.
- جهت‌گیری: Portrait اجباری در مانیفست (بند ۲).
- امضا و انتشار در استور: طبق چک‌لیست فروشگاه (کلید آپلود، حریم خصوصی، برچسب محتوا).

## ۴) چک‌لیست قبل از انتشار
- [ ] `SERVER_ENV=production` و متغیرهای محیطی از تزریق محیط خوانده شوند (نه فایل)
- [ ] پشتیبان‌گیری از `DATA_DIR`
- [ ] مانیتورینگ کرش و خطاهای ۵xx
- [ ] تست اتصال مجدد روی شبکه ناپایدار موبایل
- [ ] بررسی نرخ فریم روی دستگاه میان‌رده (هدف: ۶۰ فریم — بند ۳۴)
