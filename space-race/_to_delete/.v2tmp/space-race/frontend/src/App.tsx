import { useEffect, useState } from "react";
import { api, session } from "./lib/api";
import { sfx } from "./lib/sfx";
import type { Component, User } from "./lib/types";
import { Lobby } from "./components/Lobby";
import { Login } from "./components/Login";
import { MatchScreen } from "./components/MatchScreen";
import { Practice } from "./components/Practice";

type Screen = { name: "lobby" } | { name: "match"; id: string } | { name: "practice" };

export default function App() {
  const [user, setUser] = useState<User | null>(session.user);
  const [screen, setScreen] = useState<Screen>({ name: "lobby" });
  const [components, setComponents] = useState<Component[]>([]);
  const [muted, setMuted] = useState(sfx.muted);

  useEffect(() => { if (user) api.components().then(setComponents); }, [user]);

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <nav className="top">
        <span className="logo" onClick={() => setScreen({ name: "lobby" })}>SPACE RACE</span>
        <button className="link" onClick={() => setMuted(sfx.toggleMute())}>{muted ? "🔇" : "🔊"}</button>
        <span className="muted">{user.username}</span>
        <button className="link" onClick={() => { session.clear(); setUser(null); }}>Log out</button>
      </nav>
      {screen.name === "lobby" && (
        <Lobby me={user} onMatch={(id) => setScreen({ name: "match", id })} onPractice={() => setScreen({ name: "practice" })} />
      )}
      {screen.name === "match" && components.length > 0 && (
        <MatchScreen key={screen.id} matchId={screen.id} me={user} components={components}
                     onExit={() => setScreen({ name: "lobby" })} />
      )}
      {screen.name === "practice" && components.length > 0 && (
        <Practice components={components} onExit={() => setScreen({ name: "lobby" })} />
      )}
    </div>
  );
}
