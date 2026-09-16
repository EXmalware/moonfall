import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = process.env.MOONFALL_WS_URL || 'ws://localhost:5173/ws';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const connect = () => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const sockets = await Promise.all(Array.from({ length: 7 }, connect));
const events = sockets.map(() => []);
sockets.forEach((socket, index) => socket.on('message', (raw) => events[index].push(JSON.parse(raw))));

try {
  sockets[0].send(JSON.stringify({ type: 'create_room', moderator: 'player', maxPlayers: 6, player: { id: 'smoke-host', name: 'Host' } }));
  await wait(100);
  const created = events[0].find((event) => event.type === 'room_state');
  assert.ok(created, 'room_state harus diterima setelah create_room');
  const code = created.room.code;
  const session = events[0].find((event) => event.type === 'session');
  assert.ok(session?.sessionToken, 'session token harus dikirim hanya ke pemilik sesi');

  for (let index = 1; index < sockets.length; index += 1) {
    sockets[index].send(JSON.stringify({ type: 'join_room', code, player: { id: `smoke-player-${index}`, name: `P${index}` } }));
    await wait(40);
  }

  sockets[0].send(JSON.stringify({ type: 'start_room' }));
  await wait(80);
  assert.ok(events[0].some((event) => event.type === 'room_error'), 'host harus ditolak saat moderator adalah pemain');

  sockets[1].send(JSON.stringify({ type: 'start_room' }));
  await wait(120);
  const started = events[1].filter((event) => event.type === 'room_state').at(-1);
  assert.equal(started.room.phase, 'malam');
  assert.equal(started.room.round, 1);
  assert.ok(started.room.phaseEndsAt > Date.now(), 'timer fase harus berasal dari server');
  assert.equal(events.slice(1).flat().filter((event) => event.type === 'role_assigned').length, 4);

  sockets[6].send(JSON.stringify({ type: 'join_room', code, player: { id: 'late-player', name: 'Late' } }));
  await wait(60);
  assert.ok(events[6].some((event) => event.type === 'room_error' && event.message === 'Room sudah memulai permainan.'));

  sockets[6].send(JSON.stringify({ type: 'create_room', player: { name: 'Missing ID' } }));
  await wait(60);
  assert.ok(events[6].some((event) => event.type === 'room_error' && event.message === 'Data pemain tidak valid.'));

  sockets[6].send(JSON.stringify({ type: 'reconnect_room', code, playerId: 'smoke-host', sessionToken: 'forged-token' }));
  await wait(60);
  assert.ok(events[6].some((event) => event.type === 'room_error' && event.message === 'Sesi room tidak valid atau sudah berakhir.'));

  sockets[2].send(JSON.stringify({ type: 'set_phase', phase: 'siang' }));
  await wait(80);
  assert.ok(events[2].some((event) => event.type === 'room_error'), 'pemain biasa tidak boleh mengatur fase');

  console.log('server smoke test passed');
} finally {
  sockets.forEach((socket) => socket.close());
}
