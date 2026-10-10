export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).json({ ok: true });
    const attr = req.body?.data?.attributes || {};
    const data = req.body?.data || {};
    const email = attr.user_email || 'unknown';
    const orderId = String(data.id || Date.now());
    const isPro = (attr.first_order_item?.product_name || '').toLowerCase().includes('pro');
    const plan = isPro ? 'pro' : 'basic';
    const licenseKey = `NOOR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;

    try {
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(url, key);
        
        await supabase.from('licenses').insert({
          email: email,
          plan: plan,
          tier: plan,
          license_key: licenseKey,
          lemon_order_id: orderId,
          status: 'active',
          provider: 'lemonsqueezy'
        });

        if (process.env.RESEND_API_KEY) {
          try {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: 'NoorFinance <onboarding@resend.dev>',
              to: email,
              subject: '✅ Your NoorFinance License',
              html: `<div style="font-family:sans-serif;padding:20px"><h2>Your license is ready!</h2><p><b>License:</b> <code style="font-size:18px">${licenseKey}</code></p><p><b>Plan:</b> ${plan.toUpperCase()}</p><p>Activate: <a href="https://noorfinance.vercel.app/activate">noorfinance.vercel.app/activate</a></p></div>`
            });
          } catch(e){ console.log("email err", e.message); }
        }
      }
    } catch(e){ console.log("db err", e.message); }

    return res.status(200).json({ ok: true, email, plan, licenseKey, phase17: "complete" });
  } catch(e){
    return res.status(200).json({ ok: true, warning: e.message });
  }
}