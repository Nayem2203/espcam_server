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

// ESP32 uploads images
app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file && req.file.buffer) {
    latestImage = req.file.buffer;
    console.log('Image uploaded:', latestImage.length, new Date().toISOString());
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

// Get latest snapshot
app.get('/latest', (req, res) => {
  if (latestImage) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': latestImage.length,
      'Cache-Control': 'no-cache',
    });
    res.write(latestImage);
    res.end();
  } else {
    res.status(404).send('No image available');
  }
});

// MJPEG stream
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

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Intercom (Video) available at: https://espcam-server.onrender.com`);
});
