import { useState } from "react";
import { api, session } from "../lib/api";
import type { User } from "../lib/types";
import { SpaceBackdrop } from "./SpaceBackdrop";

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ token: string; user: User }>) {
    setBusy(true); setError("");
    try {
      const r = await fn();
      session.save(r.token, r.user);
      onLogin(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-screen">
      <SpaceBackdrop />
      <div className="menu-vignette" />
      <div className="menu-scan" />
      <div className="login">
      <div className="eyebrow-holo">NASA SPACE APPS 2026 · SPACE MISSION DESIGN GAME</div>
      <h1 className="glitch" data-text="THE SPACE RACE">THE SPACE RACE</h1>
      <p className="tagline">Draft a spacecraft. Beat your rival to the science.</p>
      <div className="panel holo login-card">
        <div className="holo-title">🔐 IDENTIFY, ENGINEER</div>
        <input placeholder="Callsign" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password (optional for guest)" type="password" value={password}
               onChange={(e) => setPassword(e.target.value)} />
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => run(() => api.guest(username))}>Play as guest</button>
          <button disabled={busy || !password} onClick={() => run(() => api.login(username, password))}>Log in</button>
          <button disabled={busy || !password} onClick={() => run(() => api.register(username, password))}>Register</button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      </div>
    </div>
  );
}
