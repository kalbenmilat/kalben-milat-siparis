const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) };

    try {
        const { orderId, turnstileToken } = JSON.parse(event.body || '{}');
        if (!orderId || !turnstileToken) return { statusCode: 400, body: JSON.stringify({ message: 'Eksik bilgi gönderildi.' }) };

        // Cloudflare Captcha Sunucu Doğrulaması
        const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken })
        });
        const turnstileOutcome = await turnstileRes.json();
        if (!turnstileOutcome.success) return { statusCode: 403, body: JSON.stringify({ message: 'Güvenlik doğrulaması başarısız oldu.' }) };

        const cleanOrderId = orderId.toString().toUpperCase().replace(/\s+/g, '');

        const { data: order, error } = await supabase
            .from('orders')
            .select('id, shopier_order_id, payment_status, used_at, status')
            .eq('shopier_order_id', cleanOrderId)
            .maybeSingle();

        if (error || !order) return { statusCode: 404, body: JSON.stringify({ message: 'Sipariş numarası bulunamadı veya ödemesi henüz onaylanmadı.' }) };
        if (order.payment_status !== 'paid') return { statusCode: 400, body: JSON.stringify({ message: 'Bu siparişin ödemesi doğrulanmadı.' }) };
        if (order.used_at !== null || order.status === 'information_received') return { statusCode: 409, body: JSON.stringify({ message: 'Bu sipariş numarası ile daha önce form doldurulmuş.' }) };

        // Formu doldurması için 1 saatlik geçici vize (token) veriyoruz
        const sessionToken = jwt.sign({ orderId: order.id, shopierOrderId: order.shopier_order_id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, token: sessionToken, shopierOrderId: order.shopier_order_id }) };

    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Sunucu hatası meydana geldi.' }) };
    }
};