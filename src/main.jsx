import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { anonymousSignIn, createFirebaseRoom, getFirebaseRoom, pushFirebaseChat, pushFirebaseWerewolfChat, setFirebaseNightAction, setFirebasePrivateRole, setFirebaseVote, subscribeFirebaseNightActions, subscribeFirebasePrivateRole, subscribeFirebaseWerewolfChat, subscribeRoom, updateFirebaseRoom, upsertFirebasePlayer } from './firebase';
import './style.css';

const avatars = [
  { name: 'Raven', icon: '✦', tone: 'violet' },
  { name: 'Moth', icon: '◒', tone: 'blue' },
  { name: 'Cinder', icon: '✹', tone: 'orange' },
  { name: 'Fern', icon: '❋', tone: 'green' },
  { name: 'Luna', icon: '☾', tone: 'pink' },
  { name: 'Vex', icon: '◇', tone: 'red' },
];

const demoPlayers = [
  { name: 'Sable', icon: '✦', tone: 'violet', status: 'Host' },
  { name: 'Moth', icon: '◒', tone: 'blue', status: 'Ready' },
  { name: 'Cinder', icon: '✹', tone: 'orange', status: 'Ready' },
  { name: 'Fern', icon: '❋', tone: 'green', status: 'Ready' },
];

const roleOptions = [
  { name: 'Warga Desa', symbol: '✦', faction: 'KELOMPOK BAIK', description: 'Tidak memiliki kekuatan khusus, tetapi memiliki hak suara penuh saat diskusi dan voting siang hari.', action: 'Gunakan diskusi dan voting untuk mencari Werewolf.' },
  { name: 'Pelihat / Seer', symbol: '◉', faction: 'KELOMPOK BAIK', description: 'Setiap malam, cek apakah satu pemain adalah Werewolf atau bukan.', action: 'Terawang satu pemain malam ini.' },
  { name: 'Werewolf', symbol: '☾', faction: 'KELOMPOK JAHAT', description: 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', action: 'Pilih target serangan bersama kelompokmu.' },
  { name: 'Pelindung / Bodyguard', symbol: '✚', faction: 'KELOMPOK BAIK', description: 'Melindungi satu pemain dari serangan Werewolf dan tidak boleh memilih orang yang sama dua malam berturut-turut.', action: 'Lindungi satu pemain malam ini.' },
  { name: 'Alpha Werewolf', symbol: '◐', faction: 'KELOMPOK JAHAT', description: 'Pemimpin Werewolf dengan suara penentu jika kelompok tidak sepakat.', action: 'Pimpin pilihan target Werewolf malam ini.' },
  { name: 'Sorceress / Antek Werewolf', symbol: '✧', faction: 'KELOMPOK JAHAT', description: 'Berpihak pada Werewolf dan menebak siapa yang menjadi Seer.', action: 'Cari Seer secara diam-diam.' },
  { name: 'Dokter / Doctor', symbol: '⚕', faction: 'KELOMPOK BAIK', description: 'Memilih satu pemain untuk diselamatkan dari serangan Werewolf.', action: 'Pilih satu pemain untuk diselamatkan.' },
  { name: 'Pemburu / Hunter', symbol: '⌁', faction: 'KELOMPOK BAIK', description: 'Jika tereliminasi, dapat menembak satu pemain lain untuk ikut gugur.', action: 'Tidak memiliki aksi malam.' },
  { name: 'Penyihir / Witch', symbol: '⚗', faction: 'KELOMPOK BAIK', description: 'Memiliki satu ramuan penyembuh dan satu ramuan racun selama permainan.', action: 'Gunakan ramuan jika tersedia.' },
  { name: 'Cupid', symbol: '♡', faction: 'KELOMPOK BAIK', description: 'Pada malam pertama, pasangkan dua pemain yang saling terikat.', action: 'Pasangkan dua pemain pada malam pertama.' },
  { name: 'Mayor / Wali Kota', symbol: '♛', faction: 'KELOMPOK BAIK', description: 'Suara voting siang hari bernilai dua.', action: 'Gunakan suara ganda dengan bijak.' },
  { name: 'Tanner / Jester', symbol: '☹', faction: 'KELOMPOK NETRAL', description: 'Menang jika berhasil dikeluarkan melalui voting warga desa pada siang hari.', action: 'Buat warga desa mencurigaimu.' },
];

function getFirebaseRoles(playerCount) {
  const findRole = (name) => roleOptions.find((role) => role.name === name);
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
  const roles = selectedNames.slice(0, playerCount).map(findRole);
  while (roles.length < playerCount) roles.push(findRole('Warga Desa'));
  return roles.sort(() => Math.random() - 0.5);
}

function App() {
  const [screen, setScreen] = useState('welcome');
  const [profile, setProfile] = useState({ username: '', gender: 'Female', avatar: 0 });
  const [assignedRole, setAssignedRole] = useState(null);
  const [room, setRoom] = useState({ code: '', name: 'Desa Cahaya Bulan', isHost: true, moderator: 'host', maxPlayers: 15, phase: 'lobi' });
  const [modal, setModal] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [players, setPlayers] = useState([]);
  const [roomError, setRoomError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [voteState, setVoteState] = useState([]);
  const [roleChatMessages, setRoleChatMessages] = useState([]);
  const [nightActionStatus, setNightActionStatus] = useState('');
  const [roleResult, setRoleResult] = useState('');
  const [moderatorActionStatus, setModeratorActionStatus] = useState(null);
  const [hunterPrompt, setHunterPrompt] = useState('');
  const [nightResult, setNightResult] = useState('');
  const [winner, setWinner] = useState('');
  const socketRef = useRef(null);
  const pendingRoomAction = useRef(null);
  const playerId = useRef(crypto.randomUUID());
  const firebaseMode = import.meta.env.VITE_USE_FIREBASE === 'true';

  useEffect(() => {
    anonymousSignIn().then(({ user }) => {
      if (firebaseMode) playerId.current = user.uid;
    }).catch(() => setRoomError('Firebase Authentication belum diaktifkan. Aktifkan Anonymous sign-in di Firebase Console.'));
    if (firebaseMode) return undefined;
    const defaultSocketUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    const socket = new WebSocket(import.meta.env.VITE_WS_URL || defaultSocketUrl);
    socketRef.current = socket;
    socket.addEventListener('open', () => {
      const savedSession = sessionStorage.getItem('moonfall-room-session');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        socket.send(JSON.stringify({ type: 'reconnect_room', code: session.code, playerId: session.playerId, sessionToken: session.sessionToken }));
      } else if (pendingRoomAction.current) {
        socket.send(JSON.stringify(pendingRoomAction.current));
        pendingRoomAction.current = null;
      }
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'room_state') {
        const isHost = message.room.moderator === 'host' ? message.room.hostId === playerId.current : message.room.moderatorId === playerId.current;
        setRoom((current) => ({ ...current, ...message.room, isHost }));
        setAssignedRole((current) => isHost ? null : current);
        setPlayers(message.room.players);
        setChatMessages(message.room.chatMessages || []);
        setVoteState(message.room.voteState || []);
        setNightResult(message.room.nightResult || '');
        setWinner(message.room.winner || '');
        setRoomError('');
        const savedSession = JSON.parse(sessionStorage.getItem('moonfall-room-session') || '{}');
        sessionStorage.setItem('moonfall-room-session', JSON.stringify({ ...savedSession, code: message.room.code, playerId: playerId.current }));
        setScreen((current) => current === 'home' || current === 'welcome' ? 'room' : current);
      }
      if (message.type === 'session') sessionStorage.setItem('moonfall-room-session', JSON.stringify({ code: message.code, playerId: message.playerId, sessionToken: message.sessionToken }));
      if (message.type === 'room_error') setRoomError(message.message);
      if (message.type === 'role_assigned') setAssignedRole(message.role);
      if (message.type === 'role_chat') setRoleChatMessages((current) => [...current, message.message].slice(-100));
      if (message.type === 'night_action_saved') setNightActionStatus(message.message);
      if (message.type === 'role_result') setRoleResult(message.message);
      if (message.type === 'hunter_revenge') setHunterPrompt(message.message);
      if (message.type === 'night_action_status') setModeratorActionStatus(message);
      if (message.type === 'game_started') setScreen('game');
    });
    socket.addEventListener('error', () => setRoomError('Koneksi multiplayer gagal. Backend WebSocket belum terhubung.'));
    return () => socket.close();
  }, []);

  useEffect(() => {
    if (!firebaseMode || !room.code) return undefined;
    return subscribeRoom(room.code, (remoteRoom) => {
      if (!remoteRoom) return;
      const remotePlayers = Object.values(remoteRoom.players || {});
      setRoom((current) => ({ ...current, ...remoteRoom, isHost: remoteRoom.moderator === 'host' ? remoteRoom.hostId === playerId.current : remoteRoom.moderatorId === playerId.current }));
      setPlayers(remotePlayers);
      setChatMessages(Object.values(remoteRoom.chatMessages || {}));
      setVoteState(Object.entries(remoteRoom.votes || {}).map(([voterId, targetId]) => ({ targetId, count: Object.values(remoteRoom.votes || {}).filter((value) => value === targetId).length, voterId })));
      setScreen((current) => current === 'home' || current === 'welcome' ? 'room' : remoteRoom.phase !== 'lobi' && current === 'room' ? 'game' : current);
    });
  }, [firebaseMode, room.code]);

  useEffect(() => {
    if (!firebaseMode || !room.code || room.isHost) return undefined;
    return subscribeFirebasePrivateRole(room.code, playerId.current, (role) => role && setAssignedRole(role));
  }, [firebaseMode, room.code, room.isHost]);

  useEffect(() => {
    if (!firebaseMode || !room.code || assignedRole?.faction !== 'KELOMPOK JAHAT') return undefined;
    return subscribeFirebaseWerewolfChat(room.code, (messages) => setRoleChatMessages(Object.values(messages || {})));
  }, [firebaseMode, room.code, assignedRole]);

  useEffect(() => {
    if (!firebaseMode || !room.code) return undefined;
    return subscribeFirebaseNightActions(room.code, (actions) => {
      const ownAction = actions?.[playerId.current];
      if (ownAction) setNightActionStatus('Aksi malam tersimpan di room.');
    });
  }, [firebaseMode, room.code]);

  function sendRoomAction(action) {
    if (firebaseMode && room.code) {
      if (action.type === 'start_room' || action.type === 'set_phase') {
        return updateFirebaseRoom(room.code, { phase: action.type === 'start_room' ? 'malam' : action.phase })
          .then(() => setActionFeedback('Fase room berhasil diperbarui.'))
          .catch(() => setRoomError('Firebase menolak perubahan fase. Pastikan Anda moderator.'));
      }
      if (action.type === 'chat_message') return pushFirebaseChat(room.code, { id: `${Date.now()}-${Math.random()}`, alias: players.find((player) => player.id === playerId.current)?.alias || 'Warga', text: action.text });
      if (action.type === 'role_chat') return pushFirebaseWerewolfChat(room.code, { id: `${Date.now()}-${Math.random()}`, alias: players.find((player) => player.id === playerId.current)?.alias || 'Werewolf', text: action.text });
      if (action.type === 'vote_player') {
        return setFirebaseVote(room.code, action.playerId, action.targetId)
          .then(() => setActionFeedback('Vote tersimpan.'))
          .catch(() => setRoomError('Vote ditolak Firebase. Pastikan fase siang dan pemain masih hidup.'));
      }
      if (action.type === 'night_action') {
        setNightActionStatus('Aksi malammu sudah dicatat.');
        return setFirebaseNightAction(room.code, playerId.current, { action: action.action, targetId: action.targetId || null, round: room.round || 1 })
          .then(() => setActionFeedback('Aksi malam tersimpan.'))
          .catch(() => setRoomError('Aksi malam ditolak Firebase. Pastikan fase malam dan role masih hidup.'));
      }
      return Promise.resolve();
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(action));
    else pendingRoomAction.current = action;
  }

  const updateProfile = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const generateCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

  function enterGame() {
    if (!profile.username.trim()) return;
    setScreen('home');
  }

  function createRoom(moderator, maxPlayers) {
    setAssignedRole(null);
    sessionStorage.removeItem('moonfall-room-session');
    if (firebaseMode) {
      const code = generateCode();
      const player = { id: playerId.current, name: profile.username || 'Kamu', alias: 'Warga #1', icon: avatars[profile.avatar].icon, tone: avatars[profile.avatar].tone, alive: true, status: 'Host' };
      createFirebaseRoom(code, { code, name: 'Desa Cahaya Bulan', moderator, moderatorId: player.id, hostId: player.id, maxPlayers, phase: 'lobi', players: { [player.id]: player } }).then(() => setRoom((current) => ({ ...current, code, maxPlayers, moderator, isHost: true })));
      setModal(null);
      return;
    }
    sendRoomAction({ type: 'create_room', moderator, maxPlayers, name: 'Desa Cahaya Bulan', player: { id: playerId.current, name: profile.username || 'Kamu', icon: avatars[profile.avatar].icon, tone: avatars[profile.avatar].tone } });
    setModal(null);
  }

  function joinRoom() {
    if (joinCode.trim().length < 4) return;
    setAssignedRole(null);
    sessionStorage.removeItem('moonfall-room-session');
    if (firebaseMode) {
      const code = joinCode.trim().toUpperCase();
      getFirebaseRoom(code).then((remoteRoom) => {
        if (!remoteRoom) return setRoomError('Room tidak ditemukan.');
        if (Object.keys(remoteRoom.players || {}).length >= remoteRoom.maxPlayers && !remoteRoom.players[playerId.current]) return setRoomError('Room sudah penuh.');
        const usedAliases = new Set(Object.values(remoteRoom.players || {}).map((remotePlayer) => remotePlayer.alias));
        let aliasNumber = 1;
        while (usedAliases.has(`Warga #${aliasNumber}`)) aliasNumber += 1;
        const player = { id: playerId.current, name: profile.username || 'Kamu', alias: `Warga #${aliasNumber}`, icon: avatars[profile.avatar].icon, tone: avatars[profile.avatar].tone, alive: true, status: 'Ready' };
        return upsertFirebasePlayer(code, player.id, player).then(() => {
          setRoom((current) => ({ ...current, code, isHost: false }));
          setModal(null);
        });
      });
      return;
    }
    sendRoomAction({ type: 'join_room', code: joinCode.trim().toUpperCase(), player: { id: playerId.current, name: profile.username || 'Kamu', icon: avatars[profile.avatar].icon, tone: avatars[profile.avatar].tone } });
    setModal(null);
  }

  function setPhase(nextPhase) {
    sendRoomAction({ type: 'set_phase', phase: nextPhase, playerId: playerId.current });
  }

  function startRoom() {
    if (firebaseMode) {
      const eligiblePlayers = players.filter((player) => player.id !== room.moderatorId);
      if (eligiblePlayers.length < 5) {
        setRoomError('Minimal 6 pemain diperlukan untuk memulai permainan.');
        return;
      }
      const assignedRoles = getFirebaseRoles(eligiblePlayers.length);
      Promise.all(eligiblePlayers.map((player, index) => setFirebasePrivateRole(room.code, player.id, assignedRoles[index])))
        .then(() => updateFirebaseRoom(room.code, { phase: 'malam' }))
        .then(() => setScreen('game'));
      return;
    }
    const result = sendRoomAction({ type: 'start_room', playerId: playerId.current });
    if (firebaseMode) {
      Promise.resolve(result).then(() => setScreen('game'));
    }
  }

  function sendChat(text) {
    sendRoomAction({ type: 'chat_message', playerId: playerId.current, text });
  }

  function sendVote(targetId) {
    if (room.phase !== 'siang') return setRoomError('Voting hanya tersedia saat siang.');
    sendRoomAction({ type: 'vote_player', playerId: playerId.current, targetId });
  }

  function sendRoleChat(text) {
    sendRoomAction({ type: 'role_chat', playerId: playerId.current, text });
  }

  function sendNightAction(action, targetId) {
    if (room.phase !== 'malam') return setRoomError('Aksi malam hanya tersedia saat malam.');
    sendRoomAction({ type: 'night_action', playerId: playerId.current, action, targetId });
  }

  function sendHunterShot(targetId) {
    sendRoomAction({ type: 'hunter_shot', playerId: playerId.current, targetId });
    setHunterPrompt('');
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(room.code); } catch { /* clipboard unavailable in preview */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (screen === 'welcome') return <Welcome profile={profile} updateProfile={updateProfile} enterGame={enterGame} />;
  if (screen === 'room') return <Room room={room} profile={profile} players={players} copied={copied} copyCode={copyCode} back={() => setScreen('home')} start={startRoom} setPhase={setPhase} canStart={room.isHost} roomError={roomError} />;
  if (screen === 'game') return <SynchronizedGameScreen hunterPrompt={hunterPrompt} sendHunterShot={sendHunterShot} currentAlive={players.find((player) => player.id === playerId.current)?.alive !== false} assignedRole={assignedRole} isModerator={room.isHost} winner={winner} nightResult={nightResult} roleResult={roleResult} roleChatMessages={roleChatMessages} sendRoleChat={sendRoleChat} nightActionStatus={nightActionStatus} moderatorActionStatus={moderatorActionStatus} sendNightAction={sendNightAction} currentPhase={room.phase} round={room.round} phaseEndsAt={room.phaseEndsAt} players={players} voteState={voteState} sendVote={sendVote} chatMessages={chatMessages} sendChat={sendChat} canModerate={room.isHost} setPhase={setPhase} feedback={actionFeedback} setPhaseError={roomError} back={() => setScreen('room')} />;

  return (
    <main className="app-shell">
      <div className="grain" />
      <header className="topbar">
        <button className="brand-button" onClick={() => setScreen('home')} aria-label="Kembali ke home"><span className="brand-mark">☾</span><span>MOONFALL</span></button>
        <div className="profile-chip"><span className={`avatar avatar-${avatars[profile.avatar].tone}`}>{avatars[profile.avatar].icon}</span><span>{profile.username}</span><button className="tiny-icon" onClick={() => setScreen('welcome')} aria-label="Edit profil">✎</button></div>
      </header>
      <section className="home-content">
        <div className="eyebrow"><span className="live-dot" /> PERMAINAN SOSIAL MALAM HARI</div>
        <h1>Jangan percaya siapa pun<br /><em>saat malam tiba.</em></h1>
        <p className="lead">Baca gerak-gerik. Bentuk aliansi. Temukan serigala sebelum bulan tenggelam.</p>
        <div className="hero-moon"><div className="moon-glow" /><div className="moon">☾</div><div className="orbit orbit-one" /><div className="orbit orbit-two" /></div>
        <div className="room-actions">
          <button className="primary-button" onClick={() => setModal('create')}><span className="button-icon">+</span>Buat room<span className="arrow">↗</span></button>
          <button className="secondary-button" onClick={() => setModal('join')}><span className="button-icon">⌁</span>Gabung dengan kode<span className="arrow">↗</span></button>
        </div>
        {roomError && <p className="connection-warning">{roomError}</p>}
        <div className="home-stats"><div><strong>6—40</strong><span>pemain</span></div><div><strong>20 mnt</strong><span>rata-rata permainan</span></div><div><strong>∞</strong><span>pengkhianatan</span></div></div>
        <div className="section-heading"><span>Cara bermain</span><span className="section-line" /></div>
        <div className="steps"><Step number="01" title="Kumpulkan" text="Buat room atau masuk ke room temanmu." /><Step number="02" title="Kelabui" text="Setiap malam, peran rahasia mulai bergerak." /><Step number="03" title="Bertahan" text="Gunakan insting. Hanya satu faksi yang menang." /></div>
      </section>
      {modal === 'create' && <CreateModal onClose={() => setModal(null)} onCreate={createRoom} />}
      {modal === 'join' && <JoinModal code={joinCode} setCode={setJoinCode} onClose={() => setModal(null)} onJoin={joinRoom} />}
    </main>
  );
}

function Welcome({ profile, updateProfile, enterGame }) {
  return <main className="welcome-screen"><div className="grain" /><div className="welcome-moon">☾</div><div className="welcome-copy"><div className="brand-lockup"><span className="brand-mark large">☾</span><span>MOONFALL</span></div><p className="kicker">DESA INI SEDANG MENUNGGU</p><h1>Kamu akan<br /><em>menjadi siapa?</em></h1><p className="welcome-description">Permainan deduksi sosial tentang peran rahasia, bisikan sunyi, dan keputusan yang buruk.</p><div className="profile-form"><label>Pilih nama pengguna<input value={profile.username} onChange={(event) => updateProfile('username', event.target.value)} placeholder="contoh: pengembara" maxLength="18" /></label><div className="form-label">Bagaimana kamu mengidentifikasi diri?</div><div className="segmented-control">{['Perempuan', 'Laki-laki', 'Non-biner'].map((gender) => <button key={gender} className={profile.gender === gender ? 'selected' : ''} onClick={() => updateProfile('gender', gender)}>{gender}</button>)}</div><div className="form-label">Pilih avatar</div><div className="avatar-picker">{avatars.map((avatar, index) => <button key={avatar.name} className={profile.avatar === index ? 'picked' : ''} onClick={() => updateProfile('avatar', index)}><span className={`avatar avatar-${avatar.tone}`}>{avatar.icon}</span><small>{avatar.name}</small></button>)}</div><button className="primary-button enter-button" onClick={enterGame}>Masuk ke desa <span className="arrow">↗</span></button></div></div><div className="welcome-footer"><span>v0.1.0 / beta privat</span><span>dibuat untuk malam panjang</span></div></main>;
}

function Step({ number, title, text }) { return <div className="step"><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>; }

function CreateModal({ onClose, onCreate }) {
  const [moderator, setModerator] = useState('host');
  const [maxPlayers, setMaxPlayers] = useState(15);
  return <Modal title="Buat room" onClose={onClose}><label className="modal-label">Nama room<input defaultValue="Desa Cahaya Bulan" /></label><label className="modal-label capacity-label">Jumlah pemain<input type="number" min="6" max="40" value={maxPlayers} onChange={(event) => setMaxPlayers(Math.min(40, Math.max(6, Number(event.target.value) || 6)))} /><small>Atur dari 6 sampai 40 pemain</small></label><div className="form-label moderator-label">Moderator siang & malam</div><div className="moderator-options"><button className={moderator === 'host' ? 'selected' : ''} onClick={() => setModerator('host')}><strong>Pembuat room</strong><span>Mengatur fase permainan</span></button><button className={moderator === 'player' ? 'selected' : ''} onClick={() => setModerator('player')}><strong>Pemain khusus</strong><span>Dipilih setelah room dibuat</span></button></div><div className="room-settings"><div><span>Pemain</span><strong>6—{maxPlayers}</strong></div><div><span>Mode</span><strong>Klasik</strong></div><div><span>Akses</span><strong>Kode saja</strong></div></div><button className="primary-button full" onClick={() => onCreate(moderator, maxPlayers)}>Buat kode room <span className="arrow">↗</span></button></Modal>;
}
function JoinModal({ code, setCode, onClose, onJoin }) { return <Modal title="Gabung room" onClose={onClose}><p className="modal-hint">Minta kode enam karakter dari moderator.</p><label className="modal-label">Kode room<input autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" maxLength="6" /></label><button className="primary-button full" onClick={onJoin}>Masuk room <span className="arrow">↗</span></button></Modal>; }
function Modal({ title, children, onClose }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose} aria-label="Tutup">×</button><span className="modal-kicker">NIGHTFALL</span><h2>{title}</h2>{children}</div></div>; }

function Room({ room, profile, players, copied, copyCode, back, start, setPhase, canStart, roomError }) {
  return <main className="app-shell room-shell"><div className="grain" /><header className="topbar"><button className="back-button" onClick={back}>← <span>Lobi</span></button><span className="room-status"><span className="live-dot" /> RUANG TUNGGU</span><button className="tiny-icon" aria-label="Pengaturan">⚙</button></header><section className="room-content"><p className="eyebrow">{room.name.toUpperCase()}</p><h1>Kumpulkan<br /><em>kelompokmu.</em></h1><div className="code-panel"><div><span className="panel-label">KODE ROOM</span><strong>{room.code}</strong></div><button className="copy-button" onClick={copyCode}>{copied ? 'Tersalin' : 'Salin kode'} <span>▣</span></button></div><div className="moderator-banner"><span>☼</span><div><strong>Moderator siang & malam</strong><small>{room.moderator === 'host' ? 'Pembuat room mengatur jalannya permainan' : 'Moderator dipilih dari pemain setelah room dibuat'}</small></div></div>{roomError && <p className="room-error">{roomError}</p>}<div className="players-header"><span>Pemain <b>{players.length}/{room.maxPlayers}</b></span><span className="ready-label">{players.filter((player) => player.status === 'Ready').length} siap</span></div><div className="player-list">{players.map((player) => <div className="player-row" key={player.id}><span className={`avatar avatar-${player.tone}`}>{player.icon}</span><div className="player-name"><strong>{player.name}{player.name === profile.username && <span className="you-tag">KAMU</span>}</strong><span>{player.status === 'Host' ? 'Pembuat room' : 'Siap bermain'}</span></div><span className={`status-dot ${player.status === 'Host' ? 'host-dot' : ''}`} /></div>)}<div className="empty-slots"><span>+</span><span>Menunggu pemain lain...</span></div></div>{canStart ? <button className="primary-button full start-button" onClick={start}>Mulai malam <span className="arrow">↗</span></button> : <button className="primary-button full start-button start-disabled" disabled>Menunggu moderator memulai</button>}<p className="room-note">Minimal 6 pemain untuk mulai · Kapasitas room {room.maxPlayers} · Hanya moderator atau pembuat room yang dapat memulai</p></section></main>;
}

function Game({ profile, back }) {
  const [phase, setPhase] = useState('role');
  const roles = [
    { name: 'Warga Desa', symbol: '✦', faction: 'KELOMPOK BAIK · 20 SLOT', description: 'Tidak memiliki kekuatan khusus, tetapi memiliki hak suara penuh saat diskusi dan voting siang hari.', action: 'Gunakan diskusi dan voting untuk mencari Werewolf.' },
    { name: 'Pelihat / Seer', symbol: '◉', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Setiap malam, cek identitas asli satu pemain untuk mengetahui apakah ia Werewolf atau bukan.', action: 'Terawang satu pemain malam ini.' },
    { name: 'Pelindung / Bodyguard', symbol: '✚', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Melindungi satu pemain dari serangan Werewolf. Tidak boleh melindungi orang yang sama dua malam berturut-turut.', action: 'Lindungi satu pemain malam ini.' },
    { name: 'Dokter / Doctor', symbol: '⚕', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Memilih satu pemain untuk diselamatkan. Jika target Werewolf sama, korban selamat.', action: 'Pilih satu pemain untuk diselamatkan.' },
    { name: 'Pemburu / Hunter', symbol: '⌁', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Jika tereliminasi, dapat menembak satu pemain lain untuk ikut gugur.', action: 'Tidak memiliki aksi malam.' },
    { name: 'Cupid', symbol: '♡', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Pada malam pertama, pasangkan dua pemain. Jika salah satu mati, pasangannya ikut mati karena patah hati.', action: 'Pasangkan dua pemain pada malam pertama.' },
    { name: 'Mayor / Wali Kota', symbol: '♛', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Warga biasa dengan suara voting siang hari yang bernilai dua.', action: 'Gunakan suara ganda dengan bijak saat voting.' },
    { name: 'Werewolf', symbol: '☾', faction: 'KELOMPOK JAHAT · 6 SLOT', description: 'Bangun setiap malam, berdiskusi dengan sesama Werewolf, lalu pilih satu warga untuk dimangsa.', action: 'Pilih target serangan bersama kelompokmu.' },
    { name: 'Alpha Werewolf', symbol: '◐', faction: 'KELOMPOK JAHAT · 1 SLOT', description: 'Pemimpin Werewolf. Memiliki suara penentu jika sesama Werewolf tidak sepakat.', action: 'Pimpin pilihan target Werewolf malam ini.' },
    { name: 'Sorceress / Antek Werewolf', symbol: '✧', faction: 'KELOMPOK JAHAT · 1 SLOT', description: 'Warga jahat yang tidak ikut membunuh dan tidak mengenal Werewolf. Menang bersama Werewolf.', action: 'Tebak siapa yang menjadi Seer malam ini.' },
    { name: 'Penyihir / Witch', symbol: '⚗', faction: 'KELOMPOK BAIK · 1 SLOT', description: 'Memiliki satu ramuan penyembuh dan satu ramuan racun. Masing-masing hanya dapat dipakai sekali.', action: 'Gunakan ramuan penyembuh atau racun jika tersedia.' },
    { name: 'Tanner / Jester', symbol: '☹', faction: 'KELOMPOK NETRAL', description: 'Menang jika berhasil difitnah dan dikeluarkan melalui voting warga desa pada siang hari.', action: 'Buat warga desa mencurigaimu.' },
  ];
  const [role] = useState(() => roles[Math.floor(Math.random() * roles.length)]);
  return <main className="app-shell game-shell"><div className="grain" /><header className="topbar"><button className="back-button" onClick={back}>← <span>Room</span></button><span className="room-status">MALAM 01 / 08:42</span><span className="moon-counter">☾ 01</span></header><section className="game-content">{phase === 'role' ? <><p className="eyebrow">NOTIFIKASI PERAN TERPILIH</p><div className="role-card"><div className="role-notification">✦ Sistem memilih role ini secara acak untukmu</div><span className="role-symbol">{role.symbol}</span><h1>{role.name}</h1><span className="role-faction">{role.faction}</span><div className="role-function"><span>FUNGSI ROLE</span><p>{role.description}</p></div><div className="role-action"><span>AKSI MALAM</span><p>{role.action}</p></div></div><button className="primary-button full" onClick={() => setPhase('night')}>Saya mengerti dan siap <span className="arrow">↗</span></button></> : <><p className="eyebrow">MALAM TIBA / GILIRANMU</p><h1>{role.action}</h1><p className="game-copy">Desa sedang tertidur. Pilihanmu tetap rahasia sampai pagi.</p><div className="target-list">{demoPlayers.slice(0, 3).map((player) => <button className="target-row" key={player.name}><span className={`avatar avatar-${player.tone}`}>{player.icon}</span><span>{player.name}</span><span className="arrow">↗</span></button>)}</div><p className="room-note">Moderator akan mengatur pergantian fase siang dan malam.</p></>}</section></main>;
}

function DiscussionChat({ messages, sendChat }) {
  const [text, setText] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    sendChat(text.trim());
    setText('');
  }
  return <div className="discussion-chat"><div className="chat-heading"><span>Diskusi anonim</span><small>Nama pemain disembunyikan</small></div><div className="chat-messages">{messages.length === 0 ? <p className="chat-empty">Belum ada pesan. Mulai diskusi dengan sopan.</p> : messages.map((message) => <div className="chat-message" key={message.id}><strong>{message.alias}</strong><p>{message.text}</p></div>)}</div><form className="chat-form" onSubmit={submit}><input value={text} onChange={(event) => setText(event.target.value)} maxLength="500" placeholder="Tulis pendapatmu..." aria-label="Pesan diskusi" /><button type="submit" aria-label="Kirim pesan">↗</button></form></div>;
}

function VotingPanel({ players, voteState, sendVote }) {
  return <div className="voting-panel"><div className="chat-heading"><span>Voting anonim</span><small>Pilih satu tersangka</small></div><div className="vote-list">{players.filter((player) => player.alive !== false && player.status !== 'Host' && player.status !== 'Moderator').map((player) => { const vote = voteState.find((item) => item.targetId === player.id); return <button className="vote-row" key={player.id} onClick={() => sendVote(player.id)}><span>{player.alias}</span><strong>{vote?.count || 0}</strong></button>; })}</div><p className="vote-note">Pilihanmu dapat diubah sebelum moderator menutup voting.</p></div>;
}

function RoleChat({ messages, sendMessage }) {
  const [text, setText] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    sendMessage(text.trim());
    setText('');
  }
  return <div className="role-chat"><div className="chat-heading"><span>Komunikasi rahasia Werewolf</span><small>Hanya faksi jahat</small></div><div className="chat-messages">{messages.length === 0 ? <p className="chat-empty">Belum ada pesan dari kelompokmu.</p> : messages.map((message) => <div className="chat-message" key={message.id}><strong>{message.alias}</strong><p>{message.text}</p></div>)}</div><form className="chat-form" onSubmit={submit}><input value={text} onChange={(event) => setText(event.target.value)} maxLength="500" placeholder="Tulis strategi rahasia..." aria-label="Pesan rahasia Werewolf" /><button type="submit" aria-label="Kirim pesan rahasia">↗</button></form></div>;
}

function NightActionPanel({ players, role, status, sendAction }) {
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const needsTarget = !['Warga Desa', 'Pemburu / Hunter'].includes(role.name);
  const isWitch = role.name.includes('Witch');
  const isCupid = role.name === 'Cupid';
  function selectCupidTarget(id) { setSelectedTargets((current) => current.includes(id) ? current.filter((targetId) => targetId !== id) : current.length < 2 ? [...current, id] : current); }
  return <div className="night-action-panel"><div className="chat-heading"><span>Aksi malam: {role.name}</span><small>Rahasia</small></div><p>{role.action}</p>{isCupid && <><div className="night-targets">{players.filter((player) => player.status !== 'Host' && player.status !== 'Moderator').map((player) => <button className={selectedTargets.includes(player.id) ? 'target-selected' : ''} key={player.id} onClick={() => selectCupidTarget(player.id)}><span>{player.alias}</span><span>{selectedTargets.includes(player.id) ? '✓' : '+'}</span></button>)}</div><button className="action-confirm-button" disabled={selectedTargets.length !== 2} onClick={() => sendAction('Cupid:pair', selectedTargets.join(','))}>Pasangkan dua pemain</button></>}{!isCupid && needsTarget && <div className="night-targets">{players.filter((player) => player.status !== 'Host' && player.status !== 'Moderator').map((player) => <button className={selectedTarget === player.id ? 'target-selected' : ''} key={player.id} onClick={() => isWitch ? setSelectedTarget(player.id) : sendAction(role.name, player.id)}><span>{isWitch ? `Pilih ${player.alias}` : player.alias}</span><span>{selectedTarget === player.id ? '✓' : '↗'}</span></button>)}</div>}{isWitch && <><button className="action-confirm-button" disabled={!selectedTarget} onClick={() => sendAction('Witch:poison', selectedTarget)}>Gunakan ramuan racun</button><button className="action-confirm-button" disabled={!selectedTarget} onClick={() => sendAction('Witch:heal', selectedTarget)}>Gunakan ramuan penyembuh</button></>}{!needsTarget && !isCupid && <button className="action-confirm-button" onClick={() => sendAction(role.name, null)}>Konfirmasi aksi pasif</button>}{status && <div className="action-success">✓ {status}</div>}</div>;
}

function HunterPanel({ players, message, sendShot }) {
  return <div className="night-action-panel hunter-panel"><div className="chat-heading"><span>Pemburu terakhir</span><small>Kesempatan terakhir</small></div><p>{message}</p><div className="night-targets">{players.filter((player) => player.alive !== false && player.status !== 'Host').map((player) => <button key={player.id} onClick={() => sendShot(player.id)}><span>Tembak {player.alias}</span><span>↗</span></button>)}</div></div>;
}

function SynchronizedGameScreen(props) {
  const isWerewolf = props.currentPhase === 'malam' && props.assignedRole?.faction === 'KELOMPOK JAHAT';
  const isPlayerNight = props.currentPhase === 'malam' && props.assignedRole && !props.isModerator;
  return <><GameScreenWithChat {...props} />{props.hunterPrompt && <div className="role-chat-overlay"><HunterPanel players={props.players} message={props.hunterPrompt} sendShot={props.sendHunterShot} /></div>}{!props.currentAlive && <div className="role-chat-overlay"><div className="dead-banner"><strong>Kamu sudah tereliminasi</strong><span>Mode penonton aktif. Jangan mengirim pesan, voting, atau memberi petunjuk.</span></div></div>}{props.winner && <div className="role-chat-overlay"><div className="winner-banner">Permainan selesai: {props.winner === 'WARGA' ? 'Kelompok Warga menang.' : props.winner === 'TANNER' ? 'Tanner menang.' : 'Kelompok Werewolf menang.'}</div></div>}{props.currentPhase === 'siang' && props.nightResult && <div className="role-chat-overlay"><div className="night-result">Pengumuman malam: {props.nightResult}</div></div>}{props.roleResult && <div className="role-chat-overlay"><div className="role-result">Hasil penerawangan: {props.roleResult}</div></div>}{isWerewolf && props.currentAlive && <div className="role-chat-overlay"><RoleChat messages={props.roleChatMessages} sendMessage={props.sendRoleChat} /></div>}{isPlayerNight && props.currentAlive && <div className="role-chat-overlay"><NightActionPanel players={props.players.filter((player) => player.alive !== false)} role={props.assignedRole} status={props.nightActionStatus} sendAction={props.sendNightAction} /></div>}{props.isModerator && props.currentPhase === 'malam' && props.moderatorActionStatus && <div className="role-chat-overlay"><div className="moderator-progress">Aksi malam: {props.moderatorActionStatus.count}/{props.moderatorActionStatus.total} pemain selesai</div></div>}</>;
}

function GameScreenWithChat({ assignedRole, isModerator, roleChatMessages, sendRoleChat, currentPhase = 'malam', round = 0, phaseEndsAt, players, voteState, sendVote, chatMessages, sendChat, canModerate, setPhase, back }) {
  const [showRole, setShowRole] = useState(true);
  useEffect(() => {
    if (currentPhase === 'malam') setShowRole(true);
  }, [currentPhase]);
  useEffect(() => {
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((Number(phaseEndsAt || 0) - Date.now()) / 1000));
      const counter = document.querySelector('.moon-counter');
      if (counter) counter.textContent = `☾ ${String(round).padStart(2, '0')} · ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [phaseEndsAt]);
  const roles = [
    { name: 'Warga Desa', symbol: '✦', faction: 'KELOMPOK BAIK', description: 'Tidak memiliki kekuatan khusus, tetapi memiliki hak suara penuh saat diskusi dan voting siang hari.', action: 'Gunakan diskusi dan voting untuk mencari Werewolf.' },
    { name: 'Pelihat / Seer', symbol: '◉', faction: 'KELOMPOK BAIK', description: 'Setiap malam, cek apakah satu pemain adalah Werewolf atau bukan.', action: 'Terawang satu pemain malam ini.' },
    { name: 'Werewolf', symbol: '☾', faction: 'KELOMPOK JAHAT', description: 'Bangun setiap malam bersama kelompokmu dan pilih satu warga untuk dimangsa.', action: 'Pilih target serangan bersama kelompokmu.' },
    { name: 'Pelindung / Bodyguard', symbol: '✚', faction: 'KELOMPOK BAIK', description: 'Melindungi satu pemain dari serangan Werewolf dan tidak boleh memilih orang yang sama dua malam berturut-turut.', action: 'Lindungi satu pemain malam ini.' },
    { name: 'Tanner / Jester', symbol: '☹', faction: 'KELOMPOK NETRAL', description: 'Menang jika berhasil dikeluarkan melalui voting warga desa pada siang hari.', action: 'Buat warga desa mencurigaimu.' },
  ];
  const [fallbackRole] = useState(() => roles[Math.floor(Math.random() * roles.length)]);
  const role = assignedRole || fallbackRole;
  return <main className="app-shell game-shell"><div className="grain" /><header className="topbar"><button className="back-button" onClick={back}>← <span>Room</span></button><span className="room-status">{currentPhase === 'siang' ? 'SIANG / DISKUSI' : 'MALAM / AKSI RAHASIA'}</span>{canModerate && <div className="phase-controls"><button className={currentPhase === 'siang' ? 'selected' : ''} onClick={() => setPhase('siang')}>Siang</button><button className={currentPhase === 'malam' ? 'selected' : ''} onClick={() => setPhase('malam')}>Malam</button></div>}<span className="moon-counter">☾ 01</span></header><section className="game-content">{currentPhase === 'siang' ? <><p className="eyebrow">FASE SIANG / SEMUA PEMAIN</p><h1>Waktunya<br /><em>berdiskusi.</em></h1><p className="game-copy">Moderator membuka mata desa. Diskusikan kecurigaanmu dan siapkan voting.</p><DiscussionChat messages={chatMessages} sendChat={sendChat} /><VotingPanel players={players} voteState={voteState} sendVote={sendVote} /></> : isModerator ? <><p className="eyebrow">PANDUAN MODERATOR / FASE MALAM</p><h1>Atur jalannya<br /><em>permainan.</em></h1><p className="game-copy">Kamu adalah Moderator/Narator. Tidak ada role pemain yang dibagikan kepadamu.</p><div className="day-panel night-panel"><span>☾</span><strong>Fase malam sedang berlangsung</strong><small>Panggil role sesuai urutan dan gunakan tombol Siang saat diskusi dimulai.</small></div></> : showRole ? <><p className="eyebrow">NOTIFIKASI PERAN TERPILIH</p><div className="role-card"><div className="role-notification">✦ Sistem memilih role ini secara acak untukmu</div><span className="role-symbol">{role.symbol}</span><h1>{role.name}</h1><span className="role-faction">{role.faction}</span><div className="role-function"><span>FUNGSI ROLE</span><p>{role.description}</p></div><div className="role-action"><span>AKSI MALAM</span><p>{role.action}</p></div></div><button className="primary-button full" onClick={() => setShowRole(false)}>Saya mengerti dan siap <span className="arrow">↗</span></button></> : <><p className="eyebrow">FASE MALAM / SEMUA PEMAIN</p><h1>Desa sedang<br /><em>tertidur.</em></h1><p className="game-copy">Moderator sedang memanggil role satu per satu. Tunggu giliranmu dan lakukan aksi rahasia.</p><div className="day-panel night-panel"><span>☾</span><strong>Fase malam sedang berlangsung</strong><small>Jangan berbicara atau membuka role kepada pemain lain.</small></div></>}</section></main>;
}

function GameScreen({ currentPhase = 'malam', canModerate, setPhase, back }) {
  return <main className="app-shell game-shell"><div className="grain" /><header className="topbar"><button className="back-button" onClick={back}>← <span>Room</span></button><span className="room-status">{currentPhase === 'siang' ? 'SIANG / DISKUSI' : 'MALAM / AKSI RAHASIA'}</span>{canModerate && <div className="phase-controls"><button className={currentPhase === 'siang' ? 'selected' : ''} onClick={() => setPhase('siang')}>Siang</button><button className={currentPhase === 'malam' ? 'selected' : ''} onClick={() => setPhase('malam')}>Malam</button></div>}<span className="moon-counter">☾ 01</span></header><section className="game-content">{currentPhase === 'siang' ? <><p className="eyebrow">FASE SIANG / SEMUA PEMAIN</p><h1>Waktunya<br /><em>berdiskusi.</em></h1><p className="game-copy">Moderator membuka mata desa. Diskusikan kecurigaanmu dan siapkan voting.</p><div className="day-panel"><span>☼</span><strong>Fase siang sedang berlangsung</strong><small>Ikuti arahan moderator dan jangan ungkapkan role rahasiamu.</small></div></> : <><p className="eyebrow">FASE MALAM / SEMUA PEMAIN</p><h1>Desa sedang<br /><em>tertidur.</em></h1><p className="game-copy">Moderator sedang memanggil role satu per satu. Tunggu giliranmu dan lakukan aksi rahasia.</p><div className="day-panel night-panel"><span>☾</span><strong>Fase malam sedang berlangsung</strong><small>Jangan berbicara atau membuka role kepada pemain lain.</small></div></>}</section></main>;
}

createRoot(document.getElementById('root')).render(<App />);
