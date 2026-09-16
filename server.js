import http from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';

const port = Number(process.env.PORT || 5173);
const rooms = new Map();
const persistenceFile = 'rooms.json';
const phaseDurations = { malam: 120000, siang: 180000 };

function persistRooms() {
  const data = [...rooms.values()].map((room) => ({
    ...room,
    players: [...room.players.values()].map(({ socket, disconnectTimer, ...player }) => ({ ...player, socket: null })),
    roles: [...(room.roles || new Map()).entries()],
    votes: [...room.votes.entries()].map(([targetId, voterIds]) => [targetId, [...voterIds]]),
    nightActions: [...room.nightActions.entries()],
    witchPotions: [...(room.witchPotions || new Map()).entries()],
  }));
  writeFileSync(persistenceFile, JSON.stringify(data, null, 2));
}

function loadRooms() {
  if (!existsSync(persistenceFile)) return;
  try {
    const data = JSON.parse(readFileSync(persistenceFile, 'utf8'));
    for (const saved of data) {
      const room = { ...saved, players: new Map(), roles: new Map(saved.roles || []), votes: new Map((saved.votes || []).map(([id, voters]) => [id, new Set(voters)])), nightActions: new Map(saved.nightActions || []), witchPotions: new Map(saved.witchPotions || []) };
      if (room.phase !== 'lobi' && !room.phaseEndsAt) room.phaseEndsAt = Date.now() + (phaseDurations[room.phase] || phaseDurations.malam);
      for (const player of saved.players || []) room.players.set(player.id, { ...player, socket: null });
      rooms.set(room.code, room);
    }
  } catch (error) { console.error('Gagal memuat rooms.json:', error.message); }
}

loadRooms();
setInterval(persistRooms, 2000);
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phaseEndsAt && room.phase !== 'lobi' && room.phaseEndsAt <= now && !room.winner) transitionPhase(room, room.phase === 'malam' ? 'siang' : 'malam');
  }
}, 1000);

const roleTemplates = [
  ['Werewolf', '☾', 'KELOMPOK JAHAT', 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', 'Pilih target serangan bersama kelompokmu.'],
  ['Werewolf', '☾', 'KELOMPOK JAHAT', 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', 'Pilih target serangan bersama kelompokmu.'],
  ['Werewolf', '☾', 'KELOMPOK JAHAT', 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', 'Pilih target serangan bersama kelompokmu.'],
  ['Werewolf', '☾', 'KELOMPOK JAHAT', 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', 'Pilih target serangan bersama kelompokmu.'],
  ['Werewolf', '☾', 'KELOMPOK JAHAT', 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', 'Pilih target serangan bersama kelompokmu.'],
  ['Werewolf', '☾', 'KELOMPOK JAHAT', 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', 'Pilih target serangan bersama kelompokmu.'],
  ['Alpha Werewolf', '◐', 'KELOMPOK JAHAT', 'Pemimpin Werewolf dengan suara penentu jika kelompok tidak sepakat.', 'Pimpin pilihan target Werewolf malam ini.'],
  ['Sorceress / Antek Werewolf', '✧', 'KELOMPOK JAHAT', 'Berpihak pada Werewolf dan menebak siapa yang menjadi Seer.', 'Cari Seer secara diam-diam.'],
  ['Pelihat / Seer', '◉', 'KELOMPOK BAIK', 'Setiap malam, cek apakah satu pemain adalah Werewolf atau bukan.', 'Terawang satu pemain malam ini.'],
  ['Pelindung / Bodyguard', '✚', 'KELOMPOK BAIK', 'Melindungi satu pemain dari serangan Werewolf dan tidak boleh memilih orang yang sama dua malam berturut-turut.', 'Lindungi satu pemain malam ini.'],
  ['Dokter / Doctor', '⚕', 'KELOMPOK BAIK', 'Memilih satu pemain untuk diselamatkan dari serangan Werewolf.', 'Pilih satu pemain untuk diselamatkan.'],
  ['Pemburu / Hunter', '⌁', 'KELOMPOK BAIK', 'Jika tereliminasi, dapat menembak satu pemain lain untuk ikut gugur.', 'Tidak memiliki aksi malam.'],
  ['Penyihir / Witch', '⚗', 'KELOMPOK BAIK', 'Memiliki satu ramuan penyembuh dan satu ramuan racun selama permainan.', 'Gunakan ramuan jika tersedia.'],
  ['Cupid', '♡', 'KELOMPOK BAIK', 'Pada malam pertama, pasangkan dua pemain yang saling terikat.', 'Pasangkan dua pemain pada malam pertama.'],
  ['Mayor / Wali Kota', '♛', 'KELOMPOK BAIK', 'Suara voting siang hari bernilai dua.', 'Gunakan suara ganda dengan bijak.'],
  ['Tanner / Jester', '☹', 'KELOMPOK NETRAL', 'Menang jika berhasil dikeluarkan melalui voting warga desa.', 'Buat warga desa mencurigaimu.'],
];

function assignRoles(playerCount) {
  const roleByName = (name) => roleTemplates.find(([roleName]) => roleName === name);
  const werewolfCount = Math.max(1, Math.floor(playerCount / 4));
  const selectedNames = [
    ...Array.from({ length: werewolfCount }, () => 'Werewolf'),
    ...(playerCount >= 10 ? ['Alpha Werewolf'] : []),
    'Pelihat / Seer',
    'Pelindung / Bodyguard',
    ...(playerCount >= 8 ? ['Pemburu / Hunter', 'Tanner / Jester'] : []),
    ...(playerCount >= 10 ? ['Dokter / Doctor', 'Penyihir / Witch', 'Cupid'] : []),
    ...(playerCount >= 12 ? ['Sorceress / Antek Werewolf', 'Mayor / Wali Kota'] : []),
  ];
  const pool = selectedNames.slice(0, playerCount).map(roleByName);
  const villager = ['Warga Desa', '✦', 'KELOMPOK BAIK', 'Tidak memiliki kekuatan khusus, tetapi memiliki hak suara penuh saat diskusi dan voting siang hari.', 'Gunakan diskusi dan voting untuk mencari Werewolf.'];
  while (pool.length < playerCount) pool.push(villager);
  return pool.sort(() => Math.random() - 0.5).slice(0, playerCount).map(([name, symbol, faction, description, action]) => ({ name, symbol, faction, description, action }));
}

function resolveNight(room) {
  const poison = [...room.nightActions.values()].find((action) => action.action === 'Witch:poison');
  if (poison?.targetId && room.players.has(poison.targetId)) {
    const poisoned = room.players.get(poison.targetId);
    poisoned.alive = false;
    applyCupid(room, poisoned.id);
    if (room.roles.get(poisoned.id)?.name.includes('Hunter')) {
      room.pendingHunter = poisoned.id;
      send(poisoned.socket, { type: 'hunter_revenge', message: 'Kamu tereliminasi. Pilih satu pemain untuk ditembak.' });
    }
  }
  const attacks = [...room.nightActions.entries()].filter(([, action]) => action.role === 'Werewolf' || action.role === 'Alpha Werewolf');
  if (!attacks.length) return 'Malam berlalu tanpa korban.';
  const attackTotals = new Map();
  for (const [, action] of attacks) {
    if (!action.targetId || !room.players.has(action.targetId)) continue;
    attackTotals.set(action.targetId, (attackTotals.get(action.targetId) || 0) + 1);
  }
  const highestAttack = Math.max(0, ...attackTotals.values());
  const attackCandidates = [...attackTotals.entries()].filter(([, count]) => count === highestAttack).map(([targetId]) => targetId);
  const alphaTarget = attacks.find(([, action]) => action.role === 'Alpha Werewolf')?.[1]?.targetId;
  const attackTargetId = attackCandidates.includes(alphaTarget) ? alphaTarget : attackCandidates[0];
  if (!attackTargetId) return 'Malam berlalu tanpa korban.';
  const protectedTargets = new Set([...room.nightActions.values()].filter((action) => action.role.includes('Bodyguard') || action.role.includes('Doctor') || action.action === 'Witch:heal').map((action) => action.targetId));
  const target = room.players.get(attackTargetId);
  if (!target) return 'Malam berlalu tanpa korban.';
  if (protectedTargets.has(attackTargetId)) return `${target.alias} selamat dari serangan malam.`;
  target.alive = false;
  applyCupid(room, target.id);
  if (room.roles.get(target.id)?.name.includes('Hunter')) {
    room.pendingHunter = target.id;
    send(target.socket, { type: 'hunter_revenge', message: 'Kamu tereliminasi. Pilih satu pemain untuk ditembak.' });
  }
  return `${target.alias} tereliminasi pada malam hari.`;
}

function applyCupid(room, deadId) {
  if (!room.cupidPair?.includes(deadId)) return null;
  const partnerId = room.cupidPair.find((id) => id !== deadId);
  const partner = room.players.get(partnerId);
  if (!partner || partner.alive === false) return null;
  partner.alive = false;
  return partner.alias;
}

function checkWinner(room) {
  if (room.tannerWinner) return 'TANNER';
  const alive = [...room.players.values()].filter((player) => player.alive !== false);
  const evil = alive.filter((player) => ['Werewolf', 'Alpha Werewolf'].includes(room.roles.get(player.id)?.name));
  const villagers = alive.filter((player) => room.roles.get(player.id)?.faction === 'KELOMPOK BAIK');
  if (evil.length === 0) return 'WARGA';
  if (evil.length >= villagers.length) return 'WEREWOLF';
  return '';
}

function transitionPhase(room, nextPhase) {
  if (room.winner || room.phase === nextPhase || !['siang', 'malam'].includes(nextPhase)) return;
  if (nextPhase === 'malam' && room.phase === 'siang') room.nightResult = resolveVoting(room);
  if (nextPhase === 'siang' && room.phase === 'malam') room.nightResult = resolveNight(room);
  if (nextPhase === 'malam') {
    const bodyguardAction = [...room.nightActions.entries()].find(([, action]) => action.role.includes('Bodyguard'));
    room.previousBodyguardTarget = bodyguardAction?.[1]?.targetId || null;
    room.nightActions.clear();
    room.nightResult = '';
    room.round = (room.round || 0) + 1;
  }
  room.phase = nextPhase;
  room.phaseEndsAt = Date.now() + phaseDurations[nextPhase];
  room.winner = checkWinner(room);
  if (nextPhase === 'siang') room.votes.clear();
  broadcast(room);
}

function resolveVoting(room) {
  const totals = new Map();
  for (const [targetId, voterIds] of room.votes.entries()) {
    if (room.players.get(targetId)?.alive === false) continue;
    const total = [...voterIds].reduce((sum, voterId) => sum + (room.roles.get(voterId)?.name === 'Mayor / Wali Kota' ? 2 : 1), 0);
    totals.set(targetId, total);
  }
  const highest = Math.max(0, ...totals.values());
  const targets = [...totals.entries()].filter(([, count]) => count === highest);
  if (!highest || targets.length !== 1) return 'Voting berakhir seri. Tidak ada pemain yang tereliminasi.';
  const [targetId] = targets[0];
  const target = room.players.get(targetId);
  target.alive = false;
  if (room.roles.get(target.id)?.name.includes('Tanner')) room.tannerWinner = true;
  applyCupid(room, target.id);
  if (room.roles.get(target.id)?.name.includes('Hunter')) {
    room.pendingHunter = target.id;
    send(target.socket, { type: 'hunter_revenge', message: 'Kamu tereliminasi. Pilih satu pemain untuk ditembak.' });
  }
  return `${target.alias} tereliminasi melalui voting siang.`;
}

function createCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 8).toUpperCase();
  while (rooms.has(code));
  return code;
}

function send(socket, payload) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(payload));
}

function broadcast(room) {
  const players = [...room.players.values()].map(({ socket, disconnectTimer, ...player }) => ({ ...player, connected: Boolean(socket) }));
  const voteState = [...room.votes.entries()].map(([targetId, voterIds]) => ({ targetId, targetAlias: room.players.get(targetId)?.alias || 'Pemain keluar', count: voterIds.size }));
  const payload = JSON.stringify({ type: 'room_state', room: { code: room.code, name: room.name, moderator: room.moderator, moderatorId: room.moderatorId, hostId: room.hostId, maxPlayers: room.maxPlayers, phase: room.phase, round: room.round || 0, phaseEndsAt: room.phaseEndsAt || null, players, chatMessages: room.chatMessages, voteState, nightResult: room.nightResult || '', winner: room.winner || '' } });
  for (const player of room.players.values()) {
    if (player.socket?.readyState === 1) player.socket.send(payload);
  }
}

const vite = await createViteServer({ server: { middlewareMode: true, allowedHosts: ['.ngrok-free.dev', '.ngrok.app'] } });
const httpServer = http.createServer((request, response) => vite.middlewares.handle(request, response));
const websocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });

websocketServer.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'create_room') {
      const code = createCode();
      const room = { code, name: message.name || 'Desa Cahaya Bulan', moderator: message.moderator || 'host', moderatorId: message.moderator === 'player' ? null : message.player.id, hostId: message.player.id, maxPlayers: Math.min(40, Math.max(6, Number(message.maxPlayers) || 15)), phase: 'lobi', round: 0, chatMessages: [], votes: new Map(), nightActions: new Map(), previousBodyguardTarget: null, witchPotions: new Map(), pendingHunter: null, cupidPair: null, players: new Map() };
      room.players.set(message.player.id, { ...message.player, alias: 'Warga #1', alive: true, status: 'Host', socket });
      rooms.set(code, room);
      console.log(`Room ${code} dibuat oleh ${message.player.name}`);
      socket.roomCode = code;
      socket.playerId = message.player.id;
      broadcast(room);
      return;
    }

    if (message.type === 'reconnect_room') {
      const room = rooms.get(String(message.code || '').toUpperCase());
      const player = room?.players.get(message.playerId);
      if (!room || !player) return send(socket, { type: 'room_error', message: 'Sesi room sudah berakhir.' });
      if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
      player.socket = socket;
      socket.roomCode = room.code;
      socket.playerId = message.playerId;
      broadcast(room);
      return;
    }

    if (message.type === 'start_room') {
      const room = rooms.get(socket.roomCode);
      if (!room) return send(socket, { type: 'room_error', message: 'Room tidak ditemukan.' });
      const canModerate = room.moderator === 'host' ? socket.playerId === room.hostId : socket.playerId === room.moderatorId;
      if (!canModerate) return send(socket, { type: 'room_error', message: 'Hanya moderator yang dapat memulai permainan.' });
      if (room.players.size < 6) return send(socket, { type: 'room_error', message: 'Minimal 6 pemain diperlukan untuk memulai permainan.' });
      if (room.phase !== 'lobi') return send(socket, { type: 'room_error', message: 'Permainan sudah dimulai.' });
      room.phase = 'malam';
      room.round = 1;
      room.phaseEndsAt = Date.now() + phaseDurations.malam;
      const players = [...room.players.values()].filter((player) => player.id !== room.hostId);
      const assignedRoles = assignRoles(players.length);
      room.roles = new Map(players.map((player, index) => [player.id, assignedRoles[index]]));
      for (const player of players) if (assignedRoles[players.indexOf(player)]?.name.includes('Witch')) room.witchPotions.set(player.id, { heal: true, poison: true });
      broadcast(room);
      for (const player of players) send(player.socket, { type: 'role_assigned', role: room.roles.get(player.id) });
      const payload = JSON.stringify({ type: 'game_started' });
      for (const player of room.players.values()) send(player.socket, { type: 'game_started' });
      return;
    }

    if (message.type === 'set_phase') {
      const room = rooms.get(socket.roomCode);
      if (!room) return send(socket, { type: 'room_error', message: 'Room tidak ditemukan.' });
      const canModerate = room.moderator === 'host' ? socket.playerId === room.hostId : socket.playerId === room.moderatorId;
      if (!canModerate) return send(socket, { type: 'room_error', message: 'Hanya moderator yang dapat mengatur fase.' });
      if (!['siang', 'malam'].includes(message.phase)) return;
      if (room.winner) return send(socket, { type: 'room_error', message: 'Permainan sudah selesai.' });
      if (room.phase === message.phase || (room.phase === 'lobi' && message.phase === 'siang')) return;
      transitionPhase(room, message.phase);
      return;
    }

    if (message.type === 'vote_player') {
      const room = rooms.get(socket.roomCode);
      if (!room || room.phase !== 'siang' || room.winner) return send(socket, { type: 'room_error', message: 'Voting hanya tersedia saat siang.' });
      if (!room.players.has(socket.playerId) || !room.roles.has(message.targetId) || room.players.get(socket.playerId).alive === false || room.players.get(message.targetId).alive === false) return;
      for (const voterIds of room.votes.values()) voterIds.delete(socket.playerId);
      if (!room.votes.has(message.targetId)) room.votes.set(message.targetId, new Set());
      room.votes.get(message.targetId).add(socket.playerId);
      broadcast(room);
      return;
    }

    if (message.type === 'hunter_shot') {
      const room = rooms.get(socket.roomCode);
      if (!room || room.pendingHunter !== socket.playerId || !room.roles.has(message.targetId)) return;
      const target = room.players.get(message.targetId);
      if (target.alive === false) return;
      target.alive = false;
      applyCupid(room, target.id);
      room.pendingHunter = null;
      room.nightResult = `${target.alias} ditembak oleh Pemburu.`;
      room.winner = checkWinner(room);
      broadcast(room);
      return;
    }

    if (message.type === 'chat_message') {
      const room = rooms.get(socket.roomCode);
      if (!room || room.phase !== 'siang') return send(socket, { type: 'room_error', message: 'Chat diskusi hanya tersedia saat siang.' });
      const text = String(message.text || '').trim().slice(0, 500);
      if (!text || !room.players.has(socket.playerId) || room.players.get(socket.playerId).alive === false) return;
      const player = room.players.get(socket.playerId);
      room.chatMessages.push({ id: `${Date.now()}-${Math.random()}`, alias: player.alias, text });
      room.chatMessages = room.chatMessages.slice(-100);
      broadcast(room);
      return;
    }

    if (message.type === 'role_chat') {
      const room = rooms.get(socket.roomCode);
      const role = room?.roles?.get(socket.playerId);
      if (!room || room.phase !== 'malam' || !role || role.faction !== 'KELOMPOK JAHAT' || room.players.get(socket.playerId)?.alive === false) return send(socket, { type: 'room_error', message: 'Chat Werewolf hanya tersedia untuk faksi Werewolf yang masih hidup saat malam.' });
      const text = String(message.text || '').trim().slice(0, 500);
      if (!text) return;
      const sender = room.players.get(socket.playerId);
      const payload = { type: 'role_chat', message: { id: `${Date.now()}-${Math.random()}`, alias: sender.alias, text } };
      for (const player of room.players.values()) {
        if (room.roles.get(player.id)?.faction === 'KELOMPOK JAHAT') send(player.socket, payload);
      }
      return;
    }

    if (message.type === 'night_action') {
      const room = rooms.get(socket.roomCode);
      const role = room?.roles?.get(socket.playerId);
      if (!room || room.phase !== 'malam' || room.winner || !role || room.players.get(socket.playerId)?.alive === false) return send(socket, { type: 'room_error', message: 'Aksi malam hanya tersedia untuk pemain hidup saat malam.' });
      if (message.targetId && role.name !== 'Cupid' && !room.roles.has(message.targetId)) return send(socket, { type: 'room_error', message: 'Moderator bukan target aksi malam.' });
      if (message.targetId && role.name !== 'Cupid' && room.players.get(message.targetId)?.alive === false) return send(socket, { type: 'room_error', message: 'Target sudah tereliminasi.' });
      const targetedRole = ['Werewolf', 'Alpha Werewolf', 'Pelihat / Seer', 'Pelindung / Bodyguard', 'Dokter / Doctor', 'Penyihir / Witch', 'Sorceress / Antek Werewolf'].includes(role.name);
      if (targetedRole && !message.targetId) return send(socket, { type: 'room_error', message: 'Role ini harus memilih target.' });
      if (!targetedRole && role.name !== 'Cupid' && message.targetId) return send(socket, { type: 'room_error', message: 'Role ini tidak memiliki target malam.' });
      if ((role.name === 'Werewolf' || role.name === 'Alpha Werewolf') && room.roles.get(message.targetId)?.faction === 'KELOMPOK JAHAT') return send(socket, { type: 'room_error', message: 'Werewolf tidak dapat menyerang faksi sendiri.' });
      if (role.name === 'Cupid') {
        if (room.round !== 1 || room.cupidPair) return send(socket, { type: 'room_error', message: 'Cupid hanya dapat bekerja pada malam pertama.' });
        const pair = String(message.targetId || '').split(',').filter((id, index, ids) => id && ids.indexOf(id) === index);
        if (pair.length !== 2 || pair.some((id) => room.players.get(id)?.alive === false)) return send(socket, { type: 'room_error', message: 'Cupid harus memilih dua pemain yang masih hidup.' });
        room.cupidPair = pair;
        room.nightActions.set(socket.playerId, { role: role.name, targetId: pair.join(','), action: 'Cupid:pair' });
        send(socket, { type: 'night_action_saved', message: 'Pasangan Kekasih sudah ditentukan.' });
        return;
      }
      if (role.name.includes('Bodyguard') && message.targetId === room.previousBodyguardTarget) return send(socket, { type: 'room_error', message: 'Bodyguard tidak boleh melindungi pemain yang sama dua malam berturut-turut.' });
      if (role.name.includes('Witch')) {
        const potion = message.action === 'Witch:heal' ? 'heal' : message.action === 'Witch:poison' ? 'poison' : null;
        if (!potion || !room.witchPotions.get(socket.playerId)?.[potion]) return send(socket, { type: 'room_error', message: 'Ramuan tersebut sudah digunakan atau tidak tersedia.' });
        room.witchPotions.get(socket.playerId)[potion] = false;
      }
      room.nightActions.set(socket.playerId, { role: role.name, targetId: message.targetId || null, action: String(message.action || 'aksi').slice(0, 40) });
      send(socket, { type: 'night_action_saved', message: 'Aksi malammu sudah dicatat secara rahasia.' });
      if (role.name.includes('Pelihat') || role.name.includes('Seer')) {
        const targetRole = room.roles.get(message.targetId);
        send(socket, { type: 'role_result', message: `${room.players.get(message.targetId)?.alias || 'Pemain'} adalah ${targetRole?.faction === 'KELOMPOK JAHAT' ? 'Werewolf' : 'Bukan Werewolf'}.` });
      }
      if (role.name.includes('Sorceress')) {
        const targetRole = room.roles.get(message.targetId);
        send(socket, { type: 'role_result', message: `${room.players.get(message.targetId)?.alias || 'Pemain'} ${targetRole?.name.includes('Seer') ? 'adalah Seer.' : 'bukan Seer.'}` });
      }
      const moderator = room.players.get(room.moderatorId);
      if (moderator) send(moderator.socket, { type: 'night_action_status', count: room.nightActions.size, total: room.players.size - 1 });
      return;
    }

    if (message.type === 'join_room') {
      const code = String(message.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(socket, { type: 'room_error', message: 'Room tidak ditemukan.' });
      if (room.players.size >= room.maxPlayers) return send(socket, { type: 'room_error', message: 'Room sudah penuh.' });
      if (!message.player?.id || room.players.has(message.player.id)) return send(socket, { type: 'room_error', message: 'ID pemain sudah digunakan atau tidak valid.' });
      const isModerator = room.moderator === 'player' && !room.moderatorId;
      if (isModerator) room.moderatorId = message.player.id;
      room.players.set(message.player.id, { ...message.player, alias: `Warga #${room.players.size + 1}`, alive: true, status: isModerator ? 'Moderator' : 'Ready', socket });
      console.log(`${message.player.name} bergabung ke room ${code} (${room.players.size}/${room.maxPlayers})`);
      socket.roomCode = code;
      socket.playerId = message.player.id;
      broadcast(room);
    }
  });

  socket.on('close', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const player = room.players.get(socket.playerId);
    if (!player || player.socket !== socket) return;
    player.socket = null;
    player.disconnectTimer = setTimeout(() => {
      if (player.socket) return;
      room.players.delete(socket.playerId);
      if (room.players.size === 0) rooms.delete(room.code);
      else broadcast(room);
    }, 30000);
    broadcast(room);
  });
});

httpServer.listen(port, () => console.log(`Moonfall server berjalan di http://localhost:${port}`));
