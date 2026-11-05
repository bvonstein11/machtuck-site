/* The four loadouts the site names, shared by the game page's bench (assets/bench.js) and the Hangar (hangar/hangar.js).
   Each key is a row of the Hangar's export (/hangar/hangar-data.json, written by the game): the arm weapons in the game's
   weapon order, then the shoulder, then the centre torso, which is the order of the Hangar's slots. The labels name the
   loadout, never a weight class: the VIGIL is a medium mech whatever it carries. "Overloaded" is the game's own word for a
   load past its maximum. */
window.VIGIL_LOADOUTS = Object.freeze([
  { label: "Basic", key: "PULSE-50+CHAIN-30+SLUG-250|VOLLEY-6|" },
  { label: "Lean", key: "PULSE-50+DART-20+THUMP-82|VOLLEY-6|" },
  { label: "Jump jets", key: "PULSE-50+DART-20+THUMP-82|VOLLEY-6|JumpJets" },
  { label: "Overloaded", key: "CHAIN-30+SLUG-250+SPIKE-90|BREACH-275|ArmorModule" },
]);
