import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, onValue, push, ref, set, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyB79Gg0X8cFslo5iPtA9xmoF_3XZPFuiyM',
  authDomain: 'moonfall-nesbu.firebaseapp.com',
  databaseURL: 'https://moonfall-nesbu-default-rtdb.firebaseio.com',
  projectId: 'moonfall-nesbu',
  storageBucket: 'moonfall-nesbu.firebasestorage.app',
  messagingSenderId: '218664072542',
  appId: '1:218664072542:web:df5e9de6b776eadc218bcf',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const anonymousSignIn = () => signInAnonymously(auth);
export const roomRef = (code) => ref(database, `rooms/${code}`);
export const roomPlayersRef = (code) => ref(database, `rooms/${code}/players`);
export const subscribeRoom = (code, callback) => onValue(roomRef(code), (snapshot) => callback(snapshot.val()));
export const getFirebaseRoom = async (code) => (await get(roomRef(code))).val();
export const createFirebaseRoom = async (code, room) => set(roomRef(code), room);
export const updateFirebaseRoom = async (code, patch) => update(roomRef(code), patch);
export const upsertFirebasePlayer = async (code, playerId, player) => set(ref(database, `rooms/${code}/players/${playerId}`), player);
export const pushFirebaseChat = async (code, message) => push(ref(database, `rooms/${code}/chatMessages`), message);
export const setFirebaseVote = async (code, voterId, targetId) => set(ref(database, `rooms/${code}/votes/${voterId}`), targetId);
export const setFirebaseNightAction = async (code, playerId, action) => set(ref(database, `rooms/${code}/nightActions/${playerId}`), action);
export const subscribeFirebaseNightActions = (code, callback) => onValue(ref(database, `rooms/${code}/nightActions`), (snapshot) => callback(snapshot.val()));
export const pushFirebaseWerewolfChat = async (code, message) => push(ref(database, `werewolfChat/${code}`), message);
export const subscribeFirebaseWerewolfChat = (code, callback) => onValue(ref(database, `werewolfChat/${code}`), (snapshot) => callback(snapshot.val()));
export const setFirebasePrivateRole = async (code, playerId, role) => set(ref(database, `privateRoles/${code}/${playerId}`), role);
export const subscribeFirebasePrivateRole = (code, playerId, callback) => onValue(ref(database, `privateRoles/${code}/${playerId}`), (snapshot) => callback(snapshot.val()));
