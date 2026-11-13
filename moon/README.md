# Orbital Breeze: the Moon

The second page of Orbital Breeze, `moon.html`. It adds the Moon: reaching its distance, timing
the departure to meet it, swinging round it and home, braking into lunar orbit, and coming back.
The Earth page (`index.html`, `js/`) is not touched; this module keeps its own copies under `moon/`.

Open `moon.html` in a browser. There is nothing to install or build.

## Missions

1. **As far as the Moon**: one burn that lifts the far side of the orbit to 384,400 km.
2. **Meet the Moon**: move the burn round the parking orbit so the Moon is there on arrival.
3. **Round the Moon and back**: a free return, with no second burn.
4. **Stay**: drop the spent S-IVB and brake at the closest point into lunar orbit.
5. **Low and round**: bring a long lunar orbit down to a 110 km circle.
6. **Come home**: leave lunar orbit and meet the atmosphere between 5.5° and 7.5°.
7. **Free flight**, from low Earth orbit, low lunar orbit, Apollo 11 or Chandrayaan-3.

## Three views of one journey

Earth is 6,400 km in radius and the Moon is 384,400 km away, so no single true-scale picture can
show a parking orbit and the Moon together. The page shows the same journey three ways:

- **Earth**: the parking orbit, burns made near Earth, and the entry on the way home.
- **Journey**: Earth, the Moon's orbit, the path between them, the Moon now (a disc) and the Moon
  where it will be when the craft gets there (a ring, with the distance by which you miss).
- **Moon**: centred on the Moon and moving with it. The path bends round it here, and burns at the
  Moon are made here. The dotted circle is where the Moon's gravity takes over.

The view that belongs to the selected step is the large one. The other two stay beside it as small
pictures; click one (or press 1, 2 or 3) to bring it forward. Everything else works as on the Earth
page: pull a burn's bead, drag a burn along its orbit, click a path to add a burn, type into any
number, Undo, More and Less, Settings.

Drags settle onto exact values worth having: the burn that makes an orbit circular, the pass 110 km
above the Moon, and the path that meets the atmosphere at 6.5°.

## How the physics works

Patched conics, in the plane of the Moon's orbit (`js/lunar.js`). The craft follows a Kepler orbit
around Earth until it comes within 66,100 km of the Moon, then a Kepler orbit around the Moon, and
an Earth orbit again if it leaves. There is no step-by-step integration, so every edit is instant
and nothing depends on real time.

- Burns belong to a body, Earth or Moon, and are instantaneous. Stages, propellant, and holding a
  burn by delta-v, propellant or burn time work as on the Earth page.
- A Stage separation step discards the spent stage. Once the last stage is firing, the same step
  separates the cargo instead (Apollo's lander).
- Reentry is dropping below 100 km. The entry angle and speed are measured at 122 km, where Apollo
  quoted them.
- Preset burns in the missions and the famous flights are found when needed by bisection on the
  engine itself, so they always agree with the physics.

## What is simplified

- The Moon's orbit is a circle of 384,400 km and everything lies in its plane. The real orbit is an
  ellipse (356,000 to 407,000 km) tilted to most transfer paths, so real arrival speeds differ by a
  few percent.
- Patched conics are a few percent off near the edge of the Moon's sphere of influence. A path that
  only brushes that edge is not to be trusted.
- No Sun, no lunar mascons, no air drag. A closed orbit that misses the Moon on one orbit is taken
  to stay as it is, with a caution where that is not true (see below).
- The playback gives short legs a larger share of the loop than their length, so the minutes near
  Earth do not flash past. Within a leg time runs evenly.

## How far to trust it

`node moon/test/accuracy.mjs` flies the same journeys in a second model where Earth and the Moon
both pull all the time, integrated step by step, and prints the two side by side. What it shows:

| | The game | Both bodies pulling |
|---|---|---|
| Departure burn to pass 110 km above the Moon | 3,150 m/s | 3,150.7 m/s |
| Time to the Moon for that burn | 77.9 h | 76.3 h |
| Speed at the closest approach | 2.48 km/s | 2.50 km/s |
| Orbit after the game's 877 m/s braking burn | 110 × 110 km | 101 × 218 km |
| Journeys with one pass of the Moon that end the same way | | 164 of 190 |

So burn sizes and timings are good to one to three percent. The aim is another matter: flown with
exactly the game's burn, the true path passes several hundred kilometres from where the game puts
it, enough to hit the Moon instead of skimming it. Under a metre per second at departure puts that
right, which is what real flights' midcourse corrections are for. Read the game's numbers as "this is
the size and shape of the answer", not as a flight plan.

Three things the game marks because the simple model cannot be trusted there:

- **A second, unplanned meeting with the Moon.** After one pass the game's ending matches the fuller
  model about six times in seven. After a second it matched about one time in three, because the result turns
  on metres per second. The track is drawn fading toward the second meeting and not followed further.
- **Orbits the other body would undo.** An Earth orbit reaching past about 200,000 km has its low
  point moved by hundreds of kilometres within a few orbits; one that reaches the Moon's distance will
  meet the Moon sooner or later. A lunar orbit running with the Moon's motion is distorted above about
  20,000 km and pulled away above about 34,000 km (half as far again when it runs against the Moon's
  motion). These carry a note on the picture, and in Free flight a dashed line.
- **Escape.** A path that leaves Earth's sphere of influence fades out with an arrowhead.

## Famous flights

Each burn is sized so the model reaches the published orbit or timing after it, and the Moon's
starting angle is set so the model's flight meets it. The test file compares the rest with the
published figures. Each flight says in the game which figures are estimates.

**Apollo 11** (July 1969). Published and reproduced: parking orbit, 73.1 h from departure to the
Moon, the 111 km pass, 314 × 111 km after the first lunar burn, 122 × 101 km after the second, the
burn home 55 h later, 59.6 h to the atmosphere, entry at 6.48° and 11.03 km/s, and the 43,570 kg
stack at arrival. The model's burns against the real ones: departure 3,156 m/s (3,182), first lunar
burn 838 m/s (889), second 42 m/s (48.4), burn home 1,009 m/s (999). The first lunar burn is 6%
small because the model's Moon is nearer and slower than the real one was that week. The S-IVB's
dry mass and propellant are estimates.
Sources: NASA, *Apollo 11 Mission Report* (MSC-00171); NASA SP-4029,
[*Apollo by the Numbers*](https://history.nasa.gov/SP-4029/SP-4029.htm);
[Apollo 11](https://en.wikipedia.org/wiki/Apollo_11).

**Chandrayaan-3** (July and August 2023). Published and reproduced: the launch orbit, all five
Earth-bound orbits, the capture orbit (164 × 18,074 km), the four lowering orbits, and the orbits
between burns that the published dates imply. Two things differ, both because the Moon's orbit is a
circle here. The sixth burn reaches 378,000 km, not the real 369,328 km, since the Moon was near
its closest that week; and the capture burn lasts 1,526 s against the real 1,835 s, since the real
Moon was also moving faster. The trip from the sixth burn to the Moon takes 4.1 days against 4.8.
The orbits are shown in one plane; the real ones were inclined. The engine's specific impulse (315 s) is an
estimate; its 440 N thrust and the masses are published.
Sources: ISRO, [Chandrayaan-3](https://www.isro.gov.in/Chandrayaan3_Details.html);
[Chandrayaan-3](https://en.wikipedia.org/wiki/Chandrayaan-3);
[eoPortal](https://www.eoportal.org/satellite-missions/chandrayaan-3).

## Files

- `../moon.html` the page; it loads `../css/style.css` as is, then `moon.css`
- `moon.css` the small pictures and the Moon's colours
- `js/physics.js` the Earth page's orbit math, with gravity carried by each orbit
- `js/journey.js` the craft, and how a burn is described
- `js/lunar.js` the patched-conic engine
- `js/missions.js` missions, how each is judged, and what drags settle onto
- `js/flights.js` Apollo 11 and Chandrayaan-3
- `js/view.js` drawing: one renderer, three scenes, a camera per canvas
- `js/app.js` input, panels, undo, saving (under its own key, `orbital-breeze-moon-v1`)
- `test/lunar.test.mjs` the engine against textbook values, a working solution for every mission,
  and each flight against its published figures: `node moon/test/lunar.test.mjs`
