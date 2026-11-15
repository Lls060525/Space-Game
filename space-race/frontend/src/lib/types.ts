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
  specs: Record<string, number | boolean | string | string[]>;
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

export interface MassRow { label: string; kg: number; pct: number }

/** Mission environment derived from live NASA data (JPL Horizons + DONKI). */
export interface MissionEnv {
  source: string; date?: string;
  c3: number; c3_min: number; cruise_days: number;
  launch_date: string | null; arrival_date: string | null;
  window: string; window_days_off: number; next_window_days: number;
  phase_deg: number | null; optimal_phase_deg: number | null;
  sun_au: number; comm_au: number; light_time_min: number;
  min_sep_deg: number; blackout_days: number; cruise_sun_min: number;
  activity_index: number; space_weather_level: string; space_weather_source: string; sep_events: number;
}

export interface SpaceWeather {
  flares: { X: number; M: number; C: number }; strongest_flare: string | null;
  recent_flares: { time: string; cls: string }[];
  cme_count: number; fast_cme_count: number; sep_events: number; kp_max: number;
  activity_index: number; level: string; source: string;
}

export interface PlanetNow {
  sun_au: number; earth_au?: number; earth_km?: number; light_time_min?: number; irradiance_w_m2: number; solar_factor?: number;
}

export interface NasaSummary {
  date: string; fetched_at: number; ephemeris_source: string; live: boolean;
  space_weather: SpaceWeather;
  planets: { Mars: PlanetNow; Venus: PlanetNow; Moon: PlanetNow; Earth: PlanetNow };
}

export interface LaunchOption {
  slug: string; name: string; capacity_kg: number; cost: number; price_low: number; price_high: number;
  reliability: number; ref: string; fits: boolean;
}
export interface LaunchRange { mass_kg: number; low: number | null; high: number | null; cheapest: string | null; count: number; label?: string }

export interface SurfaceSite {
  name: string; lat: number; lon_e: number; computed_at: number; source: string;
  ltst_h: number | null; sun_el_deg: number | null; solar_dec_deg: number | null; day_s: number;
  ls_deg?: number; season?: string; dust_season?: boolean; phase?: string; elongation_deg?: number;
}

export interface NasaConditions extends NasaSummary {
  missions: Record<string, MissionEnv & { launch_options: LaunchOption[]; launch_ranges: LaunchRange[] }>;
  sites: { Mars: SurfaceSite; Moon: SurfaceSite; Venus: SurfaceSite };
}

export interface CostBreakdown {
  total: number; hardware: number; bus: number; wrap: number; development: number; reserve: number;
  operations: number; launch: number; nuclear_surcharge: number; rows: { label: string; musd: number }[];
}

export interface Thermal {
  n_mli: number; area_m2: number; hot_load_w: number; reject_w: number; hot_margin: number;
  cold_leak_w: number; rtg_heat_w: number; absorbed_sun_w: number;
}

export interface Stats {
  cost: number; budget: number; budget_left: number;
  cost_breakdown: CostBreakdown; hardware_cost: number;
  launch_options: LaunchOption[]; launch_price_range: LaunchRange | null;
  cbe_dry_mass_kg: number; mga_kg: number; structure_kg: number; harness_kg: number;
  dry_mass_kg: number; propellant_kg: number; wet_mass_kg: number; launch_mass_kg: number; adapter_kg: number;
  mass_budget: MassRow[]; heaviest_part: string | null; heaviest_part_kg: number;
  weight_on_earth_n: number; weight_at_destination_n: number;
  system_margin: number; required_system_margin: number;
  twr: number; twr_margin: number; lv_leo_kg: number; lv_capacity_kg: number; capacity_margin: number;
  c3: number; escape_dv: number;
  delta_v: number; dv_required: number; dv_margin: number; low_thrust: boolean; isp_s: number;
  solar_bol_w: number; solar_w: number; rtg_w: number; avg_gen_w: number; ops_draw_w: number; power_margin: number; instrument_duty: number;
  cruise_gen_w: number; cruise_draw_w: number; cruise_power_margin: number;
  battery_wh: number; eclipse_need_wh: number; battery_margin: number;
  battery_dod: number; battery_cycles: number; battery_cycle_life: number; battery_life_margin: number;
  radiation_survival: number;
  env: MissionEnv;
  eq: Record<string, number> & { lv_name: string | null };
  data_gb_day: number; storage_gb: number; downlink_gb_day: number; data_margin: number;
  max_science: number; science_target: number; objective_covered: boolean;
  thermal: Thermal; heater_w: number; thermal_margin: number;
  warnings: Warning[];
}

export interface PlayerState {
  username: string;
  picks: number[];
  ready: boolean;
  stats: Stats;
  quiz?: { idx: number; correct: number; bonus: number; total: number };
}

export interface MatchState {
  quiz?: { id: string; topic: string; q: string; options: string[] }[];
  quiz_bonus?: number;
  match_id: string;
  status: "drafting" | "finished" | "abandoned";
  phase: string;
  deadline: number;
  server_time: number;
  mission: Mission;
  pool: Record<string, number>;
  players: Record<string, PlayerState>;
  env?: MissionEnv;
  nasa?: NasaSummary | null;
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
  as_built?: { growth_of_mga?: number; dry_mass_kg?: number; growth_kg?: number; propellant_kg?: number;
               offloaded_kg?: number; delta_v?: number; dv_needed?: number;
               cost_growth?: number; actual_cost?: number; budget_left?: number };
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
  | { type: "match_found"; match_id: string }
  | { type: "quiz_result"; question_id: string; choice: number; answer: number; correct: boolean; explain: string; bonus: number };
