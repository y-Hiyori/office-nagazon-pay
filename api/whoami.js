export default async function handler(req, res) {
  const r = await fetch("https://api.ipify.org?format=json");
  const { ip } = await r.json();
  res.status(200).json({ outgoingIp: ip });
}