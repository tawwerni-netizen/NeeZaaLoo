# 🚀 دليل النشر والتشغيل على سيرفر Hostinger Cloud / VPS
## Nizalo Arena Production Deployment Guide

هذا الدليل يوضح بالخطوات السريعة والمباشرة كيفية إطلاق خادم منصة **نيزالو (Nizalo)** على سيرفر سحابي (Hostinger Cloud أو أي خادم يعمل بنظام Ubuntu 22.04/24.04).

---

### الخطوة 1: تجهيز السيرفر وحزم التشغيل الأساسية

قم بالدخول إلى السيرفر عبر SSH:
```bash
ssh root@YOUR_SERVER_IP
```

قم بتحديث الحزم وتثبيت Node.js v20، Git، Nginx، وPM2:
```bash
# تحديث النظام
apt update && apt upgrade -y

# تثبيت Git و curl و build-essential
apt install -y git curl ufw nginx certbot python3-certbot-nginx

# تثبيت Node.js v20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# تثبيت مدير العمليات PM2 عالمياً
npm install -g pm2
```

---

### الخطوة 2: استنساخ المشروع وإعداد متغيرات البيئة

```bash
# إنشاء مجلد التطبيقات
mkdir -p /var/www/nizalo
cd /var/www/nizalo

# استنساخ مستودع المشروع
git clone https://github.com/tawwerni-netizen/NeeZaaLoo.git .

# تجهيز ملف البيئة الإنتاجي
cp .env.production.example .env
nano .env
```

> **ملاحظة هامة حول إعدادات `.env`:**
> 1. ضع رابط قاعدة البيانات في `DATABASE_URL`.
> 2. قم بتوليد مفاتيح التشفير عبر:
>    ```bash
>    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
>    ```
>    وضع الناتج في `AUTH_SIGNING_KEY_B64` و`AUTH_ENCRYPTION_KEY_B64`.
> 3. تأكد من إبقاء `USE_PG_BUS=false` لتقليل استهلاك اتصالات قاعدة البيانات للصفر.

---

### الخطوة 3: إعداد Nginx وشهادة الأمان SSL

قم بنسخ ملف إعدادات Nginx المجهز مسبقاً:
```bash
cp deploy/nginx/nizalo.conf /etc/nginx/sites-available/nizalo.conf
ln -s /etc/nginx/sites-available/nizalo.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# فحص صحة إعدادات Nginx
nginx -t

# إعادة تحميل Nginx
systemctl reload nginx
```

استخراج شهادة SSL مجانية من Let's Encrypt عبر Certbot:
```bash
certbot --nginx -d nizalo.com -d www.nizalo.com -d app.nizalo.com
```

---

### الخطوة 4: تشغيل النشر الآلي بدون توقف (Zero-Downtime Deploy)

قم بتشغيل سكربت النشر الآلي المدمج:
```bash
bash scripts/deploy.sh
```

يقوم هذا السكربت بـ:
1. سحب أحدث كود من فرع `main`.
2. تثبيت الحزم بدقة عبر `npm ci`.
3. بناء تطبيق Next.js بالكامل لجميع المسارات (`npm run build`).
4. تشغيل / إعادة تحميل الخادم عبر PM2 (`pm2 reload ecosystem.config.cjs`).
5. فحص صحة الخادم عبر نقطة الفحص الطبي `/diag`.

لجعل PM2 يقلع تلقائياً عند إعادة تشغيل السيرفر:
```bash
pm2 startup
pm2 save
```

---

### الخطوة 5: التحقق والمراقبة والأوامر الشائعة

- **عرض حالة الخادم والذاكرة:**
  ```bash
  pm2 status
  ```
- **عرض سجلات الأخطاء المباشرة:**
  ```bash
  pm2 logs nizalo-platform
  ```
- **فحص صحة البريد الإلكتروني:**
  ```bash
  node scripts/test-email.mjs your-email@example.com
  ```
- **إعادة تشغيل النشر عند أي تحديث مستقبلي:**
  ```bash
  bash scripts/deploy.sh
  ```
