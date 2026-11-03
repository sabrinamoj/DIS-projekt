const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

let db;
const sessions = new Set(); // aktive login-nøgler

async function start() {
  db = await open({ filename: 'database.db', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS arrivals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      arrivalTime TEXT,
      status TEXT DEFAULT 'afventer'
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  // Opret en personalebruger første gang (midlertidigt password)
  const findes = await db.get('SELECT * FROM users WHERE username = ?', ['personale']);
  if (!findes) {
    const hash = await bcrypt.hash('hotel123', 10);
    await db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['personale', hash]);
  }

  app.listen(3000, () => console.log('Kører på http://localhost:3000'));
}

// Middleware: tjekker om personalet er logget ind
function kraeverLogin(req, res, next) {
  if (sessions.has(req.cookies.token)) return next();
  res.status(401).json({ besked: 'Ikke logget ind' });
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

  if (user && await bcrypt.compare(password, user.password)) {
    const token = crypto.randomUUID();
    sessions.add(token);
    res.cookie('token', token, { httpOnly: true });
    return res.json({ besked: 'Logget ind' });
  }

  res.status(401).json({ besked: 'Forkert brugernavn eller password' });
});

app.post('/api/arrivals', async (req, res) => {
  const { name, phone, arrivalTime } = req.body;
  await db.run(
    'INSERT INTO arrivals (name, phone, arrivalTime) VALUES (?, ?, ?)',
    [name, phone, arrivalTime]
  );
  res.json({ besked: 'Tak. Personalet sender jer en dørkode på SMS.' });
});

app.get('/api/arrivals', kraeverLogin, async (req, res) => {
  const arrivals = await db.all('SELECT * FROM arrivals');
  res.json(arrivals);
});

app.put('/api/arrivals/:id', kraeverLogin, async (req, res) => {
  await db.run('UPDATE arrivals SET status = ? WHERE id = ?', ['godkendt', req.params.id]);
  res.json({ besked: 'Godkendt' });
});

start();