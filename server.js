// server.js
// Minimal VR↔Robot relay for Render. Exposes /ping for health checks.
// WebSocket endpoint is the same origin (wss://<your-app>.onrender.com)

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

// Health check (Render uses this if configured)
app.get('/ping', (_req, res) => res.status(200).send('pong'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track one VR and one Robot client (simple, extend as needed)
let vrClient = null;
let robotClient = null;

wss.on('connection', (ws) => {
  console.log('[WS] New connection');

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    // Expect JSON
    let msg;
    try { msg = JSON.parse(data); }
    catch { console.warn('[WS] Non-JSON message ignored'); return; }

    // First, clients should identify
    if (msg.type === 'identify') {
      if (msg.role === 'vr') {
        vrClient = ws; ws.role = 'vr';
        console.log('[WS] VR identified');
        ws.send(JSON.stringify({ type: 'identified', role: 'vr' }));
      } else if (msg.role === 'robot') {
        robotClient = ws; ws.role = 'robot';
        console.log('[WS] Robot identified');
        ws.send(JSON.stringify({ type: 'identified', role: 'robot' }));
      } else {
        console.warn('[WS] Unknown role:', msg.role);
      }
      return;
    }

    // Relay: VR → Robot
    if (msg.type === 'vr_command') {
      if (robotClient && robotClient.readyState === WebSocket.OPEN) {
        robotClient.send(JSON.stringify(msg));
      } else {
        console.warn('[WS] No robot connected; dropping vr_command');
      }
      return;
    }

    // Relay: Robot → VR (status or telemetry back)
    if (msg.type === 'robot_status') {
      if (vrClient && vrClient.readyState === WebSocket.OPEN) {
        vrClient.send(JSON.stringify(msg));
      } else {
        console.warn('[WS] No VR connected; dropping robot_status');
      }
      return;
    }

    console.warn('[WS] Unknown message type:', msg.type);
  });

  ws.on('close', () => {
    console.log('[WS] Connection closed');
    if (ws === vrClient) { vrClient = null; console.log('[WS] VR disconnected'); }
    if (ws === robotClient) { robotClient = null; console.log('[WS] Robot disconnected'); }
  });

  ws.on('error', (err) => console.error('[WS] Error:', err));
});

// Keep-alive / stale-connection cleanup
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { console.log('[WS] Terminating stale connection'); return ws.terminate(); }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

// Render provides PORT via env. Fail fast if missing.
const PORT = process.env.PORT;
if (!PORT) throw new Error('PORT environment variable is not set');

server.listen(PORT, () => console.log(`HTTP+WS listening on ${PORT}`));
