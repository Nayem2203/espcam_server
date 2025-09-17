// server.js
// Complete server for ESP32-CAM streaming + home automation events + door control + WebSocket real-time delivery
// NOTE: This implementation uses in-memory storage. For production, replace with a DB (Redis, Postgres, etc).

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// basic rate limit
const limiter = rateLimit({ windowMs: 1000, max: 20 });
app.use(limiter);

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ========== VIDEO PART ==========
let latestImage = null;

app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file && req.file.buffer) {
    latestImage = req.file.buffer;
    console.log('Image uploaded:', latestImage.length, new Date().toISOString());
    // Optionally: notify any connected watchers that a new frame arrived
    broadcastToClients({ type: 'frame', size: latestImage.length, ts: Date.now() }, 'clients');
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
      'Cache-Control': 'no-cache',
    });
    res.write(latestImage);
    res.end();
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

// ========== REAL-TIME: WebSocket SERVER ==========
// We'll accept WebSocket connections for two roles: "app" (Flutter clients) and "esp" (ESP32 devices).
// Clients should connect as: ws://yourserver/ws?role=app&userId=USERID
// ESP should connect as: ws://yourserver/ws?role=esp&espId=ESP_ID

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// In-memory maps:
const apps = new Map(); // userId => Set of ws
const esps = new Map(); // espId => ws
const pendingCommands = new Map(); // espId => [commands while offline]

function sendSafe(ws, payload) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  } catch (e) {
    console.error('sendSafe error', e);
  }
}

function broadcastToClients(payload, target = 'clients') {
  // target: 'clients' -> broadcast to all connected apps
  // or supply a userId to send only to that user
  if (target === 'clients') {
    for (const [userId, set] of apps.entries()) {
      for (const ws of set) sendSafe(ws, payload);
    }
  } else {
    const set = apps.get(target);
    if (set) for (const ws of set) sendSafe(ws, payload);
  }
}

wss.on('connection', (ws, req, meta) => {
  // meta contains the parsed URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const userId = url.searchParams.get('userId');
  const espId = url.searchParams.get('espId');

  console.log('WS connected:', role, userId || espId);

  if (role === 'app' && userId) {
    if (!apps.has(userId)) apps.set(userId, new Set());
    apps.get(userId).add(ws);

    ws.on('message', (msg) => {
      // messages from app can be simple JSON commands
      try {
        const data = JSON.parse(msg);
        // Example: app can send {"action":"ping"} or {"action":"lock","espId":"frontdoor","cmd":"unlock"}
        if (data.action === 'ping') sendSafe(ws, { type: 'pong', ts: Date.now() });
      } catch (e) { /* ignore malformed */ }
    });

    ws.on('close', () => {
      apps.get(userId)?.delete(ws);
      if (apps.get(userId)?.size === 0) apps.delete(userId);
      console.log('App disconnected', userId);
    });

    // Send a welcome message
    sendSafe(ws, { type: 'welcome', role: 'app', userId });
  } else if (role === 'esp' && espId) {
    esps.set(espId, ws);

    // If there were pending commands, send them now
    const queue = pendingCommands.get(espId);
    if (queue && queue.length) {
      for (const cmd of queue) sendSafe(ws, cmd);
      pendingCommands.delete(espId);
    }

    ws.on('message', (msg) => {
      // messages from ESP can be events or status
      try {
        const data = JSON.parse(msg);
        // Example: { type: 'event', event: 'button', ts: 123456, userId: 'u1' }
        if (data.type === 'event' && data.userId) {
          console.log('ESP event', espId, data.event);
          // Forward to connected apps for that user
          broadcastToClients({ type: 'esp_event', espId, ...data }, data.userId);
        }
      } catch (e) {
        console.log('ESP message parse error', e);
      }
    });

    ws.on('close', () => {
      esps.delete(espId);
      console.log('ESP disconnected', espId);
    });

    sendSafe(ws, { type: 'welcome', role: 'esp', espId });
  } else {
    // unknown connection - close
    sendSafe(ws, { error: 'Missing role/userId/espId' });
    ws.close();
  }
});

// Upgrade HTTP -> WS
server.on('upgrade', (req, socket, head) => {
  // Simple path check
  if (req.url && req.url.startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, {});
    });
  } else {
    socket.destroy();
  }
});

// ========== EVENT endpoint ==========
// ESP or other devices can POST events (e.g., doorbell press, gas detected). Server broadcasts to apps (if connected)
// payload: { type: 'button'|'flame'|'gas', espId, userId, data: {...} }
app.post('/event', (req, res) => {
  const payload = req.body;
  if (!payload || !payload.type || !payload.espId) return res.status(400).send('bad event');

  console.log('Event received', payload.type, 'from', payload.espId, new Date().toISOString());

  // Broadcast to apps for that userId (if provided)
  if (payload.userId) {
    broadcastToClients({ type: 'alert', ...payload }, payload.userId);
  } else {
    broadcastToClients({ type: 'alert', ...payload }, 'clients');
  }

  // You can also trigger additional actions here, e.g., call third-party SMS/email
  // sendSmsFallback(...) // implement if you want SMS fallback

  res.json({ ok: true });
});

// ========== DOOR control endpoint ==========
// App calls this endpoint to request lock/unlock. Server forwards command to ESP (if connected) or queues it.
app.post('/door', async (req, res) => {
  // body: { espId: 'frontdoor', cmd: 'unlock'|'lock', userId: 'u1' }
  const { espId, cmd, userId } = req.body;
  if (!espId || !cmd) return res.status(400).send('missing espId or cmd');

  const message = { type: 'command', cmd, ts: Date.now(), issuedBy: userId || 'unknown' };

  // If ESP connected via WS, forward
  const espWs = esps.get(espId);
  if (espWs && espWs.readyState === WebSocket.OPEN) {
    sendSafe(espWs, message);
    console.log('Forwarded command to ESP', espId, cmd);
    // Optionally notify the app(s)
    if (userId) broadcastToClients({ type: 'command_ack', espId, cmd, status: 'sent' }, userId);
    return res.json({ ok: true, forwarded: true });
  }

  // If ESP not connected, try HTTP push if you know its reachable IP (you may store ip mapping)
  // Example: if you stored esp -> lastKnownHttpUrl mapping in memory or DB:
  // if (espLastKnownHttp[espId]) try axios.post(espLastKnownHttp[espId], message)

  // Otherwise queue the command
  if (!pendingCommands.has(espId)) pendingCommands.set(espId, []);
  pendingCommands.get(espId).push(message);
  console.log('ESP offline, queued command for', espId);

  if (userId) broadcastToClients({ type: 'command_ack', espId, cmd, status: 'queued' }, userId);
  res.json({ ok: true, forwarded: false, queued: true });
});

// ======= (Optional) Endpoint for apps to register metadata like phone number/emergency fallback =====
app.post('/registerApp', (req, res) => {
  // body: { userId, phone, email }
  const { userId, phone, email } = req.body;
  if (!userId) return res.status(400).send('need userId');
  // store in DB; here just log and respond
  console.log('Register app meta', userId, phone, email);
  // TODO: replace with DB persistence
  res.json({ ok: true });
});

// ======== Simple health endpoint ========
app.get('/health', (req, res) => res.json({
  ok: true,
  appsConnected: Array.from(apps.keys()).length,
  espsConnected: Array.from(esps.keys()).length
}));

// ========== (Optional) SMS fallback example (commented) ==========
// If you want to send SMS when app isn't connected, use a provider e.g., Twilio.
// const twilio = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
// async function sendSmsFallback(phone, message) {
//   try {
//     const msg = await twilio.messages.create({ body: message, to: phone, from: TWILIO_FROM });
//     console.log('SMS sent', msg.sid);
//   } catch (e) { console.error('SMS failed', e); }
// }

// ========== Start server ==========
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Intercom (Video) available at: http://localhost:${PORT} (or your deployed URL)`);
});
