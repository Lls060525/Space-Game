export type Category =
  | "launch" | "power" | "battery" | "instrument" | "storage" | "comms" | "propulsion" | "thermal";

export interface Component {
  id: number;
  slug: string;
  name: string;
  category: Category;
  category_label: string;
  description: string;
  cost: number;
  mass: number;
  power_draw: number;
  reliability: number;
  stock: number;
  specs: Record<string, number | boolean | string[]>;
}

export interface Mission {
  slug: string;
  name: string;
  destination: string;
  objective: string;
  budget: number;
  days: number;
  science_target: number;
  required_tags: string[];
  thermal_req: number;
  insertion_dv: number;
  sun_au: number;
}

export interface Warning { level: "fail" | "warn" | "info"; code: string; message: string }

export interface Stats {
  cost: number; budget: number; budget_left: number;
  dry_mass_kg: number; propellant_kg: number; wet_mass_kg: number;
  twr: number; twr_margin: number; lv_capacity_kg: number; capacity_margin: number;
  delta_v: number; dv_required: number; dv_margin: number;
  avg_gen_w: number; ops_draw_w: number; power_margin: number;
  battery_wh: number; eclipse_need_wh: number; battery_margin: number;
  data_gb_day: number; storage_gb: number; downlink_gb_day: number; data_margin: number;
  max_science: number; science_target: number; objective_covered: boolean;
  thermal_rating: number; thermal_req: number; thermal_margin: number;
  warnings: Warning[];
}

export interface PlayerState {
  username: string;
  picks: number[];
  ready: boolean;
  stats: Stats;
}

export interface MatchState {
  match_id: string;
  status: "drafting" | "finished" | "abandoned";
  phase: string;
  deadline: number;
  server_time: number;
  mission: Mission;
  pool: Record<string, number>;
  players: Record<string, PlayerState>;
}

export interface TimelineEvent { t: number; phase: string; status: "ok" | "warn" | "fail" | "info"; message: string }

export interface SimResult {
  outcome: string;
  success: boolean;
  failed_phase: string | null;
  science: number;
  science_pct: number;
  survived_days: number;
  days: number;
  score: number;
  timeline: TimelineEvent[];
  probabilities: Record<string, number>;
  stats: Stats;
  username?: string;
}

export interface User { id: number; username: string }

export type ServerMsg =
  | { type: "state"; state: MatchState }
  | { type: "result"; state: MatchState; results: Record<string, SimResult> & { forfeit_by?: string }; winner_id: number | null }
  | { type: "error"; message: string }
  | { type: "opponent_status"; online: boolean }
  | { type: "presence"; users: User[] }
  | { type: "queued" } | { type: "cancelled" }
  | { type: "match_found"; match_id: string };
