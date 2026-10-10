export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).json({ ok: true });

    const attr = req.body?.data?.attributes || {};
    const email = attr.user_email || attr.customer_email || 'unknown';
    const originalCustomerEmail = email;
    const isPro = (attr.first_order_item?.product_name || '').toLowerCase().includes('pro');
    const plan = isPro ? 'pro' : 'basic';
    const licenseKey = `NOOR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    console.log("License generated for", originalCustomerEmail, "plan", plan, "key", licenseKey);

    try {
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Supabase credentials are missing.");

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(url, key);
      const { error } = await supabase.from('licenses').insert({
        email: email,
        license_key: licenseKey,
        plan: plan,
        status: 'active',
        created_at: new Date().toISOString()
      });
      if (error) console.log("Supabase insert error:", error.message);
    } catch(e){ console.log("Supabase insert error:", e.message); }

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: "pakistanumair123@gmail.com",
          subject: `✅ Your NoorFinance License Key (for ${originalCustomerEmail}) - ${plan}`,
          html: `<div style="font-family:sans-serif;padding:20px"><h2>Your license is ready!</h2><p><b>Original Customer:</b> ${originalCustomerEmail}</p><p><b>Plan:</b> ${plan}</p><p><b>License Key:</b> <code style="font-size:18px">${licenseKey}</code></p><p><b>Activation URL:</b> <a href="https://noorfinance.vercel.app/activate">https://noorfinance.vercel.app/activate</a></p></div>`
        });
      } catch(e){ console.log("email err", e.message); }
    }

    return res.status(200).json({ ok: true, email, plan, licenseKey, phase17: "complete" });
  } catch(e){
    return res.status(200).json({ ok: true, warning: e.message });
  }
}
