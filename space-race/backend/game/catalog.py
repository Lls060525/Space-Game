"""
Seed data for the component catalog and missions.

Pure Python (no Django imports) so the simulation can be unit-tested on its own.
`python manage.py seed_catalog` loads these into Postgres.

Units
-----
cost            millions of USD ($M): flight-unit price of the part. The full mission cost adds
                a mass-based bus CER, management/integration wrap, 25 % reserves, launch and
                operations (sim.cost_model). Launch prices are real 2020-2026 figures.
mass            kg (dry mass of the part)
power_draw      W while the part is operating
reliability     0..1 chance the part itself does not fail
stock           how many copies exist in the SHARED draft pool per match

Category specific `specs`
-------------------------
launch      thrust_kn, rocket_mass_t (fueled rocket, excluding payload), payload_leo_kg,
            upper_dry_kg + upper_isp_s (upper stage, for payload-to-C3 via the rocket equation)
power       gen_w (at 1 AU for solar, beginning of life), solar (bool), decay_per_yr (RTGs)
any         mga: mass growth allowance (fraction). Default by category in sim.MGA_DEFAULT;
            flight-proven hardware ~5 %, new technology 20-30 % (AIAA S-120).
battery     battery_wh
instrument  data_gb_day, quality (science value per GB), tags
storage     storage_gb
comms       downlink_mbps (at 1 AU)
propulsion  isp_s, propellant_kg, cruise_power_w (electric propulsion only)
thermal     insulation (MLI), reject_w (W of heat rejected), cold_leak_w (W lost in the cold)
"""

COMPONENTS = [
    # ---------------- LAUNCH VEHICLES ----------------
    # Real vehicles. cost = what a NASA science mission typically pays ($M), price_low/high = observed range.
    # payload_leo_kg / upper_dry_kg / upper_isp_s are calibrated so the upper-stage rocket equation in
    # sim.payload_to_c3 reproduces each rocket's published GTO / Mars numbers.
    dict(slug="f9-reusable", name="Falcon 9 (booster recovered)", category="launch", cost=74, mass=0,
         power_draw=0, reliability=0.99, stock=2,
         description="SpaceX 2026 list price $74M. Booster lands on a drone ship, so less performance than expendable.",
         specs=dict(thrust_kn=7607, rocket_mass_t=549, payload_leo_kg=17500, upper_dry_kg=5700, upper_isp_s=348,
                    price_low=74, price_high=110, ref="SpaceX Capabilities & Services 2026: $74M (5.5 t to GTO)")),
    dict(slug="f9-expendable", name="Falcon 9 (expendable)", category="launch", cost=100, mass=0,
         power_draw=0, reliability=0.99, stock=1,
         description="Throw the booster away for full performance: about 4 t to Mars.",
         specs=dict(thrust_kn=7607, rocket_mass_t=549, payload_leo_kg=22800, upper_dry_kg=5700, upper_isp_s=348,
                    price_low=95, price_high=130, ref="22.8 t LEO / 4,020 kg Mars (SpaceX); price is an estimate")),
    dict(slug="new-glenn", name="New Glenn", category="launch", cost=95, mass=0,
         power_draw=0, reliability=0.93, stock=1,
         description="Blue Origin. 45 t to LEO, launched NASA's ESCAPADE to Mars in Nov 2025. Young flight record.",
         specs=dict(thrust_kn=17100, rocket_mass_t=1350, payload_leo_kg=45000, upper_dry_kg=29500, upper_isp_s=445,
                    price_low=68, price_high=110, ref="Reported $68-110M per launch; 13 t to GTO")),
    dict(slug="vulcan-vc6", name="Vulcan Centaur VC6", category="launch", cost=165, mass=0,
         power_draw=0, reliability=0.97, stock=1,
         description="ULA, six solid boosters and a hydrogen Centaur V upper stage. Huge energy to Mars and Venus.",
         specs=dict(thrust_kn=15000, rocket_mass_t=860, payload_leo_kg=27200, upper_dry_kg=3000, upper_isp_s=454,
                    price_low=110, price_high=200, ref="27.2 t LEO / 14.4 t GTO; ~$100-200M depending on configuration")),
    dict(slug="falcon-heavy", name="Falcon Heavy (expendable core)", category="launch", cost=178, mass=0,
         power_draw=0, reliability=0.985, stock=1,
         description="Lifts anything here. NASA paid $117M (Psyche), $178M (Europa Clipper), $257M (Dragonfly, with RTG).",
         specs=dict(thrust_kn=22819, rocket_mass_t=1420, payload_leo_kg=63800, upper_dry_kg=7550, upper_isp_s=348,
                    price_low=117, price_high=257, ref="NASA launch contracts 2020-2024; 16.8 t to Mars")),

    # ---------------- POWER ----------------
    dict(slug="gaas-solar", name="GaAs Triple-Junction Solar Array", category="power", cost=6, mass=22,
         power_draw=0, reliability=0.99, stock=1,
         description="Light, high-efficiency cells. Solar output falls with distance from the Sun squared.",
         specs=dict(gen_w=600, solar=True, mga=0.08, ref="~$10k per watt, flight-qualified (estimate)")),
    dict(slug="silicon-solar", name="Silicon Solar Array", category="power", cost=2.5, mass=55,
         power_draw=0, reliability=0.98, stock=2,
         description="Cheap and heavy older-generation panels.",
         specs=dict(gen_w=420, solar=True, mga=0.05, ref="estimate")),
    dict(slug="rollout-solar", name="Roll-Out Solar Array (Large)", category="power", cost=12, mass=60,
         power_draw=0, reliability=0.97, stock=1,
         description="Huge deployable wings (ROSA, as on the ISS). Lots of power, deployment can jam.",
         specs=dict(gen_w=1300, solar=True, mga=0.20, ref="estimate")),
    dict(slug="mmrtg", name="MMRTG Nuclear Generator", category="power", cost=75, mass=45,
         power_draw=0, reliability=0.995, stock=1,
         description="Radioisotope power, ~2000 W of heat and 110 W of electricity. Needs extra nuclear launch approval (+$50M).",
         specs=dict(gen_w=110, solar=False, decay_per_yr=0.028, thermal_w=2000, mga=0.05,
                    ref="DOE: $75M for Perseverance's MMRTG; 45 kg, 110 W, 2.8 W/kg")),
    dict(slug="legacy-rtg", name="Legacy Heavy Power Generator", category="power", cost=45, mass=130,
         power_draw=0, reliability=0.99, stock=2,
         description="Old, heavy radioisotope generator. Constant power, terrible mass. Needs nuclear launch approval.",
         specs=dict(gen_w=240, solar=False, decay_per_yr=0.016, thermal_w=4000, mga=0.03, ref="estimate")),

    # ---------------- BATTERIES ----------------
    dict(slug="liion-300", name="Li-ion Pack 300 Wh", category="battery", cost=0.8, mass=8,
         power_draw=0, reliability=0.99, stock=3,
         description="Covers the spacecraft during eclipses when solar arrays see nothing.",
         specs=dict(battery_wh=300, ref="estimate")),
    dict(slug="liion-900", name="Li-ion Pack 900 Wh", category="battery", cost=1.8, mass=22,
         power_draw=0, reliability=0.98, stock=2,
         description="Bigger pack, more mass.",
         specs=dict(battery_wh=900, ref="estimate")),
    dict(slug="nih2-450", name="NiH2 Battery 450 Wh", category="battery", cost=1.2, mass=32,
         power_draw=0, reliability=0.995, stock=3,
         description="Cheap, bulletproof, heavy.",
         specs=dict(battery_wh=450, ref="estimate")),
    dict(slug="solidstate-750", name="Solid-State Battery 750 Wh", category="battery", cost=4, mass=10,
         power_draw=0, reliability=0.97, stock=1,
         description="Best energy density in the pool. New technology, so a big growth allowance.",
         specs=dict(battery_wh=750, mga=0.25, ref="estimate")),

    # ---------------- INSTRUMENTS ----------------
    dict(slug="hires-camera", name="HiRes Imaging Camera (30 cm/px)", category="instrument", cost=40, mass=65,
         power_draw=60, reliability=0.97, stock=1,
         description="HiRISE-class telescope. Produces a flood of data - you will need storage and a fat downlink.",
         specs=dict(data_gb_day=10, quality=1.5, tags=["imaging"], ref="HiRISE on MRO: $40M, 65 kg, 30 cm/px")),
    dict(slug="context-camera", name="Context Camera (6 m/px)", category="instrument", cost=10, mass=4,
         power_draw=10, reliability=0.99, stock=2,
         description="Wide, low-res images. Light and frugal (like MRO's CTX).",
         specs=dict(data_gb_day=2, quality=0.8, tags=["imaging"], ref="estimate")),
    dict(slug="multispectral", name="Multispectral Imager", category="instrument", cost=35, mass=15,
         power_draw=25, reliability=0.98, stock=1,
         description="Images in many wavelengths - counts as imaging AND spectroscopy.",
         specs=dict(data_gb_day=4, quality=1.0, tags=["imaging", "spectrometer"], ref="estimate")),
    dict(slug="uvir-spectrometer", name="UV/IR Atmospheric Spectrometer", category="instrument", cost=25, mass=20,
         power_draw=30, reliability=0.98, stock=1,
         description="Measures gas composition in planetary atmospheres.",
         specs=dict(data_gb_day=1.5, quality=1.4, tags=["spectrometer"], ref="estimate")),
    dict(slug="mass-spec", name="Neutral Mass Spectrometer", category="instrument", cost=22, mass=35,
         power_draw=40, reliability=0.98, stock=2,
         description="Sniffs atmospheric molecules directly (like MAVEN's NGIMS). Heavy and power hungry.",
         specs=dict(data_gb_day=0.6, quality=1.6, tags=["spectrometer"], ref="estimate")),
    dict(slug="radar", name="Ground-Penetrating Radar", category="instrument", cost=30, mass=40,
         power_draw=120, reliability=0.97, stock=1,
         description="Sees ice beneath the surface (like SHARAD / Mini-RF). Massive power draw.",
         specs=dict(data_gb_day=5, quality=1.2, tags=["radar"], ref="estimate")),
    dict(slug="neutron-spec", name="Neutron Spectrometer", category="instrument", cost=12, mass=10,
         power_draw=8, reliability=0.99, stock=2,
         description="Detects hydrogen (water ice) from orbit. Low data rate.",
         specs=dict(data_gb_day=0.4, quality=2.0, tags=["neutron"], ref="estimate")),

    # ---------------- STORAGE ----------------
    dict(slug="flash-32", name="Flash Recorder 32 GB", category="storage", cost=0.5, mass=3,
         power_draw=3, reliability=0.99, stock=3,
         description="Small buffer between instruments and downlink.",
         specs=dict(storage_gb=32, ref="estimate")),
    dict(slug="ssr-256", name="Solid State Recorder 256 GB", category="storage", cost=2, mass=8,
         power_draw=10, reliability=0.98, stock=2,
         description="Holds several days of high-res imaging, or a whole solar-conjunction blackout of light data.",
         specs=dict(storage_gb=256, ref="estimate")),
    dict(slug="archive-1tb", name="Archive Recorder 1 TB", category="storage", cost=4, mass=15,
         power_draw=15, reliability=0.97, stock=1,
         description="Almost never fills up.",
         specs=dict(storage_gb=1024, ref="estimate")),

    # ---------------- COMMS ----------------
    dict(slug="uhf-lga", name="UHF Low-Gain Antenna", category="comms", cost=1, mass=3,
         power_draw=15, reliability=0.99, stock=3,
         description="Always works, barely trickles data. Good backup: a spare antenna saves the mission if the dish fails.",
         specs=dict(downlink_mbps=0.25, ref="estimate")),
    dict(slug="xband-hga", name="X-Band High-Gain Antenna", category="comms", cost=12, mass=25,
         power_draw=60, reliability=0.98, stock=2,
         description="Standard deep-space dish.",
         specs=dict(downlink_mbps=2, ref="estimate")),
    dict(slug="kaband-hga", name="Ka-Band High-Gain Antenna", category="comms", cost=18, mass=35,
         power_draw=120, reliability=0.97, stock=1,
         description="4x the bandwidth of X-band. Needs serious power.",
         specs=dict(downlink_mbps=8, ref="estimate")),
    dict(slug="laser-comm", name="Optical Laser Comm Terminal", category="comms", cost=30, mass=30,
         power_draw=90, reliability=0.90, stock=1,
         description="Experimental (like DSOC on Psyche). Enormous bandwidth if it works.",
         specs=dict(downlink_mbps=40, mga=0.30, ref="NASA added $30M to the Discovery cost cap for laser comm")),

    # ---------------- PROPULSION ----------------
    dict(slug="hydrazine", name="Hydrazine Monoprop Pack", category="propulsion", cost=6, mass=40,
         power_draw=0, reliability=0.99, stock=3,
         description="Simple thruster + 250 kg propellant. Low efficiency (Isp 220 s).",
         specs=dict(isp_s=220, propellant_kg=250, cruise_power_w=0, ref="estimate")),
    dict(slug="biprop", name="Bipropellant Main Engine", category="propulsion", cost=20, mass=90,
         power_draw=0, reliability=0.98, stock=2,
         description="Proper orbit-insertion engine + 600 kg propellant (Isp 320 s).",
         specs=dict(isp_s=320, propellant_kg=600, cruise_power_w=0, ref="estimate")),
    dict(slug="ion", name="Xenon Ion Thruster", category="propulsion", cost=35, mass=60,
         power_draw=0, reliability=0.96, stock=1,
         description="Isp 3000 s: tiny propellant mass, but needs 500 W during cruise and spirals in slowly.",
         specs=dict(isp_s=3000, propellant_kg=90, cruise_power_w=500, mga=0.15, ref="estimate")),

    # ---------------- THERMAL ----------------
    # Real heat balance in sim.thermal(): absorbed sunlight + planet glow + electronics + RTG heat
    # must be rejected (hot case), and the cold case needs heater power unless insulated.
    dict(slug="mli", name="MLI Thermal Blankets", category="thermal", cost=1, mass=5,
         power_draw=0, reliability=1.0, stock=3,
         description="Multi-layer insulation. Blocks sunlight and keeps heat in, so heaters need far less power. Also traps heat.",
         specs=dict(insulation=True, ref="estimate")),
    dict(slug="radiators", name="Radiator Panels", category="thermal", cost=3, mass=20,
         power_draw=0, reliability=0.99, stock=2,
         description="Dump +350 W of heat to space. Also leak heat in the cold.",
         specs=dict(reject_w=350, cold_leak_w=60, ref="estimate")),
    dict(slug="active-cooling", name="Sunshield + Active Cooling Loop", category="thermal", cost=15, mass=70,
         power_draw=50, reliability=0.97, stock=1,
         description="Pumped fluid loop with louvers: rejects +900 W, closes in the cold. Heavy, draws 50 W.",
         specs=dict(reject_w=900, cold_leak_w=0, ref="estimate")),
]

# Launch price ranges by expedition are computed live from these (see sim.launch_options).

# budget = total mission cost cap in $M INCLUDING launch, 25 % reserves and operations.
# Real references: MRO $717M, MAVEN $671M, LRO $590M, LADEE $263M, Discovery AO cap $450M (+launch, ops).
MISSIONS = [
    dict(slug="mars-crater", name="Photograph Jezero Crater",
         destination="Mars", budget=800,
         objective="Return high-resolution imagery of Jezero Crater's ancient river delta.",
         sun_au=1.52, comm_au=1.5, insertion_dv=1400, lv_factor=0.22,
         eclipse_frac=0.35, orbit_hours=2.0, days=90, science_target=600,
         required_tags=["imaging"], thermal_req=1),
    dict(slug="venus-atmo", name="Analyze the Venusian Atmosphere",
         destination="Venus", budget=650,
         objective="Measure the composition of Venus's sulfuric-acid cloud layers.",
         sun_au=0.72, comm_au=0.9, insertion_dv=1100, lv_factor=0.26,
         eclipse_frac=0.40, orbit_hours=3.0, days=60, science_target=90,
         required_tags=["spectrometer"], thermal_req=4),
    dict(slug="lunar-ice", name="Map Lunar South Pole Ice",
         destination="Moon", budget=560,
         objective="Map water ice inside the permanently shadowed craters of the lunar south pole.",
         sun_au=1.0, comm_au=0.0026, insertion_dv=850, lv_factor=0.35,
         eclipse_frac=0.45, orbit_hours=2.0, days=120, science_target=220,
         required_tags=["radar", "neutron"], thermal_req=2),
]

CATEGORY_LABELS = {
    "launch": "Launch Vehicle",
    "power": "Power",
    "battery": "Battery",
    "instrument": "Science Instrument",
    "storage": "Data Storage",
    "comms": "Communications",
    "propulsion": "Propulsion",
    "thermal": "Thermal Control",
}
