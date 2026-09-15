import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

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