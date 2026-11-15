/**
 * Rover Expedition: parts catalogue + physics model.
 *
 * Everything is in SI units and every kilogram matters:
 *   weight        W = m·g                           (real surface gravity)
 *   traction      F_trac = μ·m·g·cosθ               (wheels slip above this)
 *   rolling res.  F_rr = Crr·m·g·cosθ, Crr grows with ground pressure (wheels sink in regolith)
 *   grade         F_g = m·g·sinθ                    (hills pull you back)
 *   drag          F_d = ½·ρ·Cd·A·v²                 (Venus air is 65 kg/m³: driving through soup)
 *   motor         F = min(F_stall, P/v), zero at the gearing's top speed
 *   acceleration  a = ΣF / (1.05·m)                 (+5 % for spinning wheels and gears)
 * Solar power uses today's REAL Sun distance from JPL Horizons (via the backend) × how much light
 * gets through the atmosphere. Energy is the one compressed quantity: 1 drive-second = 2 mission
 * minutes, so a battery that would last hours lasts minutes here (see TIME_COMPRESSION).
 */
export type RoverPlanet = "Mars" | "Moon" | "Venus";
export type Slot = "chassis" | "wheels" | "motor" | "power" | "battery" | "instrument" | "extra";

export interface PlanetInfo {
  gravity: number;       // m/s^2
  sunAU: number;         // default Sun distance (replaced by the live NASA value when available)
  transmission: number;  // fraction of top-of-atmosphere sunlight reaching the ground
  stormTransmission: number;
  airDensity: number;    // kg/m^3 at the surface
  surfaceTempC: number;
  radiation: number;     // HP/s per unit of solar activity (no magnetosphere/atmosphere = more)
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
    gravity: 3.721, sunAU: 1.524, transmission: 0.75, stormTransmission: 0.2, airDensity: 0.020, surfaceTempC: -60,
    radiation: 0.004,
    sky: "#c98b6c", fog: "#d6a07e", fogDensity: 0.0055,
    ground: ["#6b2a14", "#b0512a", "#e09a6a"], dust: "#d98a5f",
    hazard: "Dust storm mid-mission: optical depth jumps, solar power collapses, visibility goes.",
    blurb: "g = 3.72 m/s² (38 %). Thin CO₂ air, ~75 % of sunlight reaches the ground.", heat: false, storm: true, seed: 7,
  },
  Moon: {
    gravity: 1.625, sunAU: 1.0, transmission: 1.0, stormTransmission: 1.0, airDensity: 0, surfaceTempC: 120,
    radiation: 0.008,
    sky: "#000000", fog: "#05050a", fogDensity: 0.0016,
    ground: ["#2e2e33", "#6f6f76", "#c4c4ca"], dust: "#9a9aa2",
    hazard: "g = 1.62 m/s²: huge hops but only 16 % of your weight presses the wheels down, so grip is poor.",
    blurb: "Full sunlight, no air, no magnetic field: solar storms hit electronics hardest here.", heat: false, storm: false, seed: 21,
  },
  Venus: {
    gravity: 8.87, sunAU: 0.723, transmission: 0.04, stormTransmission: 0.04, airDensity: 65, surfaceTempC: 465,
    radiation: 0,
    sky: "#d9a64e", fog: "#c48b38", fogDensity: 0.011,
    ground: ["#4f3314", "#8a5a24", "#c99550"], dust: "#c08a45",
    hazard: "465 °C and 92 bar: electronics cook without cooling, the air is 65× denser than Earth's.",
    blurb: "g = 8.87 m/s². Only ~4 % of sunlight survives the clouds. Venera landers lasted hours.", heat: true, storm: false, seed: 99,
  },
};

export interface RoverPart {
  id: string; slot: Slot; name: string; cost: number; mass: number; icon: string; desc: string;
  hp?: number;                                          // chassis
  wheelR?: number; grip?: number; crr?: number; contactM2?: number; speedMul?: number; tracks?: boolean; climb?: number; // wheels
  torque?: number; powerW?: number; forceN?: number; maxSpeed?: number; topSpeed?: number; draw?: number; // motor
  gen?: number; solar?: boolean;                        // power
  capacity?: number;                                    // battery (Wh)
  scan?: number; drill?: boolean; radar?: number;       // instruments
  uplink?: boolean; cooling?: boolean; jets?: boolean; gasKg?: number;  // extras
  idleDraw?: number;
}

/*
 * Masses are realistic orders of magnitude (Perseverance 1025 kg, Apollo LRV 210 kg, Sojourner 11.5 kg).
 * Li-ion packs ~125 Wh/kg incl. packaging; MMRTG-class RTG ~2.6 W/kg; cold-gas jets Isp ~70 s.
 */
export const ROVER_PARTS: RoverPart[] = [
  // chassis
  { id: "ch-carbon", slot: "chassis", name: "Carbon Frame", icon: "🪶", cost: 45, mass: 60, hp: 60, desc: "Feather-light composite, cracks on hard landings." },
  { id: "ch-alu", slot: "chassis", name: "Aluminium Frame", icon: "🔩", cost: 20, mass: 120, hp: 100, desc: "Balanced, like the LRV's 2219 alloy frame." },
  { id: "ch-ti", slot: "chassis", name: "Titanium Armour", icon: "🛡️", cost: 40, mass: 210, hp: 170, desc: "Shrugs off crashes. Every kg costs grip, sinkage and battery." },
  // wheels: grip = traction coefficient μ on regolith, crr = rolling resistance on firm ground
  { id: "wh-small", slot: "wheels", name: "Small Wheels", icon: "⚪", cost: 10, mass: 20, wheelR: 0.38, grip: 0.55, crr: 0.16, contactM2: 0.06, speedMul: 1.0,
    desc: "μ 0.55, Crr 0.16. Tiny contact patch: heavy rovers sink in." },
  { id: "wh-rocker", slot: "wheels", name: "Rocker-Bogie Wheels", icon: "🛞", cost: 30, mass: 45, wheelR: 0.6, grip: 0.68, crr: 0.11, contactM2: 0.14, speedMul: 1.1,
    desc: "μ 0.68, Crr 0.11. Grousered aluminium wheels like Perseverance." },
  { id: "wh-tracks", slot: "wheels", name: "Caterpillar Tracks", icon: "⛓️", cost: 35, mass: 80, wheelR: 0.5, grip: 0.85, crr: 0.13, contactM2: 0.5, speedMul: 0.8, tracks: true,
    desc: "μ 0.85, huge footprint (no sinking), internal friction, slow." },
  // motors (all wheels combined): mechanical power, stall force at the wheel, gearing top speed
  { id: "mo-eco", slot: "motor", name: "Eco Hub Motors", icon: "🐢", cost: 10, mass: 15, powerW: 500, forceN: 900, maxSpeed: 4.5,
    desc: "500 W, 900 N. Apollo-LRV class (4 × ¼ hp). Sips power." },
  { id: "mo-sport", slot: "motor", name: "Sport Motors", icon: "🐎", cost: 30, mass: 25, powerW: 1300, forceN: 1500, maxSpeed: 7.5,
    desc: "1.3 kW, 1500 N. Crewed-pressurized-rover class." },
  { id: "mo-turbo", slot: "motor", name: "Turbo Motors", icon: "🚀", cost: 55, mass: 40, powerW: 2800, forceN: 2400, maxSpeed: 11,
    desc: "2.8 kW, 2400 N. Faster than anything ever flown. Drinks batteries." },
  // power (optional - battery only is allowed). gen = W at 1 AU above the atmosphere
  { id: "pw-solar", slot: "power", name: "Solar Deck", icon: "☀️", cost: 20, mass: 15, gen: 150, solar: true, desc: "150 W at 1 AU. × 1/r² × atmosphere." },
  { id: "pw-solar-xl", slot: "power", name: "Wide Solar Wings", icon: "🌞", cost: 40, mass: 30, gen: 300, solar: true, desc: "300 W at 1 AU. Big, heavy wings." },
  { id: "pw-rtg", slot: "power", name: "Nuclear RTG", icon: "☢️", cost: 75, mass: 45, gen: 120, solar: false,
    desc: "120 W day and night + ~2 kW of waste heat keeps you warm at night (DOE: $75M, 45 kg)." },
  // battery
  { id: "bt-1", slot: "battery", name: "Battery 1.5 kWh", icon: "🔋", cost: 6, mass: 12, capacity: 1500, desc: "Li-ion, ~125 Wh/kg." },
  { id: "bt-3", slot: "battery", name: "Battery 3 kWh", icon: "🔋", cost: 15, mass: 24, capacity: 3000, desc: "Solid." },
  { id: "bt-6", slot: "battery", name: "Battery 6 kWh", icon: "🔋", cost: 32, mass: 48, capacity: 6000, desc: "Huge range, 48 kg to haul around." },
  // instruments (multi)
  { id: "in-laser", slot: "instrument", name: "Laser Spectrometer", icon: "🔴", cost: 30, mass: 8, scan: 9, idleDraw: 15, desc: "Zaps samples from 9 m away while moving below 22 km/h (like SuperCam)." },
  { id: "in-drill", slot: "instrument", name: "Core Drill", icon: "🛠️", cost: 25, mass: 25, drill: true, idleDraw: 10, desc: "Drilled samples worth ×1.6 (×1.5 data). Get within 4.5 m, below 11 km/h, wheels on the ground, 0.9 s. Works alongside the laser." },
  { id: "in-navcam", slot: "instrument", name: "Nav Camera Mast", icon: "📷", cost: 15, mass: 6, radar: 90, idleDraw: 8,
    desc: "Stereo navcams: spot samples from 90 m (25 m without), AutoNav brakes before rocks, context images make samples worth ×1.25 (but 1.5× more data)." },
  // extras (multi)
  { id: "ex-antenna", slot: "extra", name: "High-Gain Antenna", icon: "📡", cost: 25, mass: 12, uplink: true, idleDraw: 20,
    desc: "X-band direct-to-Earth: send sample data from anywhere while Earth is above the horizon. Rate falls with 1/d², data arrives after the real light-time, +60 W while transmitting. Also receives orbital hazard maps." },
  { id: "ex-cooling", slot: "extra", name: "Cooling Loop", icon: "❄️", cost: 25, mass: 25, cooling: true, idleDraw: 40, desc: "Required to survive 465 °C on Venus." },
  { id: "ex-jets", slot: "extra", name: "Cold-Gas Jump Jets", icon: "💨", cost: 30, mass: 20, jets: true, gasKg: 6,
    desc: "SPACE: 3 m hop. Gas per hop = m·Δv/(Isp·g₀): heavier rover, fewer hops." },
];

export const BUDGET = 360;                         // rover system cost cap, $M (launch & landing paid separately)
export const MISSION_SECONDS = 180;
export const TIME_COMPRESSION = 120;              // energy only: 1 drive-second = 2 mission minutes
export const ENERGY_K = TIME_COMPRESSION / 3600;  // Wh drained per second = W * K
export const MOTOR_EFF = 0.75;                    // electrical -> wheel
export const AVIONICS_KG = 40;
export const CDA = 1.4;                           // drag coefficient × frontal area, m²
export const HOP_HEIGHT = 3;
export const JET_ISP = 70;
export const G0 = 9.80665;
export const SOLAR_CONSTANT = 1361;
export const SINGLE: Slot[] = ["chassis", "wheels", "motor", "power", "battery"];
export const SLOT_LABEL: Record<Slot, string> = {
  chassis: "Chassis", wheels: "Wheels", motor: "Motors", power: "Power (optional)", battery: "Battery",
  instrument: "Science Instruments", extra: "Extras",
};

export type Build = string[];      // part ids
export const DEFAULT_BUILD: Build = ["ch-alu", "wh-small", "mo-eco", "bt-3", "in-laser"];

/** Today's Sun distance per planet from the backend (JPL Horizons). */
export type LiveSun = Partial<Record<RoverPlanet, { sun_au: number; earth_au?: number; light_time_min?: number }>>;

/** Default Earth distance (AU) and one-way light time if no live data. */
const EARTH_AU: Record<RoverPlanet, number> = { Mars: 1.5, Moon: 0.00257, Venus: 0.7 };

/** A real landing site with its local solar time right now (Mars24 / lunar ephemeris, from the backend). */
export interface RoverSite {
  name: string; lat: number; lon_e: number; computed_at: number;
  ltst_h: number | null; solar_dec_deg: number | null; day_s: number; sun_el_deg: number | null;
  dust_season?: boolean; season?: string; phase?: string; ls_deg?: number; source?: string;
  earth_offset_deg?: number; earth_el_deg?: number | null;
}

/** Science data per sample (MB) - only science that reaches Earth scores. */
export const DATA_MB = { common: 25, rare: 70, legendary: 180 } as const;
export const HGA_MBPS_1AU = 2;          // X-band direct-to-Earth rate at 1 AU (×1/d², capped for the Moon)
export const HGA_TX_W = 60;             // extra power while the transmitter is on
export const NAVCAM_VALUE = 1.25;       // context imaging makes a sample more valuable...
export const NAVCAM_DATA = 1.5;         // ...but it is more data to send
export const RELAY_RANGE = 12;          // m: UHF relay through the lander (no antenna needed)

/** Earth elevation over the site (deg). Mars: Earth trails/leads the Sun by earth_offset_deg in the sky. */
export function earthElevation(site: RoverSite | undefined, ltst: number | null) {
  if (!site) return 45;
  if (site.earth_el_deg !== undefined && site.earth_el_deg !== null) return site.earth_el_deg;
  if (ltst === null || site.solar_dec_deg === null || site.earth_offset_deg === undefined) return 45;
  const r = Math.PI / 180, la = site.lat * r, de = site.solar_dec_deg * r;
  const H = ((ltst - 12) * 15 - site.earth_offset_deg) * r;
  return Math.asin(Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(H)) / r;
}

/** Night-time survival heating when there is no RTG waste heat (W). */
export const NIGHT_HEATER_W: Record<RoverPlanet, number> = { Mars: 60, Moon: 140, Venus: 0 };

/** Local solar time (hours) at the site `extraS` seconds of mission time after the backend computed it. */
export function siteTime(site: RoverSite | undefined, extraS = 0, offsetH = 0) {
  if (!site || site.ltst_h === null) return null;
  const elapsed = Date.now() / 1000 - site.computed_at + extraS;
  return (((site.ltst_h + offsetH + (elapsed / site.day_s) * 24) % 24) + 24) % 24;
}

/** Sun elevation (deg) at the site for a given local solar time. */
export function sunElevation(site: RoverSite | undefined, ltst: number | null) {
  if (!site || ltst === null || site.solar_dec_deg === null) return null;
  const r = Math.PI / 180, la = site.lat * r, de = site.solar_dec_deg * r, H = (ltst - 12) * 15 * r;
  return Math.asin(Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(H)) / r;
}

/** Fraction of overhead sunlight hitting a flat solar deck (Venus: diffuse cloud light, no day/night modelled). */
export function sunOnDeck(planet: RoverPlanet, el: number | null) {
  if (planet === "Venus" || el === null) return 1;
  return Math.max(0, Math.sin((el * Math.PI) / 180));
}

export const fmtTime = (h: number | null) =>
  h === null ? "-" : `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

export function partsOf(build: Build): RoverPart[] {
  return build.map((id) => ROVER_PARTS.find((p) => p.id === id)).filter((p): p is RoverPart => !!p);
}

export interface RoverStats {
  cost: number; mass: number; hp: number;
  weightN: number; earthWeightN: number; groundKPa: number; sinkage: number;
  mu: number; crr: number; powerW: number; forceN: number; vmax: number;
  accel: number; topSpeed: number; climb: number; grip: number; wheelR: number; tracks: boolean;
  capacity: number; genW: number; drawFull: number; drawIdle: number; endurance: number;
  sunAU: number; irradiance: number; solarFactor: number; live: boolean;
  sunEl: number | null; deckFactor: number; night: boolean; heaterW: number; genNoonW: number;
  gasKg: number; hopGasKg: number; hops: number;
  earthAU: number; lightS: number; uplinkMBs: number; navcam: boolean;
  massRows: { label: string; kg: number; pct: number }[];
  scan: number; drill: boolean; radar: number; uplink: boolean; cooling: boolean; jets: boolean;
  canSample: boolean; warnings: string[];
}

/** Steady speed on flat ground where motor power equals rolling resistance + drag. */
function flatTopSpeed(P: number, Fmax: number, vmax: number, Frr: number, rho: number) {
  let lo = 0, hi = vmax;
  const net = (v: number) => Math.min(Fmax, P / Math.max(v, 0.05)) - Frr - 0.5 * rho * CDA * v * v;
  if (net(hi) >= 0) return hi;
  if (net(0.05) <= 0) return 0;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (net(m) > 0) lo = m; else hi = m; }
  return lo;
}

export function roverStats(build: Build, planet: RoverPlanet, live?: LiveSun, sunEl: number | null = null): RoverStats {
  const P = PLANETS[planet];
  const g = P.gravity;
  const parts = partsOf(build);
  const get = (slot: Slot) => parts.find((p) => p.slot === slot);
  const ch = get("chassis"), wh = get("wheels"), mo = get("motor"), pw = get("power"), bt = get("battery");
  const cost = parts.reduce((s, p) => s + p.cost, 0);
  const mass = AVIONICS_KG + parts.reduce((s, p) => s + p.mass, 0);
  const weightN = mass * g;

  // ground pressure -> sinkage -> rolling resistance (simplified Bekker terramechanics)
  const contact = wh?.contactM2 ?? 0.05;
  const groundKPa = weightN / contact / 1000;
  const sinkage = Math.min(2, Math.max(0, (groundKPa - 8) / 16));
  const crr = (wh?.crr ?? 0.2) * (1 + sinkage);
  const mu = wh?.grip ?? 0.4;

  const powerW = mo?.powerW ?? 0, forceN = mo?.forceN ?? 0;
  const vmax = (mo?.maxSpeed ?? 0) * (wh?.speedMul ?? 1);
  const Frr = crr * weightN;
  const Fdrive0 = Math.min(forceN, mu * weightN);
  const accel = mo ? Math.max(0, (Fdrive0 - Frr) / (1.05 * mass)) : 0;
  const topSpeed = mo ? flatTopSpeed(powerW, Fdrive0, vmax, Frr, P.airDensity) : 0;
  // steepest slope: traction (μ) or motor force, whichever gives out first
  const lim = Math.min(mu, forceN / weightN);
  const climb = mo && lim > crr ? Math.round(Math.atan(lim - crr) * 180 / Math.PI) : 0;

  const sunAU = live?.[planet]?.sun_au ?? P.sunAU;
  const solarFactor = 1 / (sunAU * sunAU);
  const deckFactor = sunOnDeck(planet, sunEl);
  const genNoonW = pw ? (pw.solar ? pw.gen! * solarFactor * P.transmission : pw.gen!) : 0;
  const genW = pw?.solar ? genNoonW * deckFactor : genNoonW;
  const night = sunEl !== null && sunEl < 0 && planet !== "Venus";
  const heaterW = night && !(pw && !pw.solar) ? NIGHT_HEATER_W[planet] : 0;   // RTG waste heat = free heating
  const drawIdle = 30 + heaterW + parts.reduce((s, p) => s + (p.idleDraw ?? 0), 0);
  const drawFull = drawIdle + powerW / MOTOR_EFF;
  const capacity = bt?.capacity ?? 0;
  const net = (drawFull - genW) * ENERGY_K;
  const endurance = net <= 0 ? Infinity : capacity / net;

  const jets = parts.some((p) => p.jets);
  const navcam = parts.some((p) => p.radar);
  const earthAU = live?.[planet]?.earth_au ?? EARTH_AU[planet];
  const gasKg = parts.reduce((s, p) => s + (p.gasKg ?? 0), 0);
  const hopGasKg = (mass * Math.sqrt(2 * g * HOP_HEIGHT)) / (JET_ISP * G0);
  const hops = jets ? Math.floor(gasKg / hopGasKg) : 0;

  const groups: Record<string, number> = { Avionics: AVIONICS_KG };
  for (const p of parts) groups[SLOT_LABEL[p.slot]] = (groups[SLOT_LABEL[p.slot]] ?? 0) + p.mass;
  const massRows = Object.entries(groups).map(([label, kg]) => ({ label, kg, pct: (100 * kg) / mass })).sort((a, b) => b.kg - a.kg);

  const scan = parts.some((p) => p.scan) ? 9 : 3.5;
  const drill = parts.some((p) => p.drill);
  const canSample = parts.some((p) => p.scan || p.drill);
  const s: RoverStats = {
    cost, mass, hp: ch?.hp ?? 0, weightN, earthWeightN: mass * G0, groundKPa, sinkage, mu, crr, powerW, forceN, vmax,
    accel, topSpeed, climb, grip: mu, wheelR: wh?.wheelR ?? 0.4, tracks: !!wh?.tracks,
    capacity, genW, drawFull, drawIdle, endurance,
    sunAU, irradiance: SOLAR_CONSTANT * solarFactor, solarFactor, live: !!live?.[planet],
    sunEl, deckFactor, night, heaterW, genNoonW,
    gasKg, hopGasKg, hops, massRows,
    earthAU, lightS: earthAU * 499.005, navcam,
    uplinkMBs: parts.some((p) => p.uplink) ? (HGA_MBPS_1AU * Math.min(25, 1 / (earthAU * earthAU)) * TIME_COMPRESSION) / 8 : 0,
    scan, drill, radar: parts.some((p) => p.radar) ? 90 : 25,
    uplink: parts.some((p) => p.uplink), cooling: parts.some((p) => p.cooling), jets,
    canSample, warnings: [],
  };
  if (cost > BUDGET) s.warnings.push(`Over budget by $${cost - BUDGET}M.`);
  for (const slot of ["chassis", "wheels", "motor", "battery"] as Slot[]) if (!get(slot)) s.warnings.push(`Missing ${SLOT_LABEL[slot].toLowerCase()}.`);
  if (!canSample) s.warnings.push("No laser or drill: you can't collect a single sample!");
  if (P.heat && !s.cooling) s.warnings.push("Venus will cook your electronics without a Cooling Loop.");
  if (night && pw?.solar) s.warnings.push(`It is night at the landing site right now: solar panels give 0 W and heaters draw ${heaterW} W.`);
  else if (night) s.warnings.push(`Night at the site: survival heaters draw ${heaterW} W.`);
  if (pw?.solar && P.transmission * solarFactor < 0.3)
    s.warnings.push(`Solar panels only get ${Math.round(P.transmission * solarFactor * 100)}% of 1 AU sunlight on the ${planet}'s surface.`);
  if (sinkage > 0.3) s.warnings.push(`${Math.round(groundKPa)} kPa ground pressure: the wheels sink in, rolling resistance +${Math.round(sinkage * 100)}%.`);
  if (wh && mo && climb < 15) s.warnings.push(`Only climbs ${climb}° slopes: ${Math.round(weightN)} N of weight vs ${Math.round(Math.min(mu * weightN, forceN))} N of drive.`);
  if (P.airDensity > 10 && topSpeed > 0) s.warnings.push(`Air drag at ${(topSpeed * 3.6).toFixed(0)} km/h: ${Math.round(0.5 * P.airDensity * CDA * topSpeed ** 2)} N.`);
  if (!s.uplink) s.warnings.push(`No antenna: samples only count once you drive back within ${RELAY_RANGE} m of the lander's UHF relay.`);
  if (!navcam) s.warnings.push("No navcams: you only see samples within 25 m and nothing stops you hitting rocks.");
  if (endurance < 60) s.warnings.push(`Only ~${Math.round(endurance)} s of full-throttle driving.`);
  if (mo && accel < 0.3) s.warnings.push("Barely moves: motors too weak for this mass and ground.");
  if (jets && hops < 3) s.warnings.push(`Jump-jet gas only lifts this ${mass} kg rover ${hops} times.`);
  return s;
}

export function buildReady(s: RoverStats) {
  return s.cost <= BUDGET && s.hp > 0 && s.accel > 0 && s.capacity > 0 && s.wheelR > 0;
}
