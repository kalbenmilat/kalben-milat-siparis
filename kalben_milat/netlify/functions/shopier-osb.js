const { createClient } = require('@supabase/supabase-js');
const querystring = require('querystring');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    // Sadece POST kabul et
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: 'METHOD_NOT_ALLOWED'
        };
    }

    try {
        // --------------------------------------------------
        // 1. SHOPIER'DAN GELEN VERİYİ OKU
        // --------------------------------------------------

        let body = event.body || '';

        if (event.isBase64Encoded) {
            body = Buffer.from(body, 'base64').toString('utf8');
        }

        const payload = querystring.parse(body);

        // --------------------------------------------------
        // 2. OSB KİMLİK DOĞRULAMA
        // --------------------------------------------------

        const osbUsername = (
            payload.osb_user ||
            payload.username ||
            payload.OSB_USER ||
            ''
        ).toString().trim();

        const osbPassword = (
            payload.osb_password ||
            payload.password ||
            payload.OSB_PASSWORD ||
            ''
        ).toString().trim();

        if (
            !osbUsername ||
            !osbPassword ||
            osbUsername !== process.env.SHOPIER_OSB_USER ||
            osbPassword !== process.env.SHOPIER_OSB_PASSWORD
        ) {
            console.warn('OSB authentication failed.');

            return {
                statusCode: 401,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                body: 'UNAUTHORIZED_OSB_CREDENTIALS'
            };
        }

        // --------------------------------------------------
        // 3. SİPARİŞ NUMARASINI AL
        // --------------------------------------------------

        const shopierOrderId = (
            payload.order_id ||
            payload.res_id ||
            payload.custom_order_id ||
            ''
        )
            .toString()
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');

        if (!shopierOrderId) {
            return {
                statusCode: 400,
                body: 'MISSING_ORDER_ID'
            };
        }

        // --------------------------------------------------
        // 4. DİĞER BİLGİLER
        // --------------------------------------------------

        const totalAmount = parseFloat(
            (
                payload.total_amount ||
                payload.price ||
                payload.amount ||
                '0'
            ).toString().replace(',', '.')
        ) || 0;

        const customerEmail =
            payload.email ||
            payload.buyer_email ||
            payload.customer_email ||
            null;

        const now = new Date().toISOString();

        // --------------------------------------------------
        // 5. SİPARİŞ VAR MI?
        // --------------------------------------------------

        const { data: existingOrder, error: findError } = await supabase
            .from('orders')
            .select('id, status, used_at')
            .eq('shopier_order_id', shopierOrderId)
            .maybeSingle();

        if (findError) {
            console.error('Order lookup error:', findError);

            return {
                statusCode: 500,
                body: 'DATABASE_LOOKUP_ERROR'
            };
        }

        // --------------------------------------------------
        // 6. SİPARİŞ ZATEN VARSA
        // --------------------------------------------------

        if (existingOrder) {

            /*
             * ÇOK ÖNEMLİ:
             *
             * Sipariş daha önce form ile doldurulduysa:
             *
             * status = information_received
             *
             * olabilir.
             *
             * Shopier aynı OSB bildirimini tekrar gönderirse
             * müşterinin form bilgilerini bozmamalıyız.
             */

            const updateData = {
                payment_status: 'paid',
                verification_method: 'osb',
                verified_at: now,
                verified_by: 'SHOPIER_OSB',
                total_amount: totalAmount,
                customer_email: customerEmail,
                raw_payment_payload: payload,
                updated_at: now
            };

            /*
             * Eğer müşteri henüz form doldurmadıysa
             * ödeme durumunu payment_verified yap.
             *
             * Eğer form zaten doldurulduysa status'u
             * information_received olarak bırak.
             */
            if (
                existingOrder.status !== 'information_received' &&
                existingOrder.used_at === null
            ) {
                updateData.status = 'payment_verified';
            }

            const { error: updateError } = await supabase
                .from('orders')
                .update(updateData)
                .eq('id', existingOrder.id);

            if (updateError) {
                console.error('Order update error:', updateError);

                return {
                    statusCode: 500,
                    body: 'DATABASE_UPDATE_ERROR'
                };
            }

            console.log(
                `OSB processed existing order: ${shopierOrderId}`
            );

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8'
                },
                body: 'OK'
            };
        }

        // --------------------------------------------------
        // 7. SİPARİŞ YOKSA YENİ OLUŞTUR
        // --------------------------------------------------

        const { error: insertError } = await supabase
            .from('orders')
            .insert({
                shopier_order_id: shopierOrderId,

                payment_status: 'paid',
                status: 'payment_verified',

                verification_method: 'osb',
                verified_at: now,
                verified_by: 'SHOPIER_OSB',

                total_amount: totalAmount,
                customer_email: customerEmail,

                raw_payment_payload: payload,

                created_at: now,
                updated_at: now
            });

        if (insertError) {
            /*
             * Aynı anda iki OSB bildirimi geldiyse UNIQUE
             * shopier_order_id sayesinde ikinci kayıt
             * oluşturulamaz.
             *
             * Shopier'e yine OK döndürüyoruz çünkü ödeme
             * bildirimi zaten işlenmiş olabilir.
             */

            console.error('Order insert error:', insertError);

            return {
                statusCode: 500,
                body: 'DATABASE_INSERT_ERROR'
            };
        }

        console.log(
            `New Shopier order verified: ${shopierOrderId}`
        );

        // --------------------------------------------------
        // 8. SHOPIER'A BAŞARILI CEVAP
        // --------------------------------------------------

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8'
            },
            body: 'OK'
        };

    } catch (error) {

        console.error('OSB internal error:', error);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8'
            },
            body: 'INTERNAL_SERVER_ERROR'
        };
    }
};