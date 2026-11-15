/**
 * "It happened for real": every failure the simulator can produce, matched to a real mission
 * that hit the same engineering problem (or solved it). Shown in the flight director's debrief.
 */
import type { Lesson } from "./debrief";

export interface History {
  mission: string;
  year: string;
  agency: string;
  story: string;
  takeaway: string;
  solved?: boolean;      // true = a mission that got it RIGHT (shown in green)
}

const H: Record<string, History> = {
  cassini: {
    mission: "Cassini-Huygens", year: "1997", agency: "NASA / ESA / ASI",
    story: "At about 5,600 kg, Cassini was too heavy for any rocket to send straight to Saturn. It flew past Venus twice, Earth and Jupiter, stealing orbital energy at each flyby, and arrived after almost 7 years.",
    takeaway: "Mass decides your rocket, your route and your travel time.",
  },
  jwst: {
    mission: "James Webb Space Telescope", year: "2011", agency: "NASA / ESA / CSA",
    story: "Webb's cost grew to about $10 billion over its development, and in 2011 a House committee proposed cancelling it. It survived and launched in 2021, but the project had to be re-planned with bigger reserves.",
    takeaway: "Cost reserves aren't waste. They're how projects survive surprises.",
  },
  saturnV: {
    mission: "Saturn V", year: "1967-1973", agency: "NASA",
    story: "The Moon rocket lifted off with a thrust-to-weight of only about 1.16. That's why it rose so slowly off the pad, and every second spent climbing cost propellant to gravity losses.",
    takeaway: "Real rockets fly close to the limit. Below 1.0 they can't lift off at all.", solved: true,
  },
  oco: {
    mission: "Orbiting Carbon Observatory", year: "2009", agency: "NASA",
    story: "The Taurus XL's payload fairing failed to separate, and the extra weight kept the rocket from reaching orbit. The satellite was lost. NASA rebuilt it, and OCO-2 launched successfully in 2014.",
    takeaway: "Even good designs face launch risk. Proven rockets reduce it.",
  },
  parker: {
    mission: "Parker Solar Probe", year: "2018", agency: "NASA",
    story: "Parker flies closer to the Sun than any spacecraft. A carbon-composite heat shield faces around 1,400 °C while the instruments behind it stay near room temperature, and radiators dump the excess heat.",
    takeaway: "Thermal design (shields, MLI, radiators) is what lets hardware survive.", solved: true,
  },
  opportunity: {
    mission: "Opportunity rover", year: "2018", agency: "NASA",
    story: "A planet-wide dust storm blocked sunlight from Opportunity's solar panels. The rover's batteries ran down and it fell silent in June 2018. It had been designed for 90 sols and had worked for more than 14 years.",
    takeaway: "Solar power depends on distance, dust and weather. RTGs don't.",
  },
  insight: {
    mission: "InSight lander", year: "2022", agency: "NASA",
    story: "Dust slowly piled up on InSight's solar panels on Mars. Power fell month after month until the mission ended in December 2022.",
    takeaway: "Size your power with a margin for degradation, not just day-one output.",
  },
  juno: {
    mission: "Juno", year: "2016", agency: "NASA",
    story: "Jupiter's radiation belts are the harshest in the solar system, so Juno's most sensitive electronics sit inside a titanium 'radiation vault' that weighs about 200 kg.",
    takeaway: "Shielding costs mass, but without it electronics fail.", solved: true,
  },
  galileo: {
    mission: "Galileo", year: "1991", agency: "NASA",
    story: "Galileo's main umbrella-like high-gain antenna jammed and never fully opened. Engineers rescued the mission with the small low-gain antenna and new data compression, but the data rate fell from a planned 134 kbit/s to only about 160 bit/s.",
    takeaway: "Comms is a single point of failure. Backups and margin matter.",
  },
  akatsuki: {
    mission: "Akatsuki", year: "2010", agency: "JAXA",
    story: "During its Venus orbit insertion burn, Akatsuki's main engine failed and the probe sailed past Venus. Five years later, controllers tried again using the small attitude thrusters, and in December 2015 it finally entered orbit.",
    takeaway: "Orbit insertion is a one-shot burn: Δv margin and a healthy engine are everything.",
  },
  mco: {
    mission: "Mars Climate Orbiter", year: "1999", agency: "NASA",
    story: "One team's software reported thruster data in pound-force seconds while the navigation team expected newton-seconds. The orbiter arrived far too low and was lost in Mars's atmosphere.",
    takeaway: "Units matter. Always check the numbers going into your equations.",
  },
  mgs: {
    mission: "Mars Global Surveyor", year: "2006", agency: "NASA",
    story: "After a software error, the spacecraft turned so a battery radiator faced the Sun. The battery overheated and drained, and the orbiter was lost after nearly 10 years of work.",
    takeaway: "Batteries are delicate. Keep them in their temperature and discharge limits.",
  },
  kepler: {
    mission: "Kepler space telescope", year: "2012-2013", agency: "NASA",
    story: "Kepler needed 3 of its 4 reaction wheels to point precisely. When a second wheel failed, engineers balanced it against the pressure of sunlight and turned it into the new K2 mission.",
    takeaway: "Reliabilities multiply. Spares and clever operations save missions.",
  },
  mro: {
    mission: "Mars Reconnaissance Orbiter", year: "2006-today", agency: "NASA",
    story: "MRO's 3 m dish and HiRISE camera have returned more data than all earlier Mars missions combined. The antenna was sized to match the cameras, not the other way round.",
    takeaway: "Instruments, storage and downlink have to be designed together.", solved: true,
  },
  voyager: {
    mission: "Voyager 1 & 2", year: "1977-today", agency: "NASA",
    story: "Built for a 5-year tour of Jupiter and Saturn, both Voyagers are still sending data from interstellar space, powered by RTGs and helped by careful power management.",
    takeaway: "Good margins and reliable power turn a 5-year mission into a 45+ year one.", solved: true,
  },
  // rover-mode stories
  spirit: {
    mission: "Spirit rover", year: "2009-2010", agency: "NASA",
    story: "Spirit got stuck in soft soil at a spot called Troy. Unable to tilt its solar panels toward the low winter Sun, it ran out of power, and its last contact came in March 2010.",
    takeaway: "Rovers die from energy, not distance. Always keep a path back to power.",
  },
  venera: {
    mission: "Venera 13", year: "1982", agency: "Soviet space program",
    story: "Venera 13 landed on Venus and survived 127 minutes in 465 °C heat and 90 bar pressure, sending back the first colour pictures from the surface before its electronics cooked.",
    takeaway: "On Venus, thermal protection is the mission clock.",
  },
  schiaparelli: {
    mission: "Schiaparelli lander", year: "2016", agency: "ESA",
    story: "A sensor briefly saturated during descent, the software concluded the lander was already on the ground, and it released its parachute and shut off its thrusters too early. It crashed at high speed.",
    takeaway: "Hard landings and bad sensor data destroy hardware. Respect impact limits.",
  },
  msr: {
    mission: "Perseverance sample depot", year: "2022-2023", agency: "NASA",
    story: "Perseverance seals rock cores in tubes, and in 2022-2023 it left a depot of them on the surface. That science only pays off once a future mission brings the samples back to Earth.",
    takeaway: "Science only counts when it gets home, by radio or by return trip.",
  },
  oppyWin: {
    mission: "Opportunity rover", year: "2004-2018", agency: "NASA",
    story: "Planned to last 90 sols, Opportunity drove about 45 km over more than 14 years, the longest drive on another world at the time.",
    takeaway: "Careful energy management turns a short mission into a legend.", solved: true,
  },
  lrv: {
    mission: "Apollo Lunar Roving Vehicle", year: "1971-1972", agency: "NASA",
    story: "In the Moon's 1/6 gravity the Apollo rovers bounced and drifted. On Apollo 16 the 'Grand Prix' test drive showed wheels leaving the ground at speed. Low weight means low traction.",
    takeaway: "Gravity changes everything: grip, braking, landing loads.", solved: true,
  },
};

/** Pick the real-world story that matches a debrief lesson. */
export function historyFor(l: Lesson): History | undefined {
  const t = `${l.title} ${l.equation ?? ""} ${l.why}`.toLowerCase();
  if (l.tone === "good") return H.voyager;
  if (t.includes("too heavy") || t.includes("mass margin")) return H.cassini;
  if (t.includes("cost")) return H.jwst;
  if (t.includes("weak lift-off")) return H.saturnV;
  if (t.includes("rocket failure")) return H.oco;
  if (t.includes("overheat") || t.includes("thermal") || t.includes("heat balance")) return H.parker;
  if (t.includes("battery")) return H.mgs;
  if (t.includes("brownout") || t.includes("ran out of power") || t.includes("power balance")) return t.includes("cruise") ? H.insight : H.opportunity;
  if (t.includes("radiation")) return H.juno;
  if (t.includes("lost contact") || t.includes("link budget") || t.includes("antenna")) return H.galileo;
  if (t.includes("missed orbit") || t.includes("tsiolkovsky") || t.includes("δv")) return H.akatsuki;
  if (t.includes("component failure")) return H.kepler;
  if (t.includes("science")) return H.mro;
  return undefined;
}

/** Real-world story for a rover-expedition ending. */
export function roverHistory(reason: string, lostCargo: number, planet: string, maxAir: number): History[] {
  const r = reason.toLowerCase();
  const out: History[] = [];
  if (r.includes("battery")) out.push(H.spirit);
  if (r.includes("venus")) out.push(H.venera);
  if (r.includes("destroyed")) out.push(H.schiaparelli);
  if (lostCargo > 0) out.push(H.msr);
  if (planet === "Moon" && maxAir > 0.8) out.push(H.lrv);
  if (out.length === 0) out.push(planet === "Mars" ? H.oppyWin : planet === "Moon" ? H.lrv : H.venera);
  return out.slice(0, 2);
}

export { H as HISTORY };
