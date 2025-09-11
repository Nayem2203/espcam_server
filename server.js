const express = require('express');
const app = express();
const multer = require('multer');
const cors = require('cors');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;

// ===== Middleware =====
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ===== VIDEO PART =====
let latestImage = null;

app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (req.file && req.file.buffer) {
      latestImage = req.file.buffer;
      console.log('Image uploaded, size:', latestImage.length, 'at', new Date().toISOString());
      res.sendStatus(200);
    } else {
      console.log('No image uploaded');
      res.sendStatus(400);
    }
  } catch (err) {
    console.error('Upload error:', err.message);
    res.sendStatus(500);
  }
});

app.get('/latest', (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).send('Server error');
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
    try {
      if (latestImage) {
        res.write(`--frame\r\n`);
        res.write(`Content-Type: image/jpeg\r\n`);
        res.write(`Content-Length: ${latestImage.length}\r\n\r\n`);
        res.write(latestImage);
        res.write('\r\n');
      }
    } catch (err) {
      console.error('Stream error:', err.message);
    }
  }, 100);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ===== DOOR LOCK =====
let doorState = "locked";
let alertState = false;

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
  res.json({ door: doorState, alert: alertState });
});

// ===== WEBSOCKET SERVER =====
const wss = new WebSocket.Server({ port: 8080 });
let clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  console.log("Flutter client connected via WebSocket");

  ws.on('close', () => {
    clients = clients.filter(c => c !== ws);
    console.log("Flutter client disconnected");
  });
});

// ===== ALERT ENDPOINT =====
app.post('/alert', (req, res) => {
  console.log("Alert received from ESP32 at", new Date().toISOString());
  alertState = true;

  // Send push to all connected WebSocket clients
  const message = JSON.stringify({ type: "alert", message: "Push button pressed!" });
  clients.forEach(c => c.send(message));

  // Auto clear after 5s
  setTimeout(() => {
    alertState = false;
  }, 5000);

  res.json({ status: "ok", alert: true });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
