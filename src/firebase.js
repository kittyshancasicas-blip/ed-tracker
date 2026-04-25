import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDShrnesdOg0VwvzG2ohrxm51ep8Yh9gKA",
  authDomain: "ed-tracker-4d2f0.firebaseapp.com",
  projectId: "ed-tracker-4d2f0",
  storageBucket: "ed-tracker-4d2f0.firebasestorage.app",
  messagingSenderId: "132868285663",
  appId: "1:132868285663:web:eada0fc610d18162a3b56a"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);