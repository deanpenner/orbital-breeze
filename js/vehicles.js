/* Real in-space stages and spacecraft for Free flight. Masses in kg, thrust in N, vacuum Isp in s.
   Figures are published ones (sources in the README) unless the name says otherwise.
   `payload` is only a starting value; the player can change it. */
(function (G) {
  'use strict';
  const V = G.Orbit.journey.VEHICLES;
  const one = (name, cargo, payload, dry, propMax, thrust, isp, stage) => ({ name, cargo, payload, stages: [{ name: stage || name, dry, propMax, isp, thrust }] });

  V.falcon9 = one('Falcon 9 second stage', 'satellite', 5500, 4000, 107500, 934000, 348);
  V.esca = one('Ariane 5 upper stage (ESC-A)', 'pair of satellites', 9500, 4540, 14900, 67000, 446);
  V.fregat = one('Fregat', 'satellite', 1500, 945, 5307, 19850, 333.2);
  V.star48 = one('Star 48B solid motor', 'probe', 1000, 124, 2011, 66700, 286);
  V.csm = one('Apollo command and service module', 'lunar module', 15100, 11670, 18410, 91000, 314, 'Service engine');
  V.orion = one('Orion with service module', '', 0, 16585, 8600, 26700, 315.1, 'Main engine');
  // Breeze-M burns from a ring-shaped extra tank first, then drops it. Its 2,370 kg of structure and
  // 19,800 kg of propellant are published; how the structure divides between tank and core is an estimate.
  V.breezem = {
    name: 'Breeze-M', cargo: 'satellite', payload: 6000,
    stages: [
      { name: 'Extra tank', dry: 420, propMax: 14600, isp: 326, thrust: 19620 },
      { name: 'Core', dry: 1950, propMax: 5200, isp: 326, thrust: 19620 },
    ],
  };
})(globalThis);
