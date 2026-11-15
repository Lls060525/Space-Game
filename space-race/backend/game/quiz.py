"""
Mission Control challenges: short questions about the physics the simulator actually uses.

In PvP the server grades answers (clients never see the answer key before answering), and a
correct answer adds QUIZ_BONUS $M to that player's cost cap, so understanding the physics is a
real competitive advantage. Both players get the same questions in the same order (seeded by
the match), so it stays fair.
"""
import random

QUIZ_BONUS = 10        # $M per correct answer
QUIZ_PER_MATCH = 3

QUESTIONS = [
    dict(id="rocket-eq", topic="Propulsion",
         q="You double a spacecraft's propellant. What happens to its Δv?",
         options=["It doubles", "It grows, but by less than double", "It quadruples", "Nothing changes"],
         answer=1,
         explain="Δv = Isp·g₀·ln(m_wet/m_dry). The logarithm grows slowly because every extra kilogram "
                 "of fuel also has to push the rest of the fuel. This is the 'tyranny of the rocket equation'."),
    dict(id="isp", topic="Propulsion",
         q="Which engine gets the most Δv out of the same mass of propellant?",
         options=["Hydrazine thruster (Isp 220 s)", "Bipropellant engine (Isp 320 s)",
                  "Xenon ion thruster (Isp 3000 s)", "They are all the same"],
         answer=2,
         explain="Δv is proportional to Isp, so ion engines are ~10× more fuel-efficient. The catch: tiny thrust. "
                 "NASA's Dawn used ion propulsion to orbit two different worlds, Vesta and Ceres."),
    dict(id="solar-mars", topic="Power",
         q="Mars is about 1.52 AU from the Sun. Compared with Earth orbit, a solar panel there produces about:",
         options=["100%", "66%", "43%", "10%"],
         answer=2,
         explain="Sunlight follows the inverse-square law: 1 / 1.52² ≈ 0.43. A Mars probe needs over twice "
                 "the panel area for the same power."),
    dict(id="solar-jupiter", topic="Power",
         q="Juno flies on solar power at Jupiter (5.2 AU). How much sunlight does it get compared with Earth?",
         options=["About 50%", "About 19%", "About 4%", "About 0.4%"],
         answer=2,
         explain="1 / 5.2² ≈ 0.037, so under 4%. That's why Juno carries three enormous solar arrays, and why most "
                 "outer-planet missions use RTGs instead."),
    dict(id="twr", topic="Launch",
         q="A rocket has a lift-off thrust-to-weight ratio of 0.9. What happens when the engines ignite?",
         options=["It climbs slowly", "It never leaves the pad", "It flies fine if it has enough fuel",
                  "It flies sideways"],
         answer=1,
         explain="TWR = thrust / weight. Below 1.0 the engines can't even lift the rocket's own weight. "
                 "Real rockets lift off at about 1.2-1.5."),
    dict(id="margin", topic="Mass",
         q="Why do NASA engineers insist on ≥15% launch mass margin early in a design?",
         options=["To carry souvenirs", "Spacecraft almost always get heavier during development",
                  "Rockets lose thrust as they age", "To bring fuel back to Earth"],
         answer=1,
         explain="Mass growth is the rule, not the exception: brackets, cables and fixes add up. A margin (on top of "
                 "a growth allowance) keeps the spacecraft from outgrowing its rocket."),
    dict(id="rtg", topic="Power",
         q="Why do Curiosity and Perseverance use an RTG (nuclear battery) instead of solar panels?",
         options=["It's cheaper", "It works day and night, through dust storms and winters",
                  "It's lighter than any solar panel", "It makes the cameras sharper"],
         answer=1,
         explain="An MMRTG turns plutonium-238 decay heat into ~110 W, constantly. Pu-238's half-life is 87.7 years, "
                 "so output fades slowly. Solar-powered Opportunity was lost to a 2018 dust storm."),
    dict(id="dod", topic="Battery",
         q="Why do Earth-orbit satellites only drain their batteries ~20-40% each eclipse?",
         options=["Deep discharges wear cells out over thousands of cycles", "Batteries explode past 41%",
                  "To save mass", "To keep the batteries cold"],
         answer=0,
         explain="A low-orbit satellite goes through about 5,500 eclipses a year. Cycle life falls steeply with "
                 "depth of discharge (our model: N ≈ 50 000·e^(−4.5·DoD)), so shallow cycles make batteries last years."),
    dict(id="link", topic="Comms",
         q="A probe moves twice as far from Earth. Its received radio signal becomes:",
         options=["Half as strong", "One quarter as strong", "Just as strong", "Twice as strong"],
         answer=1,
         explain="Radio waves spread over a sphere, so power falls with 1/d². Twice the distance = ¼ the signal, so "
                 "¼ the data rate with the same antenna."),
    dict(id="light-time", topic="Comms",
         q="Why can't Mars rovers be driven live with a joystick from Earth?",
         options=["Signals take about 3-22 minutes each way", "It's too expensive", "Mars blocks all radio",
                  "Rovers have no steering"],
         answer=0,
         explain="Light-time to Mars ranges from about 3 to 22 minutes one way. Rovers get a plan of commands each "
                 "day and use onboard autonomy to avoid hazards."),
    dict(id="radiate", topic="Thermal",
         q="In the vacuum of space, how does a spacecraft get rid of excess heat?",
         options=["Air cooling (convection)", "Radiating it away as infrared", "Conduction into the air",
                  "Venting fuel"],
         answer=1,
         explain="There's no air to carry heat away, so radiators emit it as infrared light. Radiated power grows "
                 "with T⁴ (Stefan-Boltzmann), so radiator area sets how much heat you can dump."),
    dict(id="venus", topic="Thermal",
         q="Venus's surface is about 465 °C, hotter than Mercury. Why?",
         options=["It's closer to the Sun than Mercury", "Its thick CO₂ atmosphere traps heat (greenhouse effect)",
                  "Active volcanoes", "It spins very fast"],
         answer=1,
         explain="Venus is farther from the Sun than Mercury, but its crushing CO₂ atmosphere traps heat. The Soviet "
                 "Venera 13 lander survived 127 minutes on the surface."),
    dict(id="mass-weight", topic="Mass",
         q="A 100 kg rover is moved from Earth to Mars (g = 3.72 m/s²). Its mass on Mars is:",
         options=["38 kg", "100 kg", "372 kg", "0 kg"],
         answer=1,
         explain="Mass never changes; weight does. On Mars it weighs 100 × 3.72 = 372 N (vs 981 N on Earth). "
                 "Less weight means less grip too: traction ∝ weight."),
    dict(id="window", topic="Launch",
         q="Launch windows to Mars open about once every:",
         options=["6 months", "1 year", "26 months", "11 years"],
         answer=2,
         explain="The Earth-Mars synodic period is ~26 months. Miss the window and you pay with a much higher "
                 "departure energy (C3), or you wait two years."),
    dict(id="reliability", topic="Reliability",
         q="A spacecraft needs 10 parts that are each 98% reliable. Its overall reliability is about:",
         options=["98%", "90%", "82%", "50%"],
         answer=2,
         explain="Reliabilities multiply: 0.98¹⁰ ≈ 0.82. That's why engineers add redundancy (backup antennas, "
                 "spare reaction wheels) and keep designs simple."),
    dict(id="downlink", topic="Comms",
         q="Your camera makes 10 GB/day but your antenna can only send 3 GB/day home. What happens?",
         options=["Data piles up in storage, then new data is lost when it's full", "The antenna speeds up",
                  "The camera automatically gets sharper", "Nothing, Earth stores it"],
         answer=0,
         explain="Instruments, storage and downlink must be sized together. Science only counts once it reaches "
                 "Earth; a bigger antenna needs more power, which means more mass..."),
    dict(id="cost", topic="Cost",
         q="What usually happens to a space mission's cost during development?",
         options=["It shrinks", "It grows, so projects keep reserves of ~25%", "It's fixed by law",
                  "It's refunded after launch"],
         answer=1,
         explain="Cost growth is common. The James Webb Space Telescope grew to about $10 billion and was nearly "
                 "cancelled in 2011. Reserves let a project absorb surprises."),
    dict(id="assist", topic="Launch",
         q="Cassini (~5,600 kg) was too heavy to send straight to Saturn. How did it get there?",
         options=["Refuelled in orbit", "Gravity assists from Venus (twice), Earth and Jupiter",
                  "A nuclear rocket", "A solar sail"],
         answer=1,
         explain="Each flyby 'borrowed' orbital energy from a planet. Gravity assists are free Δv, paid for "
                 "with extra years of travel."),
]

BY_ID = {q["id"]: q for q in QUESTIONS}


def public(q: dict) -> dict:
    """A question without the answer key."""
    return {k: q[k] for k in ("id", "topic", "q", "options")}


def pick_for_match(seed: str, n: int = QUIZ_PER_MATCH) -> list[str]:
    return [q["id"] for q in random.Random(f"quiz:{seed}").sample(QUESTIONS, n)]


def grade(question_id: str, choice: int) -> dict:
    q = BY_ID[question_id]
    correct = choice == q["answer"]
    return dict(question_id=question_id, choice=choice, answer=q["answer"], correct=correct,
                explain=q["explain"], bonus=QUIZ_BONUS if correct else 0)
