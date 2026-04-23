import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDwmOpJg7CkD5QQYhP0ftJzEHANg1-Fqxs",
  authDomain: "ed-tracker-35338.firebaseapp.com",
  projectId: "ed-tracker-35338",
  storageBucket: "ed-tracker-35338.firebasestorage.app",
  messagingSenderId: "275795503982",
  appId: "1:275795503982:web:7f8721e3a6197cb7766f7f",
  measurementId: "G-C87LZ965WB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);