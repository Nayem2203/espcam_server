const express = require('express');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Multer storage for video images
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ========== VIDEO PART ==========
let latestImage = null;

app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file && req.file.buffer) {
    latestImage = req.file.buffer;
    console.log('Image uploaded:', latestImage.length, new Date().toISOString());
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

app.get('/latest', (req, res) => {
  if (latestImage) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': latestImage.length,
      'Cache-Control': 'no-cache'
    });
    res.write(latestImage);
  } else {
    res.status(404).send('No image available');
  }
});

app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache',
  });

  const interval = setInterval(() => {
    if (latestImage) {
      res.write(`--frame\r\n`);
      res.write(`Content-Type: image/jpeg\r\n`);
      res.write(`Content-Length: ${latestImage.length}\r\n\r\n`);
      res.write(latestImage);
      res.write('\r\n');
    }
  }, 100);

  req.on('close', () => clearInterval(interval));
});

// ========== DOOR LOCK ==========
let doorState = "locked";

app.post('/unlock', (req, res) => {
  console.log("Unlock request received at", new Date().toISOString());
  doorState = "unlocked";

  setTimeout(() => {
    doorState = "locked";
    console.log("Door auto-locked");
  }, 5000);

  res.json({ status: "ok", action: "unlock", door: doorState });
});

app.get('/status', (req, res) => {
  res.json({ door: doorState });
});

// ========== HTTP + WebSocket SERVER ==========
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log("Flutter client connected via WS");
  ws.on('close', () => console.log("Flutter client disconnected"));
});

// Broadcast alert to all connected clients
function broadcastAlert(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'alert', message }));
    }
  });
}

// ESP32 POST /alert
app.post('/alert', (req, res) => {
  console.log("Alert received from ESP32 at", new Date().toISOString());
  broadcastAlert("🚨 Push button pressed!");
  res.json({ status: "ok", alert: true });
});

// ========== START SERVER ==========
server.listen(PORT, () => {
  console.log(`HTTP + WebSocket server running on port ${PORT}`);
});
