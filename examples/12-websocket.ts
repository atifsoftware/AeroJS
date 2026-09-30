/**
 * @file 12-websocket.ts
 * @description Demonstrates Aero's zero-dependency WebSocket support using node:http upgrade event.
 */

import { Aero } from '../src/index.js';

const app = new Aero({ debug: true });

// HTTP Route
app.get('/', (ctx) => {
  ctx.html(`
    <!DOCTYPE html>
    <html>
      <head><title>Aero WebSocket Demo</title></head>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h1>🚀 Aero WebSocket Realtime Demo</h1>
        <div id="messages" style="border: 1px solid #ccc; height: 200px; overflow-y: scroll; padding: 10px; margin-bottom: 10px;"></div>
        <input id="input" type="text" placeholder="Type a message..." />
        <button onclick="send()">Send</button>

        <script>
          const ws = new WebSocket('ws://' + window.location.host + '/ws');
          const messages = document.getElementById('messages');
          const input = document.getElementById('input');

          ws.onmessage = (event) => {
            const el = document.createElement('div');
            el.textContent = 'Server: ' + event.data;
            messages.appendChild(el);
          };

          function send() {
            if (input.value) {
              ws.send(input.value);
              const el = document.createElement('div');
              el.textContent = 'You: ' + input.value;
              el.style.color = 'blue';
              messages.appendChild(el);
              input.value = '';
            }
          }
        </script>
      </body>
    </html>
  `);
});

// WebSocket Route
app.ws('/ws', (ws, _req) => {
  console.log('⚡ Client connected via WebSocket');
  ws.send({ message: 'Connected to Aero WebSocket server!' });

  ws.on('message', (data) => {
    console.log('Received message from client:', data);
    ws.send({ echo: data, timestamp: new Date().toISOString() });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`⚡ Aero WebSocket server running on http://localhost:${PORT}`);
});
