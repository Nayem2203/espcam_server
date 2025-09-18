const express = require('express');
const multer = require('multer');
const cors = require('cors');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ========== VIDEO PART ==========
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

// ========== DOOR LOCK ==========
let doorState = "locked";

app.post('/unlock', (req, res) => {
  console.log("Unlock request received at", new Date().toISOString());
  doorState = "unlocked";

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

// ========== SOCKET.IO ==========
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
  console.log("Client connected:", socket.id);
  socket.on('disconnect', () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ========== START SERVER ==========
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
