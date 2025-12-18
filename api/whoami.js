export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const r = await fetch("https://api.ipify.org?format=json");
  const data = await r.json();
  res.status(200).json({ outgoingIp: data.ip });
}