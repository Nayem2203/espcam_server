const express = require('express');
const app = express();
const multer = require('multer');
const cors = require('cors');

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json()); // for JSON API requests

const storage = multer.memoryStorage();
const upload = multer({ storage });

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

// ========== DOOR LOCK CONTROL ==========
let doorState = "locked"; // memory only

app.post('/unlock', (req, res) => {
  console.log("Unlock request received at", new Date().toISOString());
  doorState = "unlocked";

  // TODO: Forward this command to ESP32 via WebSocket/MQTT/HTTP
  // For now just simulate unlock:
  setTimeout(() => {
    doorState = "locked"; // auto lock again after 5s
    console.log("Door auto-locked");
  }, 5000);

  res.json({ status: "ok", action: "unlock", door: doorState });
});

app.get('/status', (req, res) => {
  res.json({ door: doorState });
});

// ========== HTML TEST PAGE ==========
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>ESP32-CAM Intercom</title></head>
      <body>
        <h1>ESP32-CAM Video Stream + Door Lock</h1>
        <img id="video" src="/latest" style="width:100%; max-width:400px;"><br><br>

        <button onclick="unlockDoor()">Unlock Door</button>
        <p id="status">Door: locked</p>

        <script>
          // Video refresh
          setInterval(() => {
            document.getElementById('video').src = '/latest?' + new Date().getTime();
          }, 100);

          // Unlock function
          async function unlockDoor() {
            const res = await fetch('/unlock', { method: 'POST' });
            const data = await res.json();
            document.getElementById('status').innerText = "Door: " + data.door;
          }

          // Poll door status
          setInterval(async () => {
            const res = await fetch('/status');
            const data = await res.json();
            document.getElementById('status').innerText = "Door: " + data.door;
          }, 1000);
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
