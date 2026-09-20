import assert from 'node:assert/strict';
import { sanitizeRoomName, DEFAULT_ROOM_NAME } from '../src/room-utils.js';

assert.equal(sanitizeRoomName('   Desa Baru   '), 'Desa Baru');
assert.equal(sanitizeRoomName(''), DEFAULT_ROOM_NAME);
assert.equal(sanitizeRoomName('  '), DEFAULT_ROOM_NAME);
assert.equal(sanitizeRoomName('Nightfall Club'), 'Nightfall Club');

console.log('room-name tests passed');
