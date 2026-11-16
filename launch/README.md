# Orbital Breeze: Launch

The third page of the game: from the pad to orbit. Open `launch.html`, or use the Launch / Earth /
Moon switch at the top right of any page.

A launch here is four choices: the **site**, the **heading** (a compass dial), how steeply to
**climb** (one slider), and the **orbit altitude**. Everything else follows from them and updates
as you drag:

- the path over the ground on a world map, with dashed lines at the furthest north and south the
  orbit reaches (which is its inclination);
- a side view of the climb, drawn to true scale;
- the inclination, with the part this latitude cannot reach hatched out;
- the payload the rocket can carry there, and where its delta-v goes: orbital speed, the help or
  cost of the Earth's spin, gravity, and air drag.

The ring around the compass shows what each heading can carry. Its width runs from half of the
rocket's best payload (inner edge) to all of it (outer edge); the true figures are written beside
it. The green arc is the range of headings the site really flies.

## Missions

1. **A free push**: due east from Cape Canaveral, the ground's 408 m/s is free.
2. **Nearer the equator**: the ground moves fastest where the Earth is widest.
3. **Up to the station**: the heading sets the inclination.
4. **Too far north**: no heading gets below the latitude of the pad.
5. **Over the poles**: south from Vandenberg, where the spin gives nothing.
6. **Against the spin**: west from Palmachim costs nearly a third of the payload.
7. **How steep?**: gravity loss on one side, air pressure on the other.
8. **Free launch**: any site, heading and orbit up to 2,000 km.

## How the physics works

`js/ascent.js` flies the rocket step by step (fourth-order Runge-Kutta, half-second steps) in the
plane of its orbit, with thrust, gravity, air drag and the curve of the Earth.

- **Earth's spin.** The rocket starts with the ground's eastward speed, 465 m/s times the cosine
  of the latitude. The part along the heading is a head start; the part across it has to be
  steered out, which costs a little. The air turns with the ground.
- **Inclination.** cos(inclination) = cos(latitude) × sin(heading).
- **First stage.** Straight up, then a pitch-over of the angle on the Climb slider, then a gravity
  turn: thrust held along the direction of flight while gravity bends the path.
- **Upper stage.** It steers so that it levels off at the insertion altitude just as it reaches
  the speed it needs there, with its upward push changing evenly over time (the linear-tangent
  steering that real launchers approximate).
- **Higher orbits.** Above 200 km the engine cuts off at 200 km on an ellipse reaching the target,
  and a second burn at the top makes the orbit circular.
- **Payload.** The heaviest payload that still reaches the orbit, found by bisection: about twenty
  flights per answer, a few milliseconds each.
- **Where the delta-v goes.** Orbital speed, minus the spin's help, plus air drag (summed along the
  flight), plus gravity (everything else: holding the rocket up while it climbs and turns). The
  four add up exactly to what the engines delivered.
- **Failure.** Past 45 kPa of air pressure the rocket breaks up, which is what stops a climb that
  is too shallow.

Tests: `node launch/test/ascent.test.mjs`.

## How far to trust it

| | The game | Published |
|---|---|---|
| Payload to 200 km, due east from Cape Canaveral | 23,300 kg | 22,800 kg |
| First-stage burn | 150 s | 162 s |
| Upper-stage burn | 387 s | 397 s |

For that flight the model's rocket supplies 9.0 km/s of delta-v, of which 1.6 km/s is lost to
gravity and 0.03 km/s to air drag, and it passes max Q (28 kPa) 11 km up. Payloads to other orbits and from other sites are the model's own, not published
figures: read them as comparisons between launches, which is what the page is for.

## What is simplified

- The climb is flown in one plane, and the heading on the dial is the direction of the orbit, not
  the slightly different direction the rocket points over the ground. Real flights also bend their
  path on the way up ("doglegs") to avoid land; these do not.
- One share of each stage's propellant, 1.5%, is held back as reserve and residue. That figure is
  an assumption, set once so that the reference payload lands near the published one. The drag
  coefficient (0.5) and the fairing mass (1,900 kg) are estimates too.
- Constant thrust: no throttling at max Q or late in the burn. Air density is one exponential.
- Every site flies the same rocket, so the comparison is between places, not between launchers.
- "Climbs out over open water" comes from a coarse map (coasts good to some tens of kilometres) and
  looks only as far as engine cutoff.
- The green arcs are what each range publishes or has flown. Sites with no arc have no published
  figure that I found.

## Sources

Rocket (Falcon 9 Block 5, expendable):
- Stage masses, thrust: https://en.wikipedia.org/wiki/Falcon_9_Block_5
- Specific impulse, burn times, vacuum thrust: https://en.wikipedia.org/wiki/Falcon_9_Full_Thrust
- Payload to low orbit, liftoff mass: https://www.spacex.com/vehicles/falcon-9/

Launch sites:
- Coordinates, Cape Canaveral's 35° to 120°, the reasons for each site's limits, and the 465 m/s
  figure: CSIS Aerospace Security Project, *Spaceports of the World* (2019),
  https://aerospace.csis.org/wp-content/uploads/2019/03/190313__SpaceportsOfTheWorld.pdf
- Vandenberg, 147° to 201°: National Security Space Road Map, Western Range,
  https://wslfweb.org/docs/roadmap/irm/internet/spforsup/init/html/westrang.htm
- Kourou, -10.5° to +91.5°: AIAA vehicle guide, Ariane,
  https://aiaa.org/vehicle-guide/vehicles/ariane/production-and-launch-operations
- Baikonur's inclinations of 51.5°, 64.8° and 72.6°: Proton Mission Planner's Guide, section 2,
  https://www.ilslaunch.com/wp-content/uploads/pdf/PMPG%20Section%202.pdf
- Kodiak, 110° to 220°: FAA, Spaceports by State, https://www.faa.gov/space/spaceports_by_state
- Mahia, 39° to Sun-synchronous: Rocket Lab,
  https://satellitetoday.com/launch/2016/09/27/rocket-lab-completes-first-orbital-launch-complex
- Sriharikota, 102° to 140°: https://spaceodysseyhub.com/spaceports/satish-dhawan-space-centre
  (a secondary source; I did not find the figure in an ISRO document)

Map: Natural Earth 1:110m land (public domain), simplified, by way of the `world-atlas` package.
