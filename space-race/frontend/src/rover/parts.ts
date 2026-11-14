/**
 * Rover Expedition: parts catalogue + stat model.
 * Every part changes how the rover DRIVES, so engineering choices are felt, not just read.
 */
export type RoverPlanet = "Mars" | "Moon" | "Venus";
export type Slot = "chassis" | "wheels" | "motor" | "power" | "battery" | "instrument" | "extra";

export interface PlanetInfo {
  gravity: number;       // m/s^2
  sun: number;           // solar output multiplier vs Earth orbit
  sky: string; fog: string; fogDensity: number;
  ground: [string, string, string];
  dust: string;
  hazard: string;
  blurb: string;
  heat: boolean;         // electronics cook without cooling
  storm: boolean;        // dust storm event
  seed: number;
}

export const PLANETS: Record<RoverPlanet, PlanetInfo> = {
  Mars: {
    gravity: 3.72, sun: 0.43, sky: "#c98b6c", fog: "#d6a07e", fogDensity: 0.0055,
    ground: ["#6b2a14", "#b0512a", "#e09a6a"], dust: "#d98a5f",
    hazard: "Dust storm mid-mission: solar power drops, visibility collapses.",
    blurb: "38% gravity, 43% sunlight. The classic rover planet.", heat: false, storm: true, seed: 7,
  },
  Moon: {
    gravity: 1.62, sun: 1.0, sky: "#000000", fog: "#05050a", fogDensity: 0.0016,
    ground: ["#2e2e33", "#6f6f76", "#c4c4ca"], dust: "#9a9aa2",
    hazard: "16% gravity: massive jumps, but wheels barely grip. Hard landings hurt.",
    blurb: "Full sunlight, deep craters, Earth hanging in a black sky.", heat: false, storm: false, seed: 21,
  },
  Venus: {
    gravity: 8.87, sun: 0.15, sky: "#d9a64e", fog: "#c48b38", fogDensity: 0.011,
    ground: ["#4f3314", "#8a5a24", "#c99550"], dust: "#c08a45",
    hazard: "465 °C surface: electronics cook unless you bring cooling. Clouds block the Sun.",
    blurb: "Crushing gravity, orange gloom, the hardest drive in the solar system.", heat: true, storm: false, seed: 99,
  },
};

export interface RoverPart {
  id: string; slot: Slot; name: string; cost: number; mass: number; icon: string; desc: string;
  hp?: number;                                          // chassis
  wheelR?: number; grip?: number; climb?: number; speedMul?: number; tracks?: boolean; // wheels
  torque?: number; topSpeed?: number; draw?: number;    // motor
  gen?: number; solar?: boolean;                        // power
  capacity?: number;                                    // battery (Wh)
  scan?: number; drill?: boolean; radar?: number;       // instruments
  uplink?: boolean; cooling?: boolean; jets?: boolean;  // extras
  idleDraw?: number;
}

export const ROVER_PARTS: RoverPart[] = [
  // chassis
  { id: "ch-carbon", slot: "chassis", name: "Carbon Frame", icon: "🪶", cost: 45, mass: 60, hp: 60, desc: "Feather-light, fragile." },
  { id: "ch-alu", slot: "chassis", name: "Aluminium Frame", icon: "🔩", cost: 20, mass: 120, hp: 100, desc: "Balanced all-rounder." },
  { id: "ch-ti", slot: "chassis", name: "Titanium Armour", icon: "🛡️", cost: 40, mass: 210, hp: 170, desc: "Shrugs off crashes. Heavy." },
  // wheels
  { id: "wh-small", slot: "wheels", name: "Small Wheels", icon: "⚪", cost: 10, mass: 20, wheelR: 0.38, grip: 0.8, climb: 20, speedMul: 1.0, desc: "Cheap. Rocks stop you cold." },
  { id: "wh-rocker", slot: "wheels", name: "Rocker-Bogie Wheels", icon: "🛞", cost: 30, mass: 45, wheelR: 0.6, grip: 0.95, climb: 32, speedMul: 1.1, desc: "Like Perseverance: climbs crater walls." },
  { id: "wh-tracks", slot: "wheels", name: "Caterpillar Tracks", icon: "⛓️", cost: 35, mass: 80, wheelR: 0.5, grip: 1.25, climb: 40, speedMul: 0.8, tracks: true, desc: "Max grip and climb, slow." },
  // motor
  { id: "mo-eco", slot: "motor", name: "Eco Hub Motors", icon: "🐢", cost: 10, mass: 15, torque: 450, topSpeed: 10, draw: 90, desc: "Sips power. Slow." },
  { id: "mo-sport", slot: "motor", name: "Sport Motors", icon: "🐎", cost: 30, mass: 25, torque: 800, topSpeed: 16, draw: 210, desc: "Quick and fun." },
  { id: "mo-turbo", slot: "motor", name: "Turbo Motors", icon: "🚀", cost: 55, mass: 40, torque: 1300, topSpeed: 24, draw: 420, desc: "Absurd speed. Drinks batteries." },
  // power (optional - battery only is allowed)
  { id: "pw-solar", slot: "power", name: "Solar Deck", icon: "☀️", cost: 20, mass: 15, gen: 150, solar: true, desc: "150 W at 1 AU. Scales with sunlight." },
  { id: "pw-solar-xl", slot: "power", name: "Wide Solar Wings", icon: "🌞", cost: 40, mass: 30, gen: 300, solar: true, desc: "300 W at 1 AU." },
  { id: "pw-rtg", slot: "power", name: "Nuclear RTG", icon: "☢️", cost: 70, mass: 45, gen: 120, solar: false, desc: "120 W day and night, storms or not." },
  // battery
  { id: "bt-1", slot: "battery", name: "Battery 1.5 kWh", icon: "🔋", cost: 6, mass: 10, capacity: 1500, desc: "Light." },
  { id: "bt-3", slot: "battery", name: "Battery 3 kWh", icon: "🔋", cost: 15, mass: 22, capacity: 3000, desc: "Solid." },
  { id: "bt-6", slot: "battery", name: "Battery 6 kWh", icon: "🔋", cost: 32, mass: 48, capacity: 6000, desc: "Huge range, huge mass." },
  // instruments (multi)
  { id: "in-laser", slot: "instrument", name: "Laser Spectrometer", icon: "🔴", cost: 30, mass: 8, scan: 9, idleDraw: 15, desc: "Zaps samples from 9 m away while moving." },
  { id: "in-drill", slot: "instrument", name: "Core Drill", icon: "🛠️", cost: 25, mass: 25, drill: true, idleDraw: 10, desc: "Samples worth ×1.6. Must slow down to drill." },
  { id: "in-navcam", slot: "instrument", name: "Nav Camera Mast", icon: "📷", cost: 15, mass: 6, radar: 90, idleDraw: 8, desc: "Shows samples on radar from 90 m (25 m without)." },
  // extras (multi)
  { id: "ex-antenna", slot: "extra", name: "High-Gain Antenna", icon: "📡", cost: 25, mass: 12, uplink: true, idleDraw: 20, desc: "Uplinks samples instantly. No need to return to the lander." },
  { id: "ex-cooling", slot: "extra", name: "Cooling Loop", icon: "❄️", cost: 25, mass: 25, cooling: true, idleDraw: 40, desc: "Required to survive Venus." },
  { id: "ex-jets", slot: "extra", name: "Jump Jets", icon: "💨", cost: 30, mass: 20, jets: true, desc: "SPACE to hop over rocks (costs energy)." },
];

export const BUDGET = 260;
export const MISSION_SECONDS = 180;
export const ENERGY_K = 1 / 6;     // game-time compression: Wh drained per second = W * K
export const SINGLE: Slot[] = ["chassis", "wheels", "motor", "power", "battery"];
export const SLOT_LABEL: Record<Slot, string> = {
  chassis: "Chassis", wheels: "Wheels", motor: "Motors", power: "Power (optional)", battery: "Battery",
  instrument: "Science Instruments", extra: "Extras",
};

export type Build = string[];      // part ids
export const DEFAULT_BUILD: Build = ["ch-alu", "wh-small", "mo-eco", "bt-3", "in-laser"];

export function partsOf(build: Build): RoverPart[] {
  return build.map((id) => ROVER_PARTS.find((p) => p.id === id)).filter((p): p is RoverPart => !!p);
}

export interface RoverStats {
  cost: number; mass: number; hp: number;
  accel: number; topSpeed: number; climb: number; grip: number; wheelR: number; tracks: boolean;
  capacity: number; genW: number; drawFull: number; drawIdle: number; endurance: number;
  scan: number; drill: boolean; radar: number; uplink: boolean; cooling: boolean; jets: boolean;
  canSample: boolean; warnings: string[];
}

export function roverStats(build: Build, planet: RoverPlanet): RoverStats {
  const P = PLANETS[planet];
  const parts = partsOf(build);
  const get = (slot: Slot) => parts.find((p) => p.slot === slot);
  const ch = get("chassis"), wh = get("wheels"), mo = get("motor"), pw = get("power"), bt = get("battery");
  const cost = parts.reduce((s, p) => s + p.cost, 0);
  const mass = 40 + parts.reduce((s, p) => s + p.mass, 0);          // 40 kg avionics
  const grip = wh?.grip ?? 0.5;
  const traction = grip * (P.gravity + 4) * 1.15;
  const accel = mo ? Math.min((mo.torque! / mass) * 4, traction) : 0;
  const topSpeed = mo ? mo.topSpeed! * (wh?.speedMul ?? 1) * Math.min(1.25, Math.max(0.6, Math.sqrt(220 / mass))) : 0;
  const genW = pw ? (pw.solar ? pw.gen! * P.sun : pw.gen!) : 0;
  const drawIdle = 30 + parts.reduce((s, p) => s + (p.idleDraw ?? 0), 0);
  const drawFull = drawIdle + (mo?.draw ?? 0);
  const capacity = bt?.capacity ?? 0;
  const net = (drawFull - genW) * ENERGY_K;
  const endurance = net <= 0 ? Infinity : capacity / net;
  const scan = parts.some((p) => p.scan) ? 9 : 3.5;
  const drill = parts.some((p) => p.drill);
  const canSample = parts.some((p) => p.scan || p.drill);
  const s: RoverStats = {
    cost, mass, hp: ch?.hp ?? 0, accel, topSpeed, climb: wh?.climb ?? 0, grip, wheelR: wh?.wheelR ?? 0.4,
    tracks: !!wh?.tracks, capacity, genW, drawFull, drawIdle, endurance,
    scan, drill, radar: parts.some((p) => p.radar) ? 90 : 25,
    uplink: parts.some((p) => p.uplink), cooling: parts.some((p) => p.cooling), jets: parts.some((p) => p.jets),
    canSample, warnings: [],
  };
  if (cost > BUDGET) s.warnings.push(`Over budget by $${cost - BUDGET}M.`);
  for (const slot of ["chassis", "wheels", "motor", "battery"] as Slot[]) if (!get(slot)) s.warnings.push(`Missing ${SLOT_LABEL[slot].toLowerCase()}.`);
  if (!canSample) s.warnings.push("No laser or drill: you can't collect a single sample!");
  if (P.heat && !s.cooling) s.warnings.push("Venus will cook your electronics without a Cooling Loop.");
  if (pw?.solar && P.sun < 0.3) s.warnings.push(`Solar only gets ${Math.round(P.sun * 100)}% sunlight on ${planet}.`);
  if (endurance < 60) s.warnings.push(`Only ~${Math.round(endurance)} s of full-throttle driving.`);
  if (accel < 2) s.warnings.push("Barely moves: motors too weak for this mass/grip.");
  return s;
}

export function buildReady(s: RoverStats) {
  return s.cost <= BUDGET && s.hp > 0 && s.accel > 0 && s.capacity > 0 && s.wheelR > 0;
}
