import type { Component, Mission, SimResult, Stats, User } from "./types";

const TOKEN_KEY = "spacerace.token";
const USER_KEY = "spacerace.user";

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  save(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
};

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.token) headers.Authorization = `Token ${session.token}`;
  const res = await fetch(`/api${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
  return body as T;
}

type AuthResp = { token: string; user: User };

export const api = {
  guest: (username: string) => req<AuthResp>("/auth/guest/", { method: "POST", body: JSON.stringify({ username }) }),
  login: (username: string, password: string) =>
    req<AuthResp>("/auth/login/", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) =>
    req<AuthResp>("/auth/register/", { method: "POST", body: JSON.stringify({ username, password }) }),
  components: () => req<Component[]>("/components/"),
  missions: () => req<Mission[]>("/missions/"),
  leaderboard: () => req<{ username: string; rating: number; games: number; wins: number; losses: number; best_score: number }[]>("/leaderboard/"),
  analyze: (mission: string, component_ids: number[]) =>
    req<Stats>("/practice/", { method: "POST", body: JSON.stringify({ mission, component_ids }) }),
  practiceLaunch: (mission: string, component_ids: number[]) =>
    req<SimResult>("/practice/", { method: "POST", body: JSON.stringify({ mission, component_ids, launch: true }) }),
};

export function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}?token=${session.token ?? ""}`;
}
