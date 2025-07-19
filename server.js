const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

let latestImage = null;

app.use(bodyParser.raw({ type: 'image/jpeg', limit: '5mb' }));

// ESP32 uploads image here
app.post('/upload', (req, res) => {
  latestImage = req.body;
  res.sendStatus(200);
});

// Flutter or browser views stream here
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
  });

  const interval = setInterval(() => {
    if (latestImage) {
      res.write('--frame\r\n');
      res.write('Content-Type: image/jpeg\r\n\r\n');
      res.write(latestImage);
      res.write('\r\n');
    }
  }, 200); // 5 fps

  req.on('close', () => {
    clearInterval(interval);
  });
});

app.listen(port, () => {
  console.log(`MJPEG server running on port ${port}`);
});
