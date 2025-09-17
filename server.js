const express = require("express");
const multer = require("multer");
const cors = require("cors");
const WebSocket = require("ws");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.static("public"));

// ========== VIDEO PART ==========
const storage = multer.memoryStorage();
const upload = multer({ storage });

let latestImage = null;

app.post("/upload", upload.single("image"), (req, res) => {
  try {
    if (req.file && req.file.buffer) {
      latestImage = req.file.buffer;
      console.log(
        "Image uploaded, size:",
        latestImage.length,
        "at",
        new Date().toISOString()
      );
      res.sendStatus(200);
    } else {
      console.log("No image uploaded");
      res.sendStatus(400);
    }
  } catch (err) {
    console.error("Upload error:", err.message);
    res.sendStatus(500);
  }
});

app.get("/latest", (req, res) => {
  try {
    if (latestImage) {
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": latestImage.length,
        "Cache-Control": "no-cache",
      });
      res.write(latestImage);
    } else {
      res.status(404).send("No image available");
    }
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    Connection: "close",
    Pragma: "no-cache",
  });

  const interval = setInterval(() => {
    try {
      if (latestImage) {
        res.write(`--frame\r\n`);
        res.write(`Content-Type: image/jpeg\r\n`);
        res.write(`Content-Length: ${latestImage.length}\r\n\r\n`);
        res.write(latestImage);
        res.write("\r\n");
      }
    } catch (err) {
      console.error("Stream error:", err.message);
    }
  }, 100);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// ========== ALERT + DOOR LOCK PART ==========
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

wss.on("connection", (ws) => {
  console.log("Flutter app connected via WebSocket");
  clients.push(ws);

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

// Helper: broadcast events to all WebSocket clients
function broadcast(event, data) {
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  });
}

// ESP32 sends alerts
app.post("/alert/:type", (req, res) => {
  const type = req.params.type; // button, flame, gas
  console.log(`Alert received: ${type}`);
  broadcast("alert", type);
  res.json({ status: "ok", type });
});

// Flutter sends door unlock command
app.post("/unlock", (req, res) => {
  console.log("Unlock requested from Flutter");
  broadcast("unlock", true);
  res.json({ status: "door unlock triggered" });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
