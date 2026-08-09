const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) };

    try {
        const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
        if (!token) return { statusCode: 401, body: JSON.stringify({ message: 'Yetkisiz işlem.' }) };

        let decodedToken;
        try { decodedToken = jwt.verify(token, process.env.JWT_SECRET); } 
        catch (e) { return { statusCode: 401, body: JSON.stringify({ message: 'Oturum süresi dolmuş.' }) }; }

        const payload = JSON.parse(event.body || '{}');
        const { purpose, recipient, nickname, title, message, date, music, extraInfo, extraDate, photos } = payload;

        // Siparişin mükerrer işlenmesini atomik olarak kontrol et
        const { data: currentOrder } = await supabase.from('orders').select('used_at').eq('id', decodedToken.orderId).single();
        if (!currentOrder || currentOrder.used_at !== null) return { statusCode: 409, body: JSON.stringify({ message: 'Bu sipariş daha önce işlenmiş.' }) };

        const now = new Date().toISOString();
        const { error: updateError } = await supabase.from('orders').update({
            purpose, recipient_name: recipient.trim(), recipient_nickname: nickname ? nickname.trim() : null,
            title: title.trim(), message: message.trim(), special_date: date || null, music_name: music ? music.trim() : null,
            extra_info: extraInfo ? extraInfo.trim() : null, extra_date: extraDate || null,
            status: 'information_received', used_at: now, updated_at: now
        }).eq('id', decodedToken.orderId);

        if (updateError) throw updateError;

        // Fotoğrafları Storage'a Yükleme
        for (let i = 0; i < photos.length; i++) {
            const base64Data = photos[i].replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const storagePath = `${decodedToken.orderId}/${String(i + 1).padStart(2, '0')}.webp`;

            const { error: uploadError } = await supabase.storage.from('customer-photos').upload(storagePath, buffer, { contentType: 'image/webp', upsert: true });
            if (uploadError) throw uploadError;

            await supabase.from('order_photos').insert({ order_id: decodedToken.orderId, storage_path: storagePath, sort_order: i + 1 });
        }

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, message: 'Form başarıyla kaydedildi.' }) };

    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Sipariş kaydedilirken hata oluştu.' }) };
    }
};