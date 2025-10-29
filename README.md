# Xbox Teleop Node.js Server


This service receives Xbox controller input from a Python script and rebroadcasts it to connected WebSocket clients. It also provides an HTTP POST endpoint for publishing events if WebSockets aren't convenient from Python.


- **WebSocket endpoint**: `ws://<host>/ws`
- **HTTP POST endpoint**: `POST https://<host>/api/xbox`
- **Health check**: `GET https://<host>/_health`


## Quick start (local)


```bash
# 1) Install deps
npm ci


# 2) Copy env
cp .env.example .env
# Edit .env and set API_KEY to a strong secret


# 3) Run
npm start
# Server listens on PORT (default 3000)
