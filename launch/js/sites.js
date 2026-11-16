/* Orbital Breeze, Launch page: launch sites.
   lat and lon in degrees. What each site is allowed to fly, where a figure is published:
     sectors  headings, degrees clockwise from north
     incs     the few inclinations it serves (its headings follow from these)
     reach    a span of inclinations, and whether it gets there heading north or south
   Sites with none of these have no published figure I could find, only the reason in `why`.
   Sources are listed in launch/README.md. */
(function (G) {
  'use strict';
  const SITES = [
    { id: 'cape', name: 'Cape Canaveral', place: 'Florida, USA', lat: 28.6, lon: -80.6, sectors: [[35, 120]], side: 'right',
      why: 'Open Atlantic to the east. The crowded east coast lies to the north, the Caribbean to the south.' },
    { id: 'vandenberg', name: 'Vandenberg', place: 'California, USA', lat: 34.7, lon: -120.6, sectors: [[147, 201]], side: 'left',
      why: 'Open Pacific to the south. San Francisco is to the north and Los Angeles to the east.' },
    { id: 'kourou', name: 'Kourou', place: 'French Guiana', lat: 5.2, lon: -52.8, sectors: [[-10.5, 91.5]], side: 'right',
      why: 'Open Atlantic from north round to east, five degrees from the equator.' },
    { id: 'baikonur', name: 'Baikonur', place: 'Kazakhstan', lat: 46.0, lon: 63.3, incs: [51.5, 64.8, 72.6], side: 'right',
      why: 'Inland: spent stages must fall in agreed zones, so only a few fixed corridors are flown.' },
    { id: 'plesetsk', name: 'Plesetsk', place: 'Russia', lat: 62.9, lon: 40.6, side: 'left',
      why: 'Far north and inland: a few fixed corridors, with stages falling on Russian territory. It cannot reach an equatorial orbit directly.' },
    { id: 'sriharikota', name: 'Sriharikota', place: 'India', lat: 13.7, lon: 80.2, sectors: [[102, 140]], side: 'left',
      why: 'East over the Bay of Bengal. Sri Lanka lies due south, so polar launches start south-east and bend.' },
    { id: 'tanegashima', name: 'Tanegashima', place: 'Japan', lat: 30.4, lon: 131.0, side: 'right',
      why: 'An island with open Pacific to the east and south.' },
    { id: 'wenchang', name: 'Wenchang', place: 'Hainan, China', lat: 19.6, lon: 111.0, side: 'left',
      why: 'China’s most southerly site, on the coast: the best placed of its four for geostationary launches.' },
    { id: 'jiuquan', name: 'Jiuquan', place: 'Gobi Desert, China', lat: 41.0, lon: 100.3, side: 'right',
      why: 'Deep inland. Nothing it has launched flies at an inclination below its own latitude.' },
    { id: 'palmachim', name: 'Palmachim', place: 'Israel', lat: 31.9, lon: 34.7, side: 'left', west: true,
      why: 'Launches go west over the Mediterranean so that nothing flies over the countries to the east. It is the only site that flies only retrograde orbits.' },
    { id: 'mahia', name: 'Mahia', place: 'New Zealand', lat: -39.3, lon: 177.9, reach: [39.3, 98, 'south'], side: 'left',
      why: 'Empty Pacific from east round to south: anything from 39° to Sun-synchronous.' },
    { id: 'kodiak', name: 'Kodiak', place: 'Alaska, USA', lat: 57.4, lon: -152.3, sectors: [[110, 220]], side: 'right',
      why: 'Open water to the south and south-east: a site for polar and Sun-synchronous orbits.' },
  ];
  G.Orbit = G.Orbit || {}; G.Orbit.sites = SITES;
})(typeof window !== 'undefined' ? window : globalThis);
