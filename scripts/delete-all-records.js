const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDShrnesdOgoVWvzG2ohrxm51ep8Yh9gKA",
  authDomain: "ed-tracker-4d2f0.firebaseapp.com",
  projectId: "ed-tracker-4d2f0",
  storageBucket: "ed-tracker-4d2f0.firebasestorage.app",
  messagingSenderId: "132868285663",
  appId: "1:132868285663:web:eada0fc610d18162a3b56a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteAllRecords() {
  const snapshot = await getDocs(collection(db, "records"));

  console.log(`Found ${snapshot.size} records. Deleting...`);

  let count = 0;

  for (const item of snapshot.docs) {
    await deleteDoc(doc(db, "records", item.id));
    count++;

    if (count % 100 === 0) {
      console.log(`Deleted ${count}`);
    }
  }

  console.log(`Done. Deleted ${count} records.`);
}

deleteAllRecords().catch((error) => {
  console.error(error);
  process.exit(1);
});