export default async function handler(req, res) {
  console.log("Webhook hit:", req.method, JSON.stringify(req.body).slice(0,200));
  return res.status(200).json({ ok: true, received: true, message: "NoorFinance webhook live" });
}