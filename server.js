import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// DB path configurable (important en prod Docker)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "db.sqlite");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reservations (
  date TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(username) REFERENCES users(username)
);
`);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(path.join(__dirname, "public")));

// Helpers
function setAuthCookie(res, payload) {
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "90d" });
    res.cookie("auth", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 90 * 24 * 60 * 60 * 1000
    });
}

function authMiddleware(req, res, next) {
    const token = req.cookies.auth;
    if (!token) return res.status(401).json({ error: "Non authentifié" });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: "Session invalide" });
    }
}

// Auth
app.post("/api/register-or-login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Pseudo et mot de passe requis" });

    const uname = String(username).trim();
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(uname);

    if (row) {
        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return res.status(401).json({ error: "Mot de passe incorrect" });
        setAuthCookie(res, { id: row.id, username: row.username });
        return res.json({ ok: true, username: row.username });
    } else {
        const hash = await bcrypt.hash(password, 12);
        const info = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(uname, hash);
        setAuthCookie(res, { id: info.lastInsertRowid, username: uname });
        return res.json({ ok: true, username: uname });
    }
});

app.post("/api/logout", (req, res) => {
    res.clearCookie("auth");
    res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
    const token = req.cookies.auth;
    if (!token) return res.json({ user: null });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        res.json({ user: { username: payload.username } });
    } catch {
        res.json({ user: null });
    }
});

// Réservations
app.get("/api/reservations", (req, res) => {
    const { month } = req.query;
    if (!/^\d{4}-\d{2}$/.test(month || "")) return res.status(400).json({ error: "Mois invalide" });
    const start = month + "-01";
    const end = month + "-32";
    const rows = db.prepare("SELECT date, username, description FROM reservations WHERE date >= ? AND date < ?").all(start, end);
    res.json({ reservations: rows });
});

app.post("/api/reserve", authMiddleware, (req, res) => {
    const { date, description } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return res.status(400).json({ error: "Date invalide" });
    try {
        db.prepare("INSERT INTO reservations (date, username, description) VALUES (?, ?, ?)").run(date, req.user.username, description || null);
        res.json({ ok: true });
    } catch {
        res.status(409).json({ error: "Jour déjà réservé" });
    }
});

app.get("/api/reservation/:date", (req, res) => {
    const { date } = req.params;
    const row = db.prepare("SELECT date, username, description FROM reservations WHERE date = ?").get(date);
    res.json({ reservation: row || null });
});

// Annuler sa propre réservation
app.delete("/api/reservation/:date", authMiddleware, (req, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
        return res.status(400).json({ error: "Date invalide" });
    }

    const row = db.prepare("SELECT username FROM reservations WHERE date = ?").get(date);
    if (!row) return res.status(404).json({ error: "Aucune réservation ce jour" });
    if (row.username !== req.user.username) {
        return res.status(403).json({ error: "Vous ne pouvez annuler que votre réservation" });
    }

    db.prepare("DELETE FROM reservations WHERE date = ?").run(date);
    res.json({ ok: true });
});

app.listen(PORT, () => {
    console.log(`PetitDej en écoute sur http://localhost:${PORT}`);
});
