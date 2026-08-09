# Kalben Milat V2
1. Supabase projesi oluştur.
2. supabase_schema.sql dosyasını SQL Editor'da çalıştır.
3. Project Settings > API'den URL + anon/publishable key alıp config.js'e yaz. Service Role/Secret key kullanma.
4. Klasörü Netlify'a deploy et.
5. Domain bağlandığında kodu yeniden yazmak gerekmez; form.kalbenmilat.com alt domaini ayrı Netlify site olarak bağlanabilir.
V2: maksimum 6 fotoğraf, WebP/1600px optimizasyonu, mesaj 1000, başlık 60, alıcı 50, hitap 30, müzik 100, ek bilgi 50 karakter.
Sonraki aşama: Supabase Auth + admin RLS, CAPTCHA/rate limit, Shopier webhook doğrulaması ve anı sayfası.
