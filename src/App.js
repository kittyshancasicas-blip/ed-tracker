import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./Login";
import EDDispositionTracker from "./EDDispositionTracker";

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

    return () => unsubscribe();
  }, []);

  if (checking) return <div style={{ padding: 40 }}>Loading...</div>;

  if (!user) return <Login />;

  return (
    <>
      <div style={{ textAlign: "right", padding: 10 }}>
        {user.email}{" "}
        <button onClick={() => signOut(auth)}>Logout</button>
      </div>

      <EDDispositionTracker user={user} />
    </>
  );
}

export default App;