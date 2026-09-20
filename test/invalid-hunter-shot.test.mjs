import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = 'ws://localhost:5173/ws';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const connect = () => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const sockets = await Promise.all(Array.from({ length: 9 }, connect));
const events = sockets.map(() => []);
sockets.forEach((socket, index) => socket.on('message', (raw) => events[index].push(JSON.parse(raw))));

try {
  sockets[0].send(JSON.stringify({
    type: 'create_room',
    moderator: 'host',
    maxPlayers: 9,
    player: { id: 'hunter-host', name: 'Host' }
  }));
  await wait(200);
  const created = events[0].find((event) => event.type === 'room_state');
  assert.ok(created, 'room_state wajib muncul saat create_room');
  const code = created.room.code;

  for (let index = 1; index < sockets.length; index += 1) {
    sockets[index].send(JSON.stringify({
      type: 'join_room',
      code,
      player: { id: `hunter-player-${index}`, name: `P${index}` }
    }));
  }
  await wait(300);

  sockets[0].send(JSON.stringify({ type: 'start_room' }));
  await wait(500);

  const hunterSocketIndex = events.findIndex((socketEvents) =>
    socketEvents.some((event) => event.type === 'role_assigned' && event.role?.name?.includes('Hunter'))
  );
  assert.notEqual(hunterSocketIndex, -1, 'harus ada setidaknya satu Hunter untuk menguji tembakan invalid');

  const hunterSocket = sockets[hunterSocketIndex];
  hunterSocket.send(JSON.stringify({ type: 'hunter_shot', targetId: 'not-a-real-player' }));
  await wait(150);

  const errorEvent = events[hunterSocketIndex].find((event) => event.type === 'room_error');
  assert.ok(errorEvent, 'tembakan Hunter ke target invalid harus ditolak dengan room_error');
  assert.equal(errorEvent.message, 'Kamu tidak sedang menunggu tembakan.');
  console.log('invalid hunter shot test passed');
} finally {
  sockets.forEach((socket) => socket.close());
}
