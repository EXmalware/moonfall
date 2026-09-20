import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = 'ws://localhost:5173/ws';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connect = () => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const sockets = await Promise.all(Array.from({ length: 6 }, connect));
const events = sockets.map(() => []);
sockets.forEach((socket, index) => socket.on('message', (raw) => events[index].push(JSON.parse(raw))));

try {
  sockets[0].send(JSON.stringify({
    type: 'create_room',
    moderator: 'host',
    maxPlayers: 6,
    player: { id: 'phase-host', name: 'Host' }
  }));
  await wait(200);
  const code = events[0].find((event) => event.type === 'room_state')?.room?.code;
  assert.ok(code, 'room harus berhasil dibuat');

  for (let index = 1; index < sockets.length; index += 1) {
    sockets[index].send(JSON.stringify({
      type: 'join_room',
      code,
      player: { id: `phase-player-${index}`, name: `P${index}` }
    }));
  }
  await wait(200);

  sockets[0].send(JSON.stringify({ type: 'start_room' }));
  await wait(200);

  sockets[0].send(JSON.stringify({ type: 'set_phase', phase: 'siang' }));
  sockets[0].send(JSON.stringify({ type: 'set_phase', phase: 'siang' }));
  await wait(200);

  const secondError = events[0].find((event) => event.type === 'room_error' && event.message === 'Fase saat ini sudah aktif.');
  assert.ok(secondError, 'duplikasi fase yang sama harus ditolak dengan room_error yang jelas');
  console.log('phase transition guard test passed');
} finally {
  sockets.forEach((socket) => socket.close());
}
