const express = require('express');
const app = express();
const multer = require('multer');
const cors = require('cors');

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));

// ========================
// 📸 VIDEO STREAMING PART
// ========================

const storage = multer.memoryStorage();
const upload = multer({ storage });

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
      console.log('No image available for /latest');
      res.status(404).send('No image available');
    }
  } catch (err) {
    console.error('Error serving /latest:', err.message);
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
      } else {
        console.log('No image available for streaming');
      }
    } catch (err) {
      console.error('Stream error:', err.message);
    }
  }, 100);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ========================
// 🎤 AUDIO STREAMING PART
// ========================

let audioBuffers = [];
const MAX_BUFFERS = 50;

// ESP32 posts raw audio (PCM/ADPCM) here
app.post('/audio', (req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    if (audioBuffers.length > MAX_BUFFERS) {
      audioBuffers.shift(); // Remove oldest to keep memory low
    }
    audioBuffers.push(buffer);
    res.sendStatus(200);
  });
});

// Browser or app fetches latest audio chunk here
app.get('/latest-audio', (req, res) => {
  if (audioBuffers.length > 0) {
    const buffer = audioBuffers.shift();
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache'
    });
    res.end(buffer);
  } else {
    res.status(204).end(); // No audio yet
  }
});

// ========================
// 🌐 FRONTEND TEST PAGE
// ========================

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>ESP32-CAM Intercom</title>
        <style>
          body {
            margin: 0;
            padding: 10px;
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          h1 {
            font-size: 1.2em;
            margin-bottom: 10px;
          }
          .container {
            width: 100%;
            max-width: 400px;
            text-align: center;
          }
          img {
            width: 100%;
            height: auto;
            max-height: 300px;
            object-fit: contain;
            border: 1px solid #ccc;
          }
          audio {
            width: 100%;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h1>ESP32-CAM Intercom System</h1>
        <div class="container">
          <img src="/latest" alt="Video Stream">
          <audio id="player" autoplay controls></audio>
        </div>
        <script>
          function refreshImage() {
            const img = document.querySelector('img');
            img.src = '/latest?' + new Date().getTime();
            img.onerror = () => {
              setTimeout(refreshImage, 100);
            };
          }

          function fetchAudio() {
            fetch('/latest-audio')
              .then(res => {
                if (res.status === 204) return;
                return res.arrayBuffer();
              })
              .then(data => {
                if (!data) return;
                const blob = new Blob([data], { type: 'audio/raw' });
                const url = URL.createObjectURL(blob);
                const player = document.getElementById('player');
                player.src = url;
              })
              .catch(err => {
                console.error('Audio fetch error', err);
              });
          }

          setInterval(refreshImage, 100);      // video refresh every 100ms
          setInterval(fetchAudio, 500);        // audio chunk every 500ms
          refreshImage();
          fetchAudio();
        </script>
      </body>
    </html>
  `);
});

// ========================
// 🚀 Start Server
// ========================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
