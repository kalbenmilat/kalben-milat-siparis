const { createClient } = require('@supabase/supabase-js');
const querystring = require('querystring');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const payload = querystring.parse(event.body);
        const osbUsername = payload.osb_user || payload.username || payload.OSB_USER;
        const osbPassword = payload.osb_password || payload.password || payload.OSB_PASSWORD;
        const shopierOrderId = (payload.order_id || payload.res_id || payload.custom_order_id || '').toString().trim().toUpperCase();
        const totalAmount = parseFloat(payload.total_amount || payload.price || '0');
        const customerEmail = payload.email || payload.buyer_email || null;

        if (!osbUsername || !osbPassword || osbUsername !== process.env.SHOPIER_OSB_USER || osbPassword !== process.env.SHOPIER_OSB_PASSWORD) {
            return { statusCode: 401, body: 'UNAUTHORIZED_OSB_CREDENTIALS' };
        }
        if (!shopierOrderId) return { statusCode: 400, body: 'MISSING_ORDER_ID' };

        const { error } = await supabase
            .from('orders')
            .upsert({
                shopier_order_id: shopierOrderId,
                payment_status: 'paid',
                status: 'payment_verified',
                verification_method: 'osb',
                verified_at: new Date().toISOString(),
                verified_by: 'SHOPIER_OSB_WEBHOOK',
                total_amount: totalAmount,
                customer_email: customerEmail,
                raw_payment_payload: payload
            }, { onConflict: 'shopier_order_id', ignoreDuplicates: false });

        if (error) return { statusCode: 500, body: 'DATABASE_ERROR' };

        return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };

    } catch (err) {
        return { statusCode: 500, body: 'INTERNAL_SERVER_ERROR' };
    }
};