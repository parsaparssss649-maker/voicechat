# Voice Chat — نسخه نهایی (رایگان، بدون VPS، بدون نیاز به روشن بودن سیستم شخصی)

این پروژه از دو بخش تشکیل شده:

```
voicechat-final/
├── frontend/     ← استاتیک، روی GitHub Pages میره
│   ├── index.html
│   ├── style.css
│   ├── client.js
│   └── config.js  ← اینجا آدرس بک‌اندت رو می‌ذاری
└── backend/      ← Node.js + Socket.io، روی Render (رایگان) میره
    ├── server.js
    ├── package.json
    ├── .env.example
    └── render.yaml
```

**چرا این معماری؟** GitHub Pages فقط فایل استاتیک هاست می‌کنه، سرور اجرا نمی‌کنه. برای چت زنده و سیگنالینگ WebRTC حتماً یه پروسه‌ی همیشه-روشن (یا شبه‌همیشه‌روشن) لازمه که Socket.io رو اجرا کنه. راه‌حل: فرانت روی GitHub Pages، بک‌اند روی Render (پلن رایگان). صدای واقعی (audio) بین خود کاربرا رد و بدل میشه (WebRTC peer-to-peer)؛ سرور فقط پیام‌های کوچیک سیگنالینگ رو رله می‌کنه، برای همین حتی پلن رایگان هم براش کافیه.

---

## ۱. ساخت Repository در GitHub

1. برو github.com → New repository → یه اسم بذار (مثلاً `voice-chat`) → Create.
2. کل پوشه‌ی این پروژه (هم `frontend/` هم `backend/`) رو push کن:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/voice-chat.git
   git push -u origin main
   ```
   فایل `backend/.env` (اگه لوکال ساختی) به لطف `.gitignore` پوش نمیشه — همینطوری باید باشه، چون رازها نباید تو گیت‌هاب بره.

**همه چیز رو push کن** (هم `frontend/` هم `backend/`) — فرقی نداره که بک‌اند از یه پوشه‌ی دیگه‌ی همون ریپو دیپلوی میشه؛ توضیحش تو مرحله‌ی ۴ میاد.

---

## ۲. فعال کردن GitHub Pages (فقط برای frontend)

این پروژه یک GitHub Actions آماده دارد که فقط پوشه `frontend/` را روی Pages منتشر می‌کند؛ لازم نیست frontend را به ریپوی جدا ببری. GitHub هم برای Pages استفاده از Actions را پشتیبانی می‌کند.

1. پروژه را روی GitHub پوش کن.
2. برو به **Settings → Pages**.
3. زیر **Build and deployment → Source** گزینه **GitHub Actions** را انتخاب کن.
4. فایل `.github/workflows/pages.yml` خودش با هر push به `main`، پوشه `frontend/` را Deploy می‌کند.
5. بعد از اجرای موفق Workflow، آدرس سایتت معمولاً `https://USERNAME.github.io/REPO/` است.

نکته: قبل از اینکه سایت را تست کنی، بعد از گرفتن URL بک‌اند Render، مقدار `BACKEND_URL` در `frontend/config.js` را با URL واقعی Render عوض کن و دوباره push کن.

---

## ۳. دیپلوی بک‌اند روی Render (رایگان)

Render.com یه پلن Free داره که برای این پروژه کافیه.

1. برو render.com → ثبت‌نام (میشه با گیت‌هاب لاگین کرد).
2. New → Web Service → ریپوی گیت‌هابت رو انتخاب کن.
3. تنظیمات:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. قسمت Environment → این متغیرها رو اضافه کن (مقادیرشون تو `backend/.env.example` توضیح داده شده):
   - `ALLOWED_ORIGINS` = آدرس دقیق GitHub Pages‌ت، مثلاً `https://USERNAME.github.io`
   - `OWNER_TOKEN` = یه رشته‌ی طولانی و تصادفی خودت (توکن پیش‌فرض `56654` رو استفاده نکن — برای نمونه بود، نه برای پروداکشن)
   - (اختیاری ولی پیشنهادی) `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` — توضیح کامل در بخش TURN پایین‌تر
5. Create Web Service → صبر کن دیپلوی تموم بشه. یه آدرس می‌گیری مثل: `https://voicechat-backend-xxxx.onrender.com`
   این آدرس هم به صورت پیش‌فرض HTTPS داره.

### محدودیت واقعی Render Free (صادقانه بگم)
- سرویس رایگان بعد از ~۱۵ دقیقه بدون ترافیک "می‌خوابه" (Sleep). اولین درخواست بعدش ۳۰-۶۰ ثانیه طول می‌کشه تا بیدار بشه (Cold Start). یعنی اگه یه مدت هیچکی وصل نبوده، اولین نفر که میاد باید چند ثانیه صبر کنه.
- ماهانه ساعت رایگان محدوده ولی برای یه پروژه‌ی شخصی/دوستانه معمولاً کافیه.
- اگه این cold start اذیتت می‌کنه، جایگزین‌های رایگان دیگه: **Railway** (پلن رایگانش محدودتر شده اخیراً)، **Fly.io** (رایگان با محدودیت منابع)، **Glitch** (برای پروژه‌های کوچیک، ولی هم می‌خوابه). هیچکدوم "رایگان بدون هیچ محدودیت" نیست — این واقعیت سرویس‌های رایگانه، صادقانه بهت میگم که قولی نمیدم غیرواقعی باشه.

---

## ۴. وصل کردن Frontend به Backend

فایل `frontend/config.js` رو باز کن و آدرس Render رو بذار:

```js
window.APP_CONFIG = {
  BACKEND_URL: 'https://voicechat-backend-xxxx.onrender.com',
};
```

کامیت و پوش کن. GitHub Pages خودش دوباره دیپلوی می‌کنه (چند دقیقه طول می‌کشه).

---

## ۵. تنظیم Environment Variables — خلاصه

| متغیر | کجا | برای چی |
|---|---|---|
| `ALLOWED_ORIGINS` | Render | فقط اجازه بده فرانت خودت (CORS) به بک‌اند وصل بشه |
| `OWNER_TOKEN` | Render | توکن مخصوص خودت برای پاک کردن چت گروه |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | Render (اختیاری) | برای وصل شدن صدا پشت شبکه‌های سخت‌گیر (پایین‌تر توضیح دادم) |
| `BACKEND_URL` | `frontend/config.js` | آدرس بک‌اندت (این یه راز نیست، فقط یه لینکه) |

هیچ‌کدوم از این‌ها به‌جز مقدار `BACKEND_URL` نباید داخل کد frontend/GitHub (public) قرار بگیره — همه‌شون تو پنل Environment Variables خود Render ست میشن، نه تو فایل‌های کد.

---

## ۶. تست کردن Voice Chat

1. آدرس GitHub Pages رو تو دو تب/دو دستگاه مختلف باز کن.
2. تو هر کدوم یه اسم بزن و Enter بزن.
3. رو دکمه‌ی "ورود به وویس چت" کلیک کن (اجازه‌ی میکروفون رو قبول کن — مرورگر فقط رو HTTPS این اجازه رو میده، که چون GitHub Pages و Render هردو HTTPS هستن مشکلی نیست).
4. باید صدای همدیگه رو بشنوید. دکمه‌ی 🔇 برای Mute/Unmute هست.
5. تو لیست آنلاین‌ها، کنار اسم کسی که تو وویس چته یه نقطه‌ی سبز میاد؛ اگه میوت باشه آیکون 🔇 هم میاد.

---

## ۷. اگه Voice Chat بین دو اینترنت مختلف وصل نشد — دقیقاً مشکل از کجاست

WebRTC اول سعی می‌کنه یه اتصال مستقیم (peer-to-peer) بین دو کاربر بسازه. این کار با کمک یه سرور **STUN** (که تو این پروژه از STUN رایگان گوگل استفاده شده) انجام میشه و برای بیشتر شبکه‌های خانگی/موبایل کافیه.

**ولی** بعضی شبکه‌ها (NAT سخت‌گیر شرکتی، بعضی موبایل‌دیتاها، بعضی روترها) اجازه‌ی اتصال مستقیم رو نمیدن. اونجا فقط یه **TURN server** (که صدا رو relay/رله می‌کنه) کار می‌کنه.

علامت اینکه مشکل TURN‌ه: دو نفر تو یه وای‌فای صدا رو میشنون، ولی وقتی یکی‌شون از موبایل‌دیتا یا یه شبکه‌ی دیگه وصل میشه، صدا نمیاد.

### راه‌حل رایگان: Open Relay Project
1. برو https://www.metered.ca/tools/openrelay/ و یه اکانت رایگان بساز (۲۰ گیگابایت ترافیک رایگان در ماه — برای استفاده‌ی شخصی/کوچیک کافیه).
2. یه "Username" و "Credential" TURN بهت میده.
3. تو Render، این‌ها رو به عنوان Environment Variables بذار:
   ```
   TURN_URL=turn:relay1.expressturn.com:3478   (یا آدرسی که خودشون بهت میدن)
   TURN_USERNAME=...
   TURN_CREDENTIAL=...
   ```
4. سرویس رو رستارت کن (Render خودش با تغییر env var رستارت می‌کنه).
5. فرانت‌اند خودش موقع اتصال از `/api/ice-config` این تنظیمات رو می‌گیره — نیازی به تغییر کد frontend نیست.

اگه این متغیرها خالی بمونن، اپ بازم کار می‌کنه ولی فقط با STUN — یعنی بین بعضی جفت شبکه‌ها ممکنه صدا وصل نشه. این محدودیتِ صادقانه‌ی نسخه‌ی کاملاً رایگانه: TURN واقعی (که رله می‌کنه) پهنای باند مصرف می‌کنه و سرویس‌های کاملاً رایگانش همیشه یه سقف مصرف دارن.

---

## اجرای لوکال (برای تست قبل از دیپلوی)

```bash
cd backend
cp .env.example .env
# .env رو باز کن، ALLOWED_ORIGINS رو بذار روی آدرس لوکالت مثلاً http://localhost:5500
npm install
npm start
```

بعد `frontend/config.js` رو موقتاً بذار `BACKEND_URL: 'http://localhost:3000'` و `frontend/index.html` رو با یه static server لوکال باز کن (مثلاً افزونه‌ی Live Server تو VSCode، یا `npx serve frontend`).

---

## قابلیت‌هایی که چک شدن و کار می‌کنن

- ✅ ورود با Username (یک‌بار، بدون پسورد)
- ✅ Group Chat
- ✅ Private Message / DM (کلیک رو اسم تو لیست آنلاین‌ها)
- ✅ Online Users (زنده، با socket events آپدیت میشه)
- ✅ Join / Leave Voice
- ✅ Mute / Unmute (هم لوکال قطع میشه، هم بقیه تو لیست آنلاین می‌بینن که میوتی)
- ✅ Reconnect بعد از قطعی اینترنت (Socket.io reconnection + rejoin خودکار با همون اسم + یه بنر بالای صفحه که وضعیت اتصال رو نشون میده)
- ✅ Cleanup درست: با ترک وویس یا بستن تب، تمام RTCPeerConnection‌ها `close()` میشن و track‌های میکروفون `stop()` میشن — از Memory/Connection Leak جلوگیری میشه
- ✅ Error handling: تلاش برای گرفتن میکروفون، signaling، و اتصال سوکت همه try/catch یا callback error دارن
- ✅ CORS محدود به `ALLOWED_ORIGINS`
- ✅ هیچ Secret/Token داخل کد frontend یا commit نیست — `OWNER_TOKEN` و TURN credentials فقط در Environment Variables سمت Render هستن

## محدودیت‌های شناخته‌شده (صادقانه)

- state (پیام‌ها، کاربرای آنلاین) فقط تو حافظه‌ی سرور نگه داشته میشه؛ اگه Render سرویس رو رستارت کنه (یا از خواب بیدار بشه)، تاریخچه‌ی چت پاک میشه. برای پایداری کامل باید یه دیتابیس رایگان (مثل MongoDB Atlas free tier) اضافه بشه — اگه خواستی تو یه مرحله‌ی بعدی اضافه‌ش می‌کنم.
- وویس چت به روش mesh (هرکس مستقیم/رله به بقیه وصل میشه) پیاده شده؛ برای گروه‌های تا حدود ۶-۸ نفر همزمان مناسبه. برای گروه‌های بزرگ‌تر معماری SFU (مثل mediasoup) لازمه که فراتر از یه سرویس رایگان ساده‌ست.
- پلن رایگان Render می‌خوابه؛ این یعنی cold start چند ثانیه‌ای برای اولین کاربر بعد از یه دوره‌ی سکوت — واقعیت "رایگان واقعی"‌ه، هیچ سرویس همیشه-روشنِ کاملاً رایگانی که قابل اتکا باشه وجود نداره.
