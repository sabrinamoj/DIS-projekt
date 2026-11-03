require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const twilio = require('twilio');

const app = express();

// Middleware: logger metode, URL, statuskode og responstid
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

let db;
const sessions = new Set();
const AES_KEY = Buffer.from(process.env.AES_KEY, 'hex');
const sms = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// AES: krypterer med nøglen og en tilfældig IV
function krypter(tekst) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
  const krypteret = cipher.update(tekst, 'utf8', 'hex') + cipher.final('hex');
  return iv.toString('hex') + ':' + krypteret;
}

// AES: dekrypterer med den samme nøgle og den gemte IV
function dekrypter(data) {
  const [ivHex, krypteret] = data.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, Buffer.from(ivHex, 'hex'));
  return decipher.update(krypteret, 'hex', 'utf8') + decipher.final('utf8');
}

// Sender dørkoden som SMS via Twilio
async function sendDoerkode(id) {
  try {
    const arrival = await db.get('SELECT phone, doorCode FROM arrivals WHERE id = ?', [id]);
    const kode = dekrypter(arrival.doorCode);
    const nummer = arrival.phone.startsWith('+') ? arrival.phone : '+45' + arrival.phone;

    await sms.messages.create({
      from: process.env.TWILIO_NUMBER,
      to: nummer,
      body: `Velkommen. Jeres dørkode er ${kode}.`
    });
    console.log(`SMS sendt til ${nummer}`);
  } catch (fejl) {
    console.log('SMS fejlede:', fejl.message);
  }
}

async function start() {
  db = await open({ filename: 'database.db', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS arrivals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      arrivalTime TEXT,
      status TEXT DEFAULT 'afventer',
      doorCode TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  const findes = await db.get('SELECT * FROM users WHERE username = ?', ['personale']);
  if (!findes) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['personale', hash]);
  }

  app.listen(3000, () => console.log('Kører på http://localhost:3000'));
}

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
  const arrivals = await db.all('SELECT id, name, phone, arrivalTime, status FROM arrivals');
  res.json(arrivals);
});

app.put('/api/arrivals/:id', kraeverLogin, async (req, res) => {
  const doorCode = crypto.randomInt(1000, 10000).toString();
  await db.run(
    'UPDATE arrivals SET status = ?, doorCode = ? WHERE id = ?',
    ['godkendt', krypter(doorCode), req.params.id]
  );
  res.json({ besked: 'Godkendt' });

  sendDoerkode(req.params.id); // sendes efter svaret, uden await
});

start();