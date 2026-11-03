const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const arrivals = [];

app.post('/api/arrivals', (req, res) => {
  const arrival = { id: arrivals.length + 1, ...req.body, status: 'afventer' };
  arrivals.push(arrival);
  res.json({ besked: 'Tak. Personalet sender jer en dørkode på SMS.' });
});

app.get('/api/arrivals', (req, res) => {
  res.json(arrivals);
});

app.listen(3000, () => console.log('Kører på http://localhost:3000'));