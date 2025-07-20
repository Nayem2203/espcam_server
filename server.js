const express = require('express');
const app = express();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Use environment port
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));

// Store uploaded image on disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, 'latest.jpg')
});
const upload = multer({ storage });

let latestImage = null;

// Upload endpoint with logging
app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file) {
    latestImage = fs.readFileSync(path.join(__dirname, 'Uploads', 'latest.jpg'));
    console.log('Image uploaded, size:', latestImage.length);
    res.sendStatus(200);
  } else {
    console.log('No image uploaded');
    res.sendStatus(400);
  }
});

// Serve latest image as JPEG
app.get('/latest', (req, res) => {
  if (latestImage) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': latestImage.length
    });
    res.write(latestImage);
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
    } else {
      console.log('No image available for streaming');
    }
  }, 100); // 100ms for smoother streaming (~10 fps)

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Serve HTML for auto-refreshing stream
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>ESP32-CAM Video Stream</h1>
        <img src="/latest" alt="Video Stream" style="width:100%;">
        <script>
          setInterval(() => {
            document.querySelector('img').src = '/latest?' + new Date().getTime();
          }, 100); // Refresh every 100ms
        </script>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});