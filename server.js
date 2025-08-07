const express = require('express');
const app = express();
const multer = require('multer');
const cors = require('cors');

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));

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

// ========== AUDIO PART ==========
let latestAudio = null;

app.post('/upload-audio', upload.single('audio'), (req, res) => {
  try {
    if (req.file && req.file.buffer) {
      latestAudio = req.file.buffer;
      console.log('Audio uploaded, size:', latestAudio.length, 'at', new Date().toISOString());
      res.sendStatus(200);
    } else {
      console.log('No audio uploaded');
      res.sendStatus(400);
    }
  } catch (err) {
    console.error('Audio upload error:', err.message);
    res.sendStatus(500);
  }
});

app.get('/latest-audio', (req, res) => {
  try {
    if (latestAudio) {
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': latestAudio.length,
        'Cache-Control': 'no-cache'
      });
      res.write(latestAudio);
    } else {
      res.status(404).send('No audio available');
    }
  } catch (err) {
    res.status(500).send('Audio server error');
  }
});

// ========== HTML TEST PAGE ==========
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>ESP32-CAM Video + Audio</title></head>
      <body>
        <h1>ESP32-CAM Video Stream</h1>
        <img id="video" src="/latest" style="width:100%; max-width:400px;"><br>
        <h2>Audio Playback</h2>
        <audio id="audio" controls autoplay></audio>

        <script>
          setInterval(() => {
            document.getElementById('video').src = '/latest?' + new Date().getTime();
          }, 100);

          const audioElement = document.getElementById('audio');
          setInterval(() => {
            fetch('/latest-audio?' + new Date().getTime())
              .then(res => res.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                audioElement.src = url;
              });
          }, 1000); // Play updated audio every second
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
