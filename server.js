const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let db;

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

  app.listen(3000, () => console.log('Kører på http://localhost:3000'));
}

app.post('/api/arrivals', async (req, res) => {
  const { name, phone, arrivalTime } = req.body;
  await db.run(
    'INSERT INTO arrivals (name, phone, arrivalTime) VALUES (?, ?, ?)',
    [name, phone, arrivalTime]
  );
  res.json({ besked: 'Tak. Personalet sender jer en dørkode på SMS.' });
});

app.get('/api/arrivals', async (req, res) => {
  const arrivals = await db.all('SELECT * FROM arrivals');
  res.json(arrivals);
});

start();