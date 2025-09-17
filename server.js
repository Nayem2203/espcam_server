const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

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

// ========== ALERT ENDPOINT (FLAME & GAS) ==========
let latestAlert = null;

app.post('/alert', (req, res) => {
  const { type, value } = req.body; // type = "flame" or "gas"

  if (!type || !value) {
    return res.status(400).json({ status: "error", message: "type and value required" });
  }

  latestAlert = { type, value, timestamp: new Date().toISOString() };
  alertState = true;

  console.log(`Alert received: ${type} detected (value=${value}) at`, latestAlert.timestamp);

  // auto-clear after 5s
  setTimeout(() => { 
    alertState = false;
    latestAlert = null;
  }, 5000);

  // Here you can trigger a push notification via FCM / Pusher / Socket.io
  // Example: sendPushNotification(type, value);

  res.json({ status: "ok", alert: latestAlert });
});

app.get('/latest-alert', (req, res) => {
  if (latestAlert) {
    res.json(latestAlert);
  } else {
    res.status(404).json({ status: "none", message: "No alert active" });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
