import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBxUqGyLYCk3kZeGp7J3X7i1sCxUcaUSeY",
  authDomain: "crisislink-ai.firebaseapp.com",
  databaseURL: "https://crisislink-ai-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "crisislink-ai",
  storageBucket: "crisislink-ai.firebasestorage.app",
  messagingSenderId: "273394297706",
  appId: "1:273394297706:web:07b31fd270a1ed59315313"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

export { auth };