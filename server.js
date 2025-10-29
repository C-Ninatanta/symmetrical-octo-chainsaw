import express from 'express';
app.use(express.json({ limit: '256kb' }));
app.use(morgan('tiny'));
app.use(express.static('public'));


// ----- Health -----
app.get('/_health', (req, res) => res.status(200).send('ok'));


// ----- Auth helpers -----
function checkAuthHeader(req) {
const hdr = req.headers['authorization'];
if (!API_KEY) return false; // if server misconfigured, fail closed
if (!hdr) return false;
const [scheme, token] = hdr.split(' ');
return scheme === 'Bearer' && token === API_KEY;
}


function requireAuth(req, res, next) {
if (checkAuthHeader(req)) return next();
return res.status(401).json({ error: 'Unauthorized' });
}


// ----- Schema (validates but passes through unknown fields) -----
const ControllerEvent = z.object({
type: z.string().default('xbox_input'),
timestamp: z.number().or(z.string()).transform(Number),
controller_id: z.string().or(z.number()).optional(),
axes: z.record(z.number()).optional(),
buttons: z.record(z.number()).optional()
}).passthrough();


// ----- In-memory client set -----
const clients = new Set();


// ----- HTTP publish endpoint -----
app.post('/api/xbox', requireAuth, (req, res) => {
try {
const parsed = ControllerEvent.parse(req.body);
const payload = JSON.stringify(parsed);
for (const ws of clients) {
if (ws.readyState === ws.OPEN) ws.send(payload);
}
return res.status(202).json({ status: 'forwarded', ts: Date.now() });
} catch (err) {
return res.status(400).json({ error: 'Invalid payload', details: err?.message });
}
});


// ----- WebSocket server -----
const wss = new WebSocketServer({ server, path: '/ws' });


wss.on('connection', (ws, req) => {
// Basic auth for publishers (browsers usually can't set headers; allow via flag)
const isAuthed = checkAuthHeader(req) || ALLOW_UNAUTH_WS;
ws.isPublisher = false;


clients.add(ws);


ws.on('message', (data, isBinary) => {
try {
if (!isBinary) {
const text = data.toString();
const msg = JSON.parse(text);


// If client sends {action: "auth", token: "..."} authenticate the connection
if (msg?.action === 'auth') {
if (msg?.token && API_KEY && msg.token === API_KEY) {
ws.isPublisher = true;
ws.send(JSON.stringify({ type: 'auth_ok' }));
} else {
ws.send(JSON.stringify({ type: 'auth_failed' }));
}
return;
}


// If posting events over WS, require auth unless explicitly allowed
if (msg?.type && msg.type !== 'ping') {
if (!isAuthed && !ws.isPublisher) {
ws.send(JSON.stringify({ error: 'Unauthorized publish' }));
return;
}
const parsed = ControllerEvent.parse(msg);
const payload = JSON.stringify(parsed);
for (const client of clients) {
if (client !== ws && client.readyState === ws.OPEN) client.send(payload);
}
}
}
} catch (e) {
ws.send(JSON.stringify({ error: 'Bad message', details: e?.message }));
}
});


ws.on('close', () => clients.delete(ws));
});


server.listen(PORT, () => {
console.log(`Server listening on :${PORT}`);
});
