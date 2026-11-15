import type { Component, Mission, NasaConditions, SimResult, Stats, User } from "./types";

export interface ClassInfo {
  code: string; title: string; mission: string; mission_name: string; destination: string;
  created_by: string | null; launch_date: string | null;
  leaderboard: { username: string; score: number; success: boolean; science_pct: number; cost: number; attempts: number }[];
}

/** Split hosting (frontend on Vercel, backend on Render): set VITE_BACKEND_URL=https://<app>.onrender.com.
 *  Empty = same origin (local dev through the Vite proxy, or Django serving the built frontend). */
const BACKEND = ((import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_BACKEND_URL ?? "").replace(/\/$/, "");

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
  const res = await fetch(`${BACKEND}/api${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
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
  analyze: (mission: string, component_ids: number[], class_code?: string, bonus_budget = 0) =>
    req<Stats>("/practice/", { method: "POST", body: JSON.stringify({ mission, component_ids, class_code, bonus_budget }) }),
  quizPractice: () =>
    req<{ bonus: number; questions: { id: string; topic: string; q: string; options: string[]; answer: number; explain: string }[] }>("/quiz/practice/"),
  createClass: (mission: string, title: string) =>
    req<ClassInfo>("/class/", { method: "POST", body: JSON.stringify({ mission, title }) }),
  getClass: (code: string) => req<ClassInfo>(`/class/${encodeURIComponent(code)}/`),
  roverScores: (planet: string) =>
    req<{ username: string; score: number; samples: number }[]>(`/rover/scores/?planet=${encodeURIComponent(planet)}`),
  submitRover: (body: { planet: string; score: number; samples: number; build: string[] }) =>
    req<{ ok: boolean }>("/rover/scores/", { method: "POST", body: JSON.stringify(body) }),
  nasa: () => req<NasaConditions>("/nasa/conditions/"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validation: () => req<any>("/validation/"),
  practiceLaunch: (mission: string, component_ids: number[], class_code?: string, bonus_budget = 0) =>
    req<SimResult>("/practice/", { method: "POST", body: JSON.stringify({ mission, component_ids, launch: true, class_code, bonus_budget }) }),
};

export function wsUrl(path: string) {
  const base = BACKEND ? new URL(BACKEND) : location;
  const proto = base.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${base.host}${path}?token=${session.token ?? ""}`;
}
