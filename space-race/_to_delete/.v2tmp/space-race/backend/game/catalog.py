"""
Seed data for the component catalog and missions.

Pure Python (no Django imports) so the simulation can be unit-tested on its own.
`python manage.py seed_catalog` loads these into Postgres.

Units
-----
cost            millions of USD ($M)
mass            kg (dry mass of the part)
power_draw      W while the part is operating
reliability     0..1 chance the part itself does not fail
stock           how many copies exist in the SHARED draft pool per match

Category specific `specs`
-------------------------
launch      thrust_kn, rocket_mass_t (fueled rocket, excluding payload), payload_leo_kg
power       gen_w (at 1 AU for solar), solar (bool)
battery     battery_wh
instrument  data_gb_day, quality (science value per GB), tags
storage     storage_gb
comms       downlink_mbps (at 1 AU)
propulsion  isp_s, propellant_kg, cruise_power_w (electric propulsion only)
thermal     thermal_rating
"""

COMPONENTS = [
    # ---------------- LAUNCH VEHICLES ----------------
    dict(slug="kestrel-light", name="Kestrel Light Launcher", category="launch", cost=70, mass=0,
         power_draw=0, reliability=0.93, stock=2,
         description="Small, cheap rocket. Fine for light probes, but every kg counts.",
         specs=dict(thrust_kn=1200, rocket_mass_t=88, payload_leo_kg=2200)),
    dict(slug="phoenix-reusable", name="Phoenix Reusable Booster", category="launch", cost=95, mass=0,
         power_draw=0, reliability=0.96, stock=1,
         description="Flight-proven reusable medium lifter. The bargain of the pool - only one available.",
         specs=dict(thrust_kn=4100, rocket_mass_t=325, payload_leo_kg=7500)),
    dict(slug="condor-medium", name="Condor Medium Launcher", category="launch", cost=140, mass=0,
         power_draw=0, reliability=0.97, stock=2,
         description="Reliable workhorse with lots of margin.",
         specs=dict(thrust_kn=4600, rocket_mass_t=335, payload_leo_kg=9500)),
    dict(slug="titan-heavy", name="Titan Heavy Lift", category="launch", cost=240, mass=0,
         power_draw=0, reliability=0.95, stock=1,
         description="Lifts anything. Eats your budget.",
         specs=dict(thrust_kn=12500, rocket_mass_t=920, payload_leo_kg=26000)),

    # ---------------- POWER ----------------
    dict(slug="gaas-solar", name="GaAs Triple-Junction Solar Array", category="power", cost=30, mass=22,
         power_draw=0, reliability=0.99, stock=1,
         description="Light, high-efficiency cells. Solar output falls with distance from the Sun squared.",
         specs=dict(gen_w=600, solar=True)),
    dict(slug="silicon-solar", name="Silicon Solar Array", category="power", cost=15, mass=55,
         power_draw=0, reliability=0.98, stock=2,
         description="Cheap and heavy older-generation panels.",
         specs=dict(gen_w=420, solar=True)),
    dict(slug="rollout-solar", name="Roll-Out Solar Array (Large)", category="power", cost=50, mass=60,
         power_draw=0, reliability=0.97, stock=1,
         description="Huge deployable wings. Lots of power, deployment can jam.",
         specs=dict(gen_w=1300, solar=True)),
    dict(slug="mmrtg", name="MMRTG Nuclear Generator", category="power", cost=110, mass=45,
         power_draw=0, reliability=0.995, stock=1,
         description="Radioisotope power. Works in eclipse and far from the Sun, no batteries needed for it.",
         specs=dict(gen_w=110, solar=False)),
    dict(slug="legacy-rtg", name="Legacy Heavy Power Generator", category="power", cost=65, mass=130,
         power_draw=0, reliability=0.99, stock=2,
         description="Old, heavy radioisotope generator. Constant power, terrible mass.",
         specs=dict(gen_w=240, solar=False)),

    # ---------------- BATTERIES ----------------
    dict(slug="liion-300", name="Li-ion Pack 300 Wh", category="battery", cost=5, mass=8,
         power_draw=0, reliability=0.99, stock=3,
         description="Covers the spacecraft during eclipses when solar arrays see nothing.",
         specs=dict(battery_wh=300)),
    dict(slug="liion-900", name="Li-ion Pack 900 Wh", category="battery", cost=12, mass=22,
         power_draw=0, reliability=0.98, stock=2,
         description="Bigger pack, more mass.",
         specs=dict(battery_wh=900)),
    dict(slug="nih2-450", name="NiH2 Battery 450 Wh", category="battery", cost=4, mass=32,
         power_draw=0, reliability=0.995, stock=3,
         description="Cheap, bulletproof, heavy.",
         specs=dict(battery_wh=450)),
    dict(slug="solidstate-750", name="Solid-State Battery 750 Wh", category="battery", cost=28, mass=10,
         power_draw=0, reliability=0.97, stock=1,
         description="Best energy density in the pool.",
         specs=dict(battery_wh=750)),

    # ---------------- INSTRUMENTS ----------------
    dict(slug="hires-camera", name="HiRes Imaging Camera (30 cm/px)", category="instrument", cost=60, mass=65,
         power_draw=60, reliability=0.97, stock=1,
         description="Spectacular images. Produces a flood of data - you will need storage and a fat downlink.",
         specs=dict(data_gb_day=10, quality=1.5, tags=["imaging"])),
    dict(slug="context-camera", name="Context Camera (6 m/px)", category="instrument", cost=15, mass=4,
         power_draw=10, reliability=0.99, stock=2,
         description="Wide, low-res images. Light and frugal.",
         specs=dict(data_gb_day=2, quality=0.8, tags=["imaging"])),
    dict(slug="multispectral", name="Multispectral Imager", category="instrument", cost=40, mass=15,
         power_draw=25, reliability=0.98, stock=1,
         description="Images in many wavelengths - counts as imaging AND spectroscopy.",
         specs=dict(data_gb_day=4, quality=1.0, tags=["imaging", "spectrometer"])),
    dict(slug="uvir-spectrometer", name="UV/IR Atmospheric Spectrometer", category="instrument", cost=45, mass=20,
         power_draw=30, reliability=0.98, stock=1,
         description="Measures gas composition in planetary atmospheres.",
         specs=dict(data_gb_day=1.5, quality=1.4, tags=["spectrometer"])),
    dict(slug="mass-spec", name="Neutral Mass Spectrometer", category="instrument", cost=30, mass=35,
         power_draw=40, reliability=0.98, stock=2,
         description="Sniffs atmospheric molecules directly. Heavy and power hungry.",
         specs=dict(data_gb_day=0.6, quality=1.6, tags=["spectrometer"])),
    dict(slug="radar", name="Ground-Penetrating Radar", category="instrument", cost=55, mass=40,
         power_draw=120, reliability=0.97, stock=1,
         description="Sees ice beneath the surface. Massive power draw.",
         specs=dict(data_gb_day=5, quality=1.2, tags=["radar"])),
    dict(slug="neutron-spec", name="Neutron Spectrometer", category="instrument", cost=20, mass=10,
         power_draw=8, reliability=0.99, stock=2,
         description="Detects hydrogen (water ice) from orbit. Low data rate.",
         specs=dict(data_gb_day=0.4, quality=2.0, tags=["neutron"])),

    # ---------------- STORAGE ----------------
    dict(slug="flash-32", name="Flash Recorder 32 GB", category="storage", cost=4, mass=3,
         power_draw=3, reliability=0.99, stock=3,
         description="Small buffer between instruments and downlink.",
         specs=dict(storage_gb=32)),
    dict(slug="ssr-256", name="Solid State Recorder 256 GB", category="storage", cost=15, mass=8,
         power_draw=10, reliability=0.98, stock=2,
         description="Holds several days of high-res imaging.",
         specs=dict(storage_gb=256)),
    dict(slug="archive-1tb", name="Archive Recorder 1 TB", category="storage", cost=30, mass=15,
         power_draw=15, reliability=0.97, stock=1,
         description="Almost never fills up.",
         specs=dict(storage_gb=1024)),

    # ---------------- COMMS ----------------
    dict(slug="uhf-lga", name="UHF Low-Gain Antenna", category="comms", cost=5, mass=3,
         power_draw=15, reliability=0.99, stock=3,
         description="Always works, barely trickles data. Signal strength drops with distance squared.",
         specs=dict(downlink_mbps=0.25)),
    dict(slug="xband-hga", name="X-Band High-Gain Antenna", category="comms", cost=30, mass=25,
         power_draw=60, reliability=0.98, stock=2,
         description="Standard deep-space dish.",
         specs=dict(downlink_mbps=2)),
    dict(slug="kaband-hga", name="Ka-Band High-Gain Antenna", category="comms", cost=55, mass=35,
         power_draw=120, reliability=0.97, stock=1,
         description="4x the bandwidth of X-band. Needs serious power.",
         specs=dict(downlink_mbps=8)),
    dict(slug="laser-comm", name="Optical Laser Comm Terminal", category="comms", cost=90, mass=30,
         power_draw=90, reliability=0.90, stock=1,
         description="Experimental. Enormous bandwidth if it works.",
         specs=dict(downlink_mbps=40)),

    # ---------------- PROPULSION ----------------
    dict(slug="hydrazine", name="Hydrazine Monoprop Pack", category="propulsion", cost=18, mass=40,
         power_draw=0, reliability=0.99, stock=3,
         description="Simple thruster + 250 kg propellant. Low efficiency (Isp 220 s).",
         specs=dict(isp_s=220, propellant_kg=250, cruise_power_w=0)),
    dict(slug="biprop", name="Bipropellant Main Engine", category="propulsion", cost=45, mass=90,
         power_draw=0, reliability=0.98, stock=2,
         description="Proper orbit-insertion engine + 600 kg propellant (Isp 320 s).",
         specs=dict(isp_s=320, propellant_kg=600, cruise_power_w=0)),
    dict(slug="ion", name="Xenon Ion Thruster", category="propulsion", cost=80, mass=60,
         power_draw=0, reliability=0.96, stock=1,
         description="Isp 3000 s: tiny propellant mass, but needs 500 W during cruise.",
         specs=dict(isp_s=3000, propellant_kg=90, cruise_power_w=500)),

    # ---------------- THERMAL ----------------
    dict(slug="mli", name="MLI Thermal Blankets", category="thermal", cost=3, mass=5,
         power_draw=0, reliability=1.0, stock=3,
         description="Basic insulation (rating 1).",
         specs=dict(thermal_rating=1)),
    dict(slug="radiators", name="Radiator Panels", category="thermal", cost=12, mass=20,
         power_draw=0, reliability=0.99, stock=2,
         description="Dumps excess heat (rating 2).",
         specs=dict(thermal_rating=2)),
    dict(slug="active-cooling", name="Sunshield + Active Cooling Loop", category="thermal", cost=40, mass=70,
         power_draw=50, reliability=0.97, stock=1,
         description="Survives near-Sun heat (rating 4). Heavy and draws power.",
         specs=dict(thermal_rating=4)),
]

MISSIONS = [
    dict(slug="mars-crater", name="Photograph Jezero Crater",
         destination="Mars", budget=380,
         objective="Return high-resolution imagery of Jezero Crater's ancient river delta.",
         sun_au=1.52, comm_au=1.5, insertion_dv=1400, lv_factor=0.22,
         eclipse_frac=0.35, orbit_hours=2.0, days=90, science_target=600,
         required_tags=["imaging"], thermal_req=1),
    dict(slug="venus-atmo", name="Analyze the Venusian Atmosphere",
         destination="Venus", budget=350,
         objective="Measure the composition of Venus's sulfuric-acid cloud layers.",
         sun_au=0.72, comm_au=0.9, insertion_dv=1100, lv_factor=0.26,
         eclipse_frac=0.40, orbit_hours=3.0, days=60, science_target=90,
         required_tags=["spectrometer"], thermal_req=4),
    dict(slug="lunar-ice", name="Map Lunar South Pole Ice",
         destination="Moon", budget=320,
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
