# قرارداد API و اتصال

مرجع معرفی‌شده برگزارکننده: [Liara OpenAPI](https://developers.liara.ir/) و [فهرست صفحات](https://developers.liara.ir/llms.txt). در بازبینی ۲۰۲۶-۱۰-۲۲ قراردادهای release، env و دامنه با پیاده‌سازی تطبیق داده شدند. مستندات رسمی و CLI مدرک اجرای واقعی روی حساب نیستند.

PaaS base برابر `https://api.liara.ir` است. Bearer token و query صریح `teamID` در سرور اضافه می‌شوند. نوشتن retry خودکار ندارد. DNS base متفاوت `https://dns-service.liara.ir` دارد و نوشتن DNS در MVP فعال نیست.

| عملیات | مسیر و قرارداد |
|---|---|
| حساب و پلن | GET `/v1/me`؛ فقط plans استخراج می‌شود |
| موجودی | GET `/v1/billing`؛ نام فیلد و واحد نیازمند تأیید حساب |
| برنامه‌ها | GET/POST `/v1/projects` |
| جزئیات | GET `/v1/projects/{name}`؛ شکل envها نیازمند تأیید |
| شبکه | GET `/v1/networks`، مرجع CLI |
| سورس | POST `/v2/projects/{name}/sources`؛ multipart با فیلد file |
| release | POST `/v2/projects/{name}/releases`؛ sourceID، port، type=node |
| لاگ ساخت | GET `/v2/releases/{id}/build-logs`، قرارداد CLI |
| لاگ اجرا | GET `/v2/projects/{name}/logs` با start/direction/last_lines |
| رخداد | GET `/v1/projects/{name}/events` |
| منابع | GET `/v1/projects/{name}/metrics/{summary,cpu,memory}` |
| انتشارها | GET `/v1/projects/{name}/releases` |
| env | POST `/v1/projects/update-envs`؛ project و variables[{key,value}] |
| restart | POST `/v1/projects/{name}/actions/restart` |
| منابع | POST `/v1/projects/{name}/resize` با planID؛ تغییر bundle مجاز نیست |
| دامنه | POST `/v1/domains`؛ name، project، type=PROJECT |
| SSL | POST `/v1/domains/provision-ssl-certs`؛ domain با تطبیق مالکیت |

منابع: [انتشار](https://developers.liara.ir/pass/deploy/deploy-releases)، [سورس](https://developers.liara.ir/pass/deploy/deploy-sources-code)، [env](https://developers.liara.ir/pass/settings/update-envs)، [دامنه](https://developers.liara.ir/pass/domains/create-a-domain)، [حساب](https://docs.liara.ir/references/api/get-info/)، [مالی](https://docs.liara.ir/references/api/billing/). فایل‌های OpenAPI و CLI در پوشه‌های api و reference موجودند.

## پیش از اولین عملیات واقعی

۱. کلید کوتاه‌عمر و teamID همان تیم را تنظیم کنید؛ توکن مالک را read-only فرض نکنید.
۲. GETها را اجرا و نام فیلد موجودی، واحد تومان، ترکیب قیمت resource/bundle و مالیات را با پنل تطبیق دهید.
۳. روی نمونه رفتار merge/replace و حفظ سایر envها را بررسی کنید. مقادیر masked مانع بازنویسی می‌شوند.
۴. فقط بعد از این بررسی‌ها متغیرهای تأیید قرارداد را فعال کنید. سقف پیشنهادی ۵۰۰ هزار تومان مجوز خودکار خرید نیست.
۵. نتیجه واقعی درخواست، شناسه release، URL و سه بررسی عملکرد ثبت شوند.

Liara AI با URL پروژه و `/chat/completions` استفاده می‌شود؛ مدل‌های Flash و Pro در تحلیل و اصلاح واقعی آزمایش شده‌اند. قیمت کل مصرف مدل به‌صورت مستقل حسابرسی نشده است. GitHub token محدود Contents read/write و Actions read لازم است. workflow ثابت باید روی شاخه اصلی مخزن مستقل نمونه موجود باشد. ابزار CLI برای بررسی دستی اپراتور مفید است؛ مدل اجازه اجرای CLI یا shell دلخواه ندارد.

در حساب مسابقه، فیلد `team.balance` و فهرست `project.envs` مشاهده شدند. ارسال فهرست کامل env و حفظ مقادیر دیگر با خواندن مجدد تأیید شده است؛ حالت `full-list-verified` بر همین اساس فعال شد. قرارداد حذف یا merge و واحد CPU/RAM از این آزمایش استنتاج نمی‌شود. جزئیات اجرای واقعی در VALIDATION.fa.md آمده است.
