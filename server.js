const express = require('express');
const app = express();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, 'latest.jpg')
});
const upload = multer({ storage });

let latestImage = null;

// Upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file) {
    const filePath = path.join(__dirname, 'uploads', 'latest.jpg');
    if (fs.existsSync(filePath)) {
      latestImage = fs.readFileSync(filePath);
      console.log('Image uploaded, size:', latestImage.length);
      res.sendStatus(200);
    } else {
      console.log('Upload failed: File not saved');
      res.sendStatus(500);
    }
  } else {
    console.log('No image uploaded');
    res.sendStatus(400);
  }
});

// Serve latest image
app.get('/latest', (req, res) => {
  const filePath = path.join(__dirname, 'Uploads', 'latest.jpg');
  if (latestImage && fs.existsSync(filePath)) {
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
    const filePath = path.join(__dirname, 'Uploads', 'latest.jpg');
    if (latestImage && fs.existsSync(filePath)) {
      res.write(`--frame\r\n`);
      res.write(`Content-Type: image/jpeg\r\n`);
      res.write(`Content-Length: ${latestImage.length}\r\n\r\n`);
      res.write(latestImage);
      res.write('\r\n');
    } else {
      console.log('No image available for streaming');
    }
  }, 100);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Auto-refresh HTML
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>ESP32-CAM Video Stream</h1>
        <img src="/latest" alt="Video Stream" style="width:100%;">
        <script>
          setInterval(() => {
            document.querySelector('img').src = '/latest?' + new Date().getTime();
          }, 100);
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});