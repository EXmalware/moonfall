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
    player: { id: 'vote-test-host', name: 'Host' }
  }));
  await wait(150);
  const roomState = events[0].find((event) => event.type === 'room_state');
  assert.ok(roomState, 'room_state harus muncul saat room dibuat');
  const code = roomState.room.code;

  for (let index = 1; index < sockets.length; index += 1) {
    sockets[index].send(JSON.stringify({
      type: 'join_room',
      code,
      player: { id: `vote-test-guest-${index}`, name: `Guest ${index}` }
    }));
  }
  await wait(200);

  sockets[0].send(JSON.stringify({ type: 'start_room' }));
  await wait(200);

  sockets[0].send(JSON.stringify({ type: 'set_phase', phase: 'siang' }));
  await wait(150);

  const voterSocket = sockets[1];
  voterSocket.send(JSON.stringify({ type: 'vote_player', targetId: 'missing-player-id' }));
  await wait(150);

  const errorEvent = events[1].find((event) => event.type === 'room_error');
  assert.ok(errorEvent, 'target vote yang tidak valid harus mendapat room_error');
  assert.equal(errorEvent.message, 'Target vote tidak valid.');
  console.log('invalid vote target test passed');
} finally {
  sockets.forEach((socket) => socket.close());
}
