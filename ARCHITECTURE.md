# ARCHITECTURE — بازی‌خونه

## ۱) نقشه کل سیستم

```
┌─────────────────────────────── Android Device (Capacitor WebView) ───────────────────────────────┐
│  HTML5 Client (Portrait, RTL, fa/en)                                                             │
│                                                                                                  │
│  UI Screens ── Router ── i18n ── Audio ── Analytics(batched) ── Settings                         │
│       │                                                                                            │
│  Game Renderers (Canvas 2D): ReactionView / SnakeView / RaceView   ← snapshot interpolation      │
│       │ inputs (tap / dir / steer+boost)                                                         │
│       ▼                                                                                            │
│  ApiClient (HTTPS/JSON)  +  GameSocket (WebSocket, auto-reconnect + exponential backoff)         │
└───────────────┬───────────────────────────────────┬──────────────────────────────────────────────┘
                │ REST                              │ WS (JSON, token-authenticated)
┌───────────────▼───────────────────────────────────▼──────────────────────────────────────────────┐
│  Game Server (Node.js) — SERVER-AUTHORITATIVE                                                    │
│                                                                                                  │
│  API Layer (Express): auth · profile · shop · iap · ads · leaderboard · social · daily · config  │
│  Socket Layer: session, queue, rooms, match channels                                             │
│                                                                                                  │
│  Match Orchestrator ── Round FSM: INTRO → PLAY → ROUND_RESULT → … → FINAL → REMATCH_WINDOW       │
│      ├── ReactionGame logic      ├── SnakeArena logic (10Hz tick)   ├── StreetRace logic (15Hz)  │
│      └── Bot Controllers (per game, difficulty-driven)                                           │
│                                                                                                  │
│  Matchmaking (skill+wait expansion, bot fill) · Rooms · Economy/XP · Achievements · DailyChallenge│
│  AntiCheat: rate-limit · input shape validation · speed/score bounds · anomaly flags             │
│  Persistence: JSON-file store (schema = §3) — swap-ready for PostgreSQL                          │
│  Analytics sink (server events + client batches)                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## ۲) Technology Stack (و چرایی آن)

| لایه | فناوری | دلیل |
|---|---|---|
| کلاینت | Vanilla ES Modules + Canvas 2D | بدون بیلد، استارت‌آپ سریع، کنترل کامل حافظه، قابل اجرا در WebView اندروید |
| شبکه | WebSocket (JSON) | تأخیر کم، مناسب موبایل، پیام‌های کوچکِ اسنپ‌شات |
| سرور | Node.js + Express + ws | یک زبان برای کلاینت/سرور، مناسب I/O بالا برای تیک‌های بازی |
| دیتابیس | فایل‌محورِ اسکیمادار (swap-ready) | MVP بدون وابستگی عملیاتی؛ اسکیمای §۳ دقیقاً معادل جداول SQL است |
| بیلد اندروید | Capacitor | دسترسی به بازار اندروید بدون بازنویسی؛ مسیر مهاجرت به Unity در سند جدا |
| فونت | Vazirmatn (OFL) | فارسی، استاندارد، دارای مجوز |
| تست | `node:test` + اسکریپت E2E | بدون وابستگی اضافه |

> نکته معماری: هیچ‌کدام از منطق‌های «معتبر» (امتیاز، پاداش، حرکت) روی کلاینت اجرا نمی‌شود؛
> کلاینت فقط رندر + ورودی است. این یعنی پورت آینده به Unity فقط لایه رندر را تغییر می‌دهد.

## ۳) دیتابیس — اسکیمای موجودیت‌ها (بند ۲۹ محصول)

| موجودیت | فیلدهای کلیدی |
|---|---|
| `users` | `id, username, createdAt, lastSeen, tutorialComplete, settings{lang,music,sfx,emotePref}, avatar{emoji,bg}, stats{wins,losses,matches,bestScores{}}, skill, blocked[], reported[]` |
| `currencies` | `userId → {coins, gems}` + `ledger[]` (هر تغییر با `id,userId,type,xp?,coins?,gems?,trophies?,reason,ts`) |
| `profiles/trophies` | `userId → trophies` (در همان `ledger` و `users.trophies`) |
| `inventory` | `id, userId, itemId, acquiredAt, source` + equipped در `users.equipped` |
| `matches` | `id, mode(quick/room/solo), startedAt, finishedAt, rounds[], playerCount, winnerId, configSnapshot` |
| `matchPlayers` | `id, matchId, userId|botId, isBot, botDifficulty, finalRank, totalScore, perRound[], disconnected, flags[]` |
| `matchResults` | `id, matchId, userId, rank, xp, coins, trophies, bestScore, doubled(ad), ts` |
| `rooms` | `code(6-digit), hostId, players[], fillWithBots, state, createdAt` |
| `friends` | `id, fromId, toId, type(follow/block), ts` · رویدادهای اخیر از `matchPlayers` مشتق می‌شود |
| `purchases` | `id, userId, itemId, price, currency, provider(mock/play), status, ts` |
| `adRewards` | `id, userId, context, reward, ts` (برای سقف روزانه/کول‌دان) |
| `achievements` | `userId → {achId: progress/unlockedAt}` — تعاریف در `configs/achievements.json` |
| `dailyChallenges` | `id, dateKey, type, userId, bestScore, attempts, rewarded, ts` |
| `gameConfigs` | اسنپ‌شات کانفیگ هر مچ (برای تکرارپذیری و دیباگ) |
| `sessions` | `token, userId, createdAt, lastIp` |
| `analytics` | رویدادها (حلقه‌ای، کران‌دار) + شمارنده‌های تجمیعی |

همه `id`ها یکتا (Base32 با پیشوند نوع: `u_…`, `m_…`, `mr_…`).

## ۴) معماری مینی‌گیم‌ها

هر مینی‌گیم یک ماژول مستقل با این قرارداد (Interface) است:

```
GameLogic = {
  id, create(players, config, rng),   // ساخت وضعیت اولیه
  start(ctx),                          // شروع حلقه/زمان‌بندی
  onInput(playerId, input, ctx),       // اعتبارسنجی + اعمال ورودی
  snapshot(),                          // خروجی فشرده برای کلاینت‌ها
  scores(),                            // امتیاز نهایی برای راند
  destroy()                            // پاک‌سازی تایمرها
}
```

افزودن مینی‌گیم چهارم = افزودن یک ماژول + رجیستر در `registry` + اضافه‌شدن به `configs/games.json`.
بدون تغییر در ارکستریتور مچ.

## ۵) ماژول‌بندی کد (جلوگیری از God Class)

```
server/src/                client/js/
├─ index.js      (bootstrap)├─ main.js (boot+router)   ├─ ui.js (کامپوننت‌ها)
├─ config.js     (env+json) ├─ i18n.js  ├─ api.js       ├─ socket.js  ├─ audio.js
├─ db.js · ids.js           ├─ analytics.js             ├─ store.js
├─ auth.js · anticheat.js   screens/ (هر صفحه یک ماژول)
├─ economy.js · shop.js · iap.js · ads.js
├─ matchmaking.js · rooms.js · match.js · bots.js
├─ leaderboard.js · social.js · dailyChallenge.js · achievements.js
├─ analytics.js · api.js (REST routes) · socketServer.js
└─ games/ { reaction.js · snake.js · race.js }   (games/ در کلاینت هم معادل رندر دارد)
```

## ۶) نقشه صفحات (UI Screen Map)

```
Splash → Login(ورود مهمان) → Home ──┬→ Play(بازی سریع / اتاق خصوصی / چالش روز)
        (آواتار+سطح، سکه/جم)        ├→ Matchmaking(جستجو+کنسل) → Countdown → Game → RoundResult → FinalResult
                                     │                                                        │ Rematch(≤2 تپ) / دعوت دوستان / خانه
                                     ├→ RoomLobby(ساخت/پیوستن با کد، آماده، شروع)→ …همین مسیر
                                     ├→ Shop · Profile · Leaderboard(Global/Weekly/Friends)
                                     ├→ Friends(اخیر/دنبال/بلاک/ریپورت) · Settings(صدا، زبان، حریم)
                                     └→ Tutorial(اولین ورود، تعاملی، <۶۰ ثانیه)
سراسری: Toast · Modal · ConnectionOverlay(قطع/اتصال مجدد) · AdOverlay(تشویقی شبیه‌سازی‌شده) · EmoteBar(داخل مچ)
```

## ۷) وضعیت‌های اتصال (بند ۳۲)

`Connecting → Connected → Playing → (Reconnecting ⇄) → MatchFinished / Disconnected`

قطع موقت → سرور جای بازیکن را `disconnectGraceSec` نگه می‌دارد و ربات جایگزین می‌شود؛
بازگشت → اسنپ‌شات کامل وضعیت مچ ارسال می‌شود. قطعی کامل سرور → پیام فارسی + تلاش مجدد با Exponential Backoff (بدون فریز).

## ۸) مایلستون‌ها (ترتیب ساخت — بند ۴۴)

| فاز | محتوا | وضعیت |
|---|---|---|
| 1 | اسکلت پروژه، کانفیگ‌ها، دیتابیس | ✅ |
| 2 | معماری هسته (ماژول‌ها، پروتکل) | ✅ |
| 3 | پروفایل/لاگین مهمان/آواتار | ✅ |
| 4 | مینی‌گیم اول (دست‌به‌کار) E2E | ✅ |
| 5 | شبیه‌سازی ربات | ✅ |
| 6 | شبکه (مچ ۸ نفره واقعی) | ✅ |
| 7 | مچ‌میکینگ + اتصال مجدد | ✅ |
| 8–9 | مار محله + مسابقه کوچه | ✅ |
| 10 | اقتصاد/پاداش/چالش روز/اچیومنت | ✅ |
| 11 | اتاق خصوصی | ✅ |
| 12 | تبلیغ تشویقی + معماری IAP | ✅ (ادکی واقعی: TODO) |
| 13 | لیدربرد | ✅ |
| 14 | آنالیتیکس | ✅ |
| 15 | تست‌ها + ماتریس QA | ✅ (`TESTING.md`) |
| 16 | بیلد اندروید (Capacitor) | ⏳ مستند شده — نیازمند Android SDK |

## ۹) ریسک‌ها و پاسخ (بند ۵۵)

| ریسک | پاسخ اجراشده |
|---|---|
| صف خالی | پر شدن با ربات پس از `botFillAfterSec`؛ نام ربات‌ها مشخص (🤖) |
| تکراری شدن | چرخش مینی‌گیم‌ها، چالش روز، کانفیگ‌های قابل تغییر بدون کد |
| ادراک Pay-to-Win | فقط آیتم تزئینی؛ هیچ اثر گیم‌پلی (بند ۱۴) |
| تقلب | سرور معتبر کامل + اعتبارسنجی سرعت/امتیاز + نرخ‌سنجی ورودی |
| انفجار اسکوپ | قوانین `TODO.md` به‌عنوان دروازه اسکوپ |
| تأخیر | اسنپ‌شات‌های کوچک + درون‌یابی کلاینت؛ مچ‌های کوتاه |

## ۱۰) برآورد تیمی

این ساختار با ۱ تیم ۴–۶ نفره در ~۱۰ هفته به بیلد فروشگاه می‌رسد
(۲ هفته تثبیت شبکه، ۳ هفته محتوا/بالانس، ۲ هفته پولیش/مانیتایز، بقیه QA/استور).
مهم‌ترین معیار پس از پروتوتایپ: **Competitive Sessions per DAU** و سپس نرخ ریمچ.
