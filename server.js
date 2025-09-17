const express = require('express');
const multer = require('multer');
const cors = require('cors');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

// ========== VIDEO PART ==========
const storage = multer.memoryStorage();
const upload = multer({ storage });
let latestImage = null;

app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file && req.file.buffer) {
    latestImage = req.file.buffer;
    console.log('Image uploaded:', latestImage.length, new Date().toISOString());
    res.sendStatus(200);
  } else res.sendStatus(400);
});

app.get('/latest', (req, res) => {
  if (latestImage) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': latestImage.length,
      'Cache-Control': 'no-cache'
    });
    res.write(latestImage);
  } else res.status(404).send('No image available');
});

// ========== DOOR LOCK ==========
let doorState = "locked";

app.post('/unlock', (req, res) => {
  doorState = "unlocked";
  console.log("Door unlocked");
  setTimeout(() => {
    doorState = "locked";
    console.log("Door auto-locked");
  }, 5000);
  res.json({ status: "ok", door: doorState });
});

app.get('/status', (req, res) => {
  res.json({ door: doorState });
});

// ========== ALERT ENDPOINT ==========
app.post('/alert', (req, res) => {
  const { type, value } = req.body;
  if (!type || !value) return res.status(400).json({ status: "error", message: "type/value required" });

  const alertData = { type, value, timestamp: new Date().toISOString() };
  console.log("Alert received:", alertData);

  // Emit to all connected clients via WebSocket
  io.emit('alert', alertData);

  res.json({ status: "ok", alert: alertData });
});

// ========== SOCKET.IO CONNECTION ==========
io.on('connection', (socket) => {
  console.log("Client connected:", socket.id);

  socket.on('disconnect', () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ========== START SERVER ==========
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
