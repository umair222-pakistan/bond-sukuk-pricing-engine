export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).json({ ok: true });

    const data = req.body?.data || {};
    const attr = data.attributes || {};
    const event = req.body?.meta?.event_name || 'order_created';
    const email = attr.user_email || attr.customer_email || 'unknown';
    const name = attr.user_name || 'Customer';
    const orderId = data.id || `order_${Date.now()}`;

    console.log(`[PHASE 17] ${event} - ${email}`);

    // Try create license
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const licenseKey = `NOOR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
        const isPro = (attr.first_order_item?.product_name || '').toLowerCase().includes('pro');

        const { error } = await supabase.from('licenses').insert({
          license_key: licenseKey,
          email: email,
          tier: isPro ? 'pro' : 'basic',
          status: 'active',
          provider: 'lemonsqueezy',
          lemon_order_id: String(orderId),
        });

        if (!error) {
          // Try send email - but don't fail if email fails
          try {
            if (process.env.RESEND_API_KEY) {
              const { Resend } = await import('resend');
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: 'NoorFinance <onboarding@resend.dev>',
                to: email,
                subject: '✅ Your NoorFinance License Key',
                html: `<div style="font-family:sans-serif;padding:20px"><h2>Assalam-o-Alaikum ${name}!</h2><p>Thanks for purchasing NoorFinance!</p><div style="background:#f3f4f6;padding:15px;border-radius:8px;margin:20px 0"><b>License Key:</b><br><code style="font-size:18px">${licenseKey}</code></div><p>Activate: <a href="https://noorfinance.vercel.app/activate">noorfinance.vercel.app/activate</a></p><p>Tier: ${isPro ? 'PRO' : 'BASIC'}</p></div>`
              });
              console.log("Email sent to", email);
            }
          } catch (emailErr) { console.log("Email error (ignored):", emailErr.message); }
        } else { console.log("Supabase insert error:", error.message); }
      }
    } catch (dbErr) { console.log("DB error (ignored):", dbErr.message); }

    return res.status(200).json({ ok: true, event, email, phase17: "live" });
    
  } catch (e) {
    console.error("Outer error (still 200):", e.message);
    return res.status(200).json({ ok: true, warning: e.message });
  }
}