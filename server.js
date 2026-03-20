const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { randomUUID } = require('crypto');
const db      = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── USERS (ยังใช้ JSON ไฟล์เล็กๆ ก็พอ) ─────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const init = {
      users:  [{ username: 'user1', password: '1234', name: 'ผู้ใช้ทดสอบ', created_at: new Date().toISOString(), banned: false, reportCount: 0 }],
      admins: [{ username: 'admin', password: 'admin1234' }],
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(init, null, 2));
    console.log('✅ Created users.json  (admin / admin1234)');
    return init;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// ── ANNOUNCEMENT FILE ─────────────────────────────────────────────────────────
const ANN_FILE = path.join(__dirname, 'announcement.json');
function loadAnn()     { return fs.existsSync(ANN_FILE) ? JSON.parse(fs.readFileSync(ANN_FILE, 'utf8')) : { text: '', active: false }; }
function saveAnn(data) { fs.writeFileSync(ANN_FILE, JSON.stringify(data, null, 2)); }

// ── TOKENS (in-memory) ────────────────────────────────────────────────────────
const tokens = {};
function createToken(payload) { const t = randomUUID(); tokens[t] = payload; return t; }

function authMiddleware(req, res, next) {
  const t = req.headers['x-token'];
  if (!t || !tokens[t]) return res.status(401).json({ error: 'กรุณาล็อกอินก่อน' });
  const u = tokens[t];
  if (u.role === 'user') {
    const { users } = loadUsers();
    const found = users.find(x => x.username === u.username);
    if (found?.banned) return res.status(403).json({ error: 'บัญชีของคุณถูกระงับ' });
  }
  req.user = u;
  next();
}
function adminMiddleware(req, res, next) {
  const t = req.headers['x-token'];
  if (!t || !tokens[t]) return res.status(401).json({ error: 'ไม่ได้รับอนุญาต' });
  if (tokens[t].role !== 'admin') return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
  req.user = tokens[t];
  next();
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (password.length < 4)            return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 4 ตัว' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'username ใช้ได้เฉพาะ a-z, 0-9, _' });
  const data = loadUsers();
  if (data.users.find(u => u.username === username)) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  data.users.push({ username, password, name, created_at: new Date().toISOString(), banned: false, reportCount: 0 });
  saveUsers(data);
  const token = createToken({ username, name, role: 'user' });
  res.status(201).json({ token, name });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const { users } = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user)         return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  if (user.banned)   return res.status(403).json({ error: 'บัญชีของคุณถูกระงับ' });
  const token = createToken({ username: user.username, name: user.name, role: 'user' });
  res.json({ token, name: user.name, role: 'user' });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const { admins } = loadUsers();
  const admin = admins.find(a => a.username === username && a.password === password);
  if (!admin) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  const token = createToken({ username: admin.username, name: 'Admin', role: 'admin' });
  res.json({ token });
});

app.post('/api/logout', (req, res) => {
  delete tokens[req.headers['x-token']];
  res.json({ message: 'ออกจากระบบแล้ว' });
});

app.get('/api/me', authMiddleware, (req, res) => res.json(req.user));

// ── REPORTS ───────────────────────────────────────────────────────────────────
app.get('/api/reports', async (req, res) => {
  try {
    const { status, province, limit, offset } = req.query;
    res.json(await db.getReports({ status, province, limit: Number(limit) || 50, offset: Number(offset) || 0 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/:id', async (req, res) => {
  try {
    const r = await db.getReport(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบรายงาน' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reports', authMiddleware, async (req, res) => {
  try {
    const { station, brand, status, fuel_types, province, lat, lng, comment } = req.body;
    if (!station)  return res.status(400).json({ error: 'กรุณากรอกชื่อปั๊ม' });
    if (!province) return res.status(400).json({ error: 'กรุณาเลือกจังหวัด' });
    if (!['มีน้ำมัน', 'ไม่มีน้ำมัน', 'คิวยาว'].includes(status))
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    const report = {
      id: randomUUID(), station, brand: brand || 'อื่นๆ', status,
      fuel_types: fuel_types || [], province,
      lat: lat || null, lng: lng || null,
      comment: comment || '', upvotes: 0,
      reported_by: req.user.name,
      created_at: new Date().toISOString(),
    };
    // เพิ่ม reportCount ให้ผู้ใช้
    const data = loadUsers();
    const u = data.users.find(x => x.username === req.user.username);
    if (u) { u.reportCount = (u.reportCount || 0) + 1; saveUsers(data); }
    res.status(201).json(await db.addReport(report));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/reports/:id/upvote', async (req, res) => {
  try {
    const r = await db.upvote(req.params.id);
    if (!r) return res.status(404).json({ error: 'ไม่พบรายงาน' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/reports/:id', adminMiddleware, async (req, res) => {
  try {
    if (!await db.deleteReport(req.params.id)) return res.status(404).json({ error: 'ไม่พบรายงาน' });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', async (req, res) => {
  try { res.json(await db.getStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/map', async (req, res) => {
  try { res.json(await db.getMapPoints()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ANNOUNCEMENT ──────────────────────────────────────────────────────────────
app.get('/api/announcement', (req, res) => res.json(loadAnn()));
app.post('/api/admin/announcement', adminMiddleware, (req, res) => {
  const { text, active } = req.body;
  saveAnn({ text: text || '', active: !!active, updated_at: new Date().toISOString() });
  res.json({ message: 'บันทึกแล้ว' });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/reports', adminMiddleware, async (req, res) => {
  try { res.json(await db.getReports({ limit: 999 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const { users } = loadUsers();
  res.json({ users });
});

app.patch('/api/admin/users/:username/ban', adminMiddleware, (req, res) => {
  const { username } = req.params;
  const { banned }   = req.body;
  const data = loadUsers();
  const u = data.users.find(x => x.username === username);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  u.banned = !!banned;
  saveUsers(data);
  if (banned) Object.keys(tokens).forEach(t => { if (tokens[t].username === username) delete tokens[t]; });
  res.json({ message: banned ? 'แบนแล้ว' : 'ยกเลิกแบนแล้ว' });
});

app.delete('/api/admin/users/:username', adminMiddleware, (req, res) => {
  const { username } = req.params;
  const data = loadUsers();
  const idx  = data.users.findIndex(x => x.username === username);
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  data.users.splice(idx, 1);
  saveUsers(data);
  Object.keys(tokens).forEach(t => { if (tokens[t].username === username) delete tokens[t]; });
  res.json({ message: 'ลบแล้ว' });
});

app.post('/api/admin/add-admin', adminMiddleware, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  const data = loadUsers();
  if (data.admins.find(a => a.username === username)) return res.status(400).json({ error: 'มี Admin นี้แล้ว' });
  data.admins.push({ username, password });
  saveUsers(data);
  res.json({ message: 'เพิ่ม Admin แล้ว' });
});

app.delete('/api/admin/cleanup', adminMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteOlderThan(7);
    res.json({ deleted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FALLBACK ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  loadUsers();
  console.log(`\n⛽  PumpSKTC running → http://localhost:${PORT}`);
  console.log(`🛡️  Admin panel   → http://localhost:${PORT}/admin.html\n`);
});
