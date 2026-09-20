import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = 'ws://localhost:5173/ws';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connect = () => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const sockets = await Promise.all(Array.from({ length: 11 }, connect));
const events = sockets.map(() => []);
sockets.forEach((socket, index) => socket.on('message', (raw) => events[index].push(JSON.parse(raw))));

try {
  sockets[0].send(JSON.stringify({
    type: 'create_room',
    moderator: 'host',
    maxPlayers: 11,
    player: { id: 'cupid-host', name: 'Host' }
  }));
  await wait(100);
  const code = events[0].find((event) => event.type === 'room_state')?.room?.code;
  assert.ok(code, 'room harus berhasil dibuat');

  for (let index = 1; index < sockets.length; index += 1) {
    sockets[index].send(JSON.stringify({
      type: 'join_room',
      code,
      player: { id: `cupid-player-${index}`, name: `P${index}` }
    }));
  }
  await wait(150);
  sockets[0].send(JSON.stringify({ type: 'start_room' }));
  await wait(150);

  const cupidIndex = events.findIndex((playerEvents) => playerEvents.some((event) => event.type === 'role_assigned' && event.role?.name === 'Cupid'));
  assert.ok(cupidIndex > 0, 'harus ada pemain Cupid untuk menguji target invalid');
  sockets[cupidIndex].send(JSON.stringify({ type: 'night_action', targetId: 'cupid-host' }));
  await wait(100);

  assert.ok(events[cupidIndex].some((event) => event.type === 'room_error' && event.message === 'Cupid harus memilih dua pemain yang masih hidup.'));
  console.log('invalid cupid target test passed');
} finally {
  sockets.forEach((socket) => socket.close());
}