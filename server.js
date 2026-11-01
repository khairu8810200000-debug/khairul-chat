require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "chat.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'member',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 username TEXT NOT NULL,
 display_name TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);
const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
if (!process.env.SESSION_SECRET || !adminPassword || adminPassword.length < 12) {
  console.error("Sila tetapkan SESSION_SECRET dan ADMIN_PASSWORD (minimum 12 aksara) dalam .env.");
  process.exit(1);
}
const existingAdmin = db.prepare("SELECT id FROM users WHERE username=?").get(adminUsername);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare("INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,'admin')")
    .run(adminUsername, "Admin", hash);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
const SQLiteStore = SQLiteStoreFactory(session);
const sessionMiddleware = session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id,username,display_name,role,active FROM users WHERE id=?").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user || !user.active) return res.status(401).json({ error: "Sila log masuk semula." });
  req.user = user; next();
}
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Akses admin sahaja." });
  next();
}
function cleanText(v, max=1000) {
  return typeof v === "string" ? v.trim().slice(0,max) : "";
}

app.post("/api/login", loginLimiter, async (req,res) => {
  const username = cleanText(req.body.username,40).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(username);
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Nama pengguna atau kata laluan salah."});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Tidak dapat log masuk."});
    req.session.userId = user.id;
    res.json({ user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role} });
  });
});
app.post("/api/logout", (req,res) => req.session.destroy(() => res.json({ok:true})));
app.get("/api/me", requireAuth, (req,res) => res.json({user:{id:req.user.id,username:req.user.username,displayName:req.user.display_name,role:req.user.role}}));
app.get("/api/messages", requireAuth, (req,res) => {
  const rows = db.prepare("SELECT id,user_id AS userId,username,display_name AS displayName,body,created_at AS createdAt FROM messages ORDER BY id DESC LIMIT 100").all().reverse();
  res.json({messages:rows});
});
app.post("/api/messages", requireAuth, (req,res) => {
  const body = cleanText(req.body.body,1000);
  if (!body) return res.status(400).json({error:"Mesej tidak boleh kosong."});
  const info = db.prepare("INSERT INTO messages(user_id,username,display_name,body) VALUES(?,?,?,?)")
    .run(req.user.id,req.user.username,req.user.display_name,body);
  const message = db.prepare("SELECT id,user_id AS userId,username,display_name AS displayName,body,created_at AS createdAt FROM messages WHERE id=?").get(info.lastInsertRowid);
  io.emit("new-message",message);
  res.json({message});
});
app.get("/api/members", requireAuth, requireAdmin, (req,res) => {
  const members = db.prepare("SELECT id,username,display_name AS displayName,active,created_at AS createdAt FROM users WHERE role='member' ORDER BY id DESC").all();
  res.json({members});
});
app.post("/api/members", requireAuth, requireAdmin, async (req,res) => {
  const username = cleanText(req.body.username,40).toLowerCase();
  const displayName = cleanText(req.body.displayName,60);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({error:"Username: 3-40 aksara, huruf kecil/nombor/._- sahaja."});
  if (!displayName) return res.status(400).json({error:"Nama ahli diperlukan."});
  if (password.length < 8) return res.status(400).json({error:"Kata laluan ahli minimum 8 aksara."});
  try {
    const hash = await bcrypt.hash(password,12);
    db.prepare("INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,'member')").run(username,displayName,hash);
    res.json({ok:true});
  } catch(e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({error:"Username sudah digunakan."});
    res.status(500).json({error:"Gagal menambah ahli."});
  }
});
app.patch("/api/members/:id", requireAuth, requireAdmin, (req,res) => {
  const id = Number(req.params.id);
  const active = req.body.active === true ? 1 : req.body.active === false ? 0 : null;
  if (!Number.isInteger(id) || active === null) return res.status(400).json({error:"Permintaan tidak sah."});
  db.prepare("UPDATE users SET active=? WHERE id=? AND role='member'").run(active,id);
  res.json({ok:true});
});
app.delete("/api/members/:id", requireAuth, requireAdmin, (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({error:"ID tidak sah."});
  db.prepare("DELETE FROM users WHERE id=? AND role='member'").run(id);
  res.json({ok:true});
});

io.engine.use(sessionMiddleware);
io.use((socket,next) => {
  const userId = socket.request.session?.userId;
  const user = userId ? db.prepare("SELECT id,username,display_name,role,active FROM users WHERE id=?").get(userId) : null;
  if (!user || !user.active) return next(new Error("Sila log masuk."));
  socket.user = user; next();
});
io.on("connection", socket => {
  socket.emit("connected", {ok:true});
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
server.listen(PORT, () => console.log(`Khairul Chat berjalan di http://localhost:${PORT}`));
