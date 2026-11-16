# Orbital Breeze

A calm puzzle for building intuition about orbits. You plan a journey as a chain of
burns and watch every later orbit reshape as you change an earlier step.

Twelve steps take you from stretching an orbit to plane changes and sun-synchronous
orbits. Free flight lets you start from eight real flights and change them.

## Play

Open `index.html` in a browser (`launch.html` for Launch, `moon.html` for the Moon). There is nothing to install or build.

- Pull the orange bead on a burn to change its size. It settles onto the burn that makes the orbit circular.
- Drag a numbered burn along its orbit to move it. It clicks onto apoapsis, periapsis and equator crossings.
- Click the final orbit, or use Add burn, to add the next burn.
- Click any number to type a value. Up and down arrows step it.
- Left and right arrows nudge the selected burn. Delete removes it. Ctrl+Z undoes. Space pauses.
- Scroll to zoom at the pointer and drag empty space to pan. Shift-drag (or right-drag) turns the view; the 3D button tilts it.

The bottom bar shows only what a step needs. More reveals everything:

- **Where**: periapsis, apoapsis, the ascending or descending node, or anywhere; and how far to coast first, in orbits or degrees.
- **Size**: delta-v, propellant and burn time are three views of the same burn. Click one to hold it. A burn held as propellant or burn time delivers a different delta-v when the craft's mass changes.
- **Direction**: prograde (along the path), radial (away from Earth) and plane change (swinging the path sideways).

Units and playback speed are under Settings.

## What is real

- Two-body Kepler orbits around Earth, drawn to scale, in three dimensions (`js/physics.js`).
- Burns are instantaneous. The orange arc under a burn shows how much of the orbit the engine would really be firing over.
- Propellant follows the rocket equation, stage by stage. A Stage separation step discards the spent stage.
- Reentry is taken as dropping below 100 km. Escape is leaving Earth's sphere of influence.
- The plane drift in the sun-synchronous step is the standard J2 formula.

Not modelled: the Moon's gravity, air drag, and thrust spread over time.

## Famous flights

Free flight can start from a real flight, which you can then alter to see why it was flown
that way. Orbits, inclinations and published masses are real. Each burn is sized so the model
reaches the published orbit after it; the test file then compares the model's burn times with
the real ones. Each flight says in the game which of its figures are estimates.

- Mangalyaan (2013): seven perigee burns to leave Earth. [Mars Orbiter Mission](https://en.wikipedia.org/wiki/Mars_Orbiter_Mission), [Planetary Society](https://www.planetary.org/articles/11300724-mars-orbiter-mission-ready)
- GSAT-29 (2018): three apogee firings from transfer orbit to geostationary. [GSAT-29](https://en.wikipedia.org/wiki/GSAT-29), [ISRO second firing](https://www.isro.gov.in/GSLV_Mk_IIID2GSAT.html), [ISRO third firing](https://www.isro.gov.in/The_third_and_final_orbit.html), [ISRO mission page](https://www.isro.gov.in/mission_GSLVMkIIID2.html)
- Proton and Breeze-M with Inmarsat-5 F2 (2015): four burns and a dropped tank. [ILS mission overview](https://www.ilslaunch.com/wp-content/uploads/2018/09/Inmarsat-5-F2-Mission-Overview-final.pdf), [ILS Breeze-M](https://www.ilslaunch.com/breeze-m/)
- Gemini 6A (1965): the first rendezvous. [Gemini 6A](https://en.wikipedia.org/wiki/Gemini_6A), [Oberg, rendezvous history](https://www.jamesoberg.com/gemini_2of3_thru_gt-6.pdf), [Drew Ex Machina](https://www.drewexmachina.com/2015/12/15/rendezvous-in-space-gemini-6-and-7/)
- Polaris Dawn (2024): up to 1,408 km and back down. [Polaris Dawn](https://en.wikipedia.org/wiki/Polaris_Dawn), [NASASpaceflight](https://www.nasaspaceflight.com/2024/09/polaris-dawn/), [SpaceNews](https://spacenews.com/?p=505897)
- New Glenn's first launch (2025). [Blue Origin](https://www.blueorigin.com/news/new-glenn-ng-1-mission), [Spaceflight Now](https://spaceflightnow.com/2025/01/15/live-coverage-blue-origin-to-launch-blue-ring-pathfinder-on-new-glenn-rocket-inaugural-launch-from-cape-canaveral/), [NASASpaceflight](https://www.nasaspaceflight.com/2025/04/blue-origin-gs2-test/)
- Vostok 1 (1961): [Vostok 1](https://en.wikipedia.org/wiki/Vostok_1), [S5.4 engine](https://en.wikipedia.org/wiki/S5.4)
- Soyuz TMA-20M landing (2016): [Spaceflight101](https://spaceflight101.com/soyuz-tma-20m/?p=567), [KTDU-80 engine](https://en.wikipedia.org/wiki/KTDU-80)

## Spacecraft

In Free flight the panel beside the propellant load lets you pick a real stage or spacecraft and set
its payload. Masses, thrust and efficiency are published figures:
[Centaur](https://en.wikipedia.org/wiki/Centaur_(rocket_stage)),
[Falcon 9](https://en.wikipedia.org/wiki/Falcon_9_Full_Thrust),
[Ariane 5](https://en.wikipedia.org/wiki/Ariane_5),
[Fregat](https://en.wikipedia.org/wiki/Fregat),
[Star 48](https://en.wikipedia.org/wiki/Star_48),
[Apollo CSM](https://en.wikipedia.org/wiki/Apollo_command_and_service_module),
[Orion service module](https://en.wikipedia.org/wiki/European_Service_Module),
[Crew Dragon](https://en.wikipedia.org/wiki/SpaceX_Dragon_2),
[Breeze-M](https://www.ilslaunch.com/breeze-m/),
[Inertial Upper Stage](https://en.wikipedia.org/wiki/Inertial_Upper_Stage).
Exceptions: New Glenn's second stage (masses unpublished, placeholders), and the Soyuz, Gemini,
GSAT-29 and Saturn third-stage entries, whose dry masses or propellant loads are estimates.

## Launch

`launch.html` is the step before all this: getting to orbit. Pick a launch site on a world map,
turn a compass dial to choose the heading, and set how steeply to climb. It shows what the Earth's
spin gives or costs, why a site's latitude limits the orbits it can reach, and where the delta-v
goes. See `launch/README.md`.

## The Moon

A second page, `moon.html`, adds the Moon: reaching it, timing the departure, a free return,
braking into lunar orbit and coming home, with Apollo 11 and Chandrayaan-3 as real flights.
The switch at the top right of each page moves between the two. See `moon/README.md`.

## Files

- `js/physics.js` orbit math
- `js/journey.js` vehicles, missions, and the chain of steps
- `js/vehicles.js` real stages and spacecraft
- `js/flights.js` famous flights
- `js/view.js` canvas drawing and camera
- `js/app.js` input, panels, undo, saving
- `test/physics.test.mjs` checks against textbook values, a working solution for every mission, and each flight against its published figures: `node test/physics.test.mjs`

The Figtree font in `fonts/` is under the SIL Open Font License (`fonts/OFL.txt`).
