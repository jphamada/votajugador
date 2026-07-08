export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password } = req.body;

  // Credenciales cargadas desde el entorno de Vercel
  // Valores por defecto para fallback local si no están seteadas las env variables
  const ADMIN_USER = process.env.ADMIN_USER || "admin";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "lgad202!#$";

  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    return res.status(200).json({ success: true, token: "authorized_admin_session" });
  } else {
    return res.status(401).json({ success: false, error: "Credenciales incorrectas" });
  }
}
