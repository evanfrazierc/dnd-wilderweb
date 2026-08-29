const ENCOUNTER_TABLES = {
  forest: ["wolves", "bandits", "owlbear", "treant", "nothing"],
  mountain: ["griffon", "rockslide", "goblins", "nothing"],
  swamp: ["will-o-wisp", "lizardfolk", "quicksand", "nothing"],
};

export function rollEncounter(terrain, rng = Math.random) {
  const table = ENCOUNTER_TABLES[terrain];
  if (!table) {
    throw new Error(`Unknown terrain: ${terrain}`);
  }
  const index = Math.floor(rng() * table.length);
  return table[index];
}

// Axial hex coordinates: https://www.redblobgames.com/grids/hexagons/#distances-axial
export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
