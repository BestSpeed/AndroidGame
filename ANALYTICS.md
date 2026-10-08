# ANALYTICS — بازی‌خونه

## معماری
کلاینت رویدادها را در صف نگه می‌دارد و به‌صورت دسته‌ای (`POST /api/events`) می‌فرستد
(هر ۱۰ ثانیه یا هنگام خروج از صفحه/پنهان‌شدن اپ). رویدادهای سمت سرور (مچ، خرید، تقلب) مستقیم ثبت می‌شوند.
ذخیره: حلقه محدود + شمارنده‌های تجمیعی؛ خروجی برای ابزارهای خارجی (آماری) در آینده — فعلاً بدون وابستگی.

## فهرست رویدادها (بند ۳۸) — همه پیاده‌سازی شده‌اند
| رویداد | منبع | پارامترهای کلیدی |
|---|---|---|
| `app_open` | کلاینت | session, lang |
| `login` | سرور | method(guest), new_user |
| `tutorial_start` / `tutorial_complete` | کلاینت/سرور | duration |
| `matchmaking_start` / `match_found` | سرور | mode, wait_ms, humans, bots |
| `match_start` / `match_finish` | سرور | match_id, rounds, duration_ms |
| `minigame_start` / `minigame_finish` | سرور | game, round, player_count |
| `win` / `loss` | سرور | match_id, rank, score |
| `rematch_click` | کلاینت+سرور | match_id, taps_from_result |
| `room_create` / `room_join` | سرور | code, players |
| `friend_invite` | کلاینت | channel(share_code) |
| `ad_offer` / `ad_complete` | کلاینت/سرور | context, reward |
| `shop_open` / `item_view` | کلاینت | item_id |
| `iap_start` / `iap_success` / `iap_failed` | سرور | item, price, reason |
| `daily_challenge_start` / `daily_challenge_finish` | سرور | type, target, score |
| `disconnect` / `reconnect` | سرور | match_id, downtime_ms |
| `crash` | کلاینت | message, stack(کران‌دار), screen |
| `cheat_flag` | سرور | rule, match_id, player |

## معیارهای محصول (بند ۵۶) — از همین رویدادها ساخته می‌شوند
Competitive Sessions/DAU · D1/D7 Retention · Match/User · Rematch Rate · Match Completion ·
Crash-Free Users · Session Length · Rewarded Opt-in · IAP Conversion.
در محیط توسعه با `GET /api/analytics/summary` (فقط `SERVER_ENV=development`) قابل مشاهده است.
