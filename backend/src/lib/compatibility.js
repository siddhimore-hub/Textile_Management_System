// Fabric <-> yarn compatibility. The mapping lives in the `fabric_yarn_compatibility` table (editable in
// the app). A material's fibre family is read from its yarn_type by keyword, so e.g. 'cotton_30s' is cotton
// and 'poly_blend' is a polyester blend. If a fabric has no rules yet we allow anything (older free-text orders).
import { db } from './db.js';

const KEYWORDS = {
  cotton: ['cotton'],
  linen: ['linen', 'flax'],
  polyester: ['poly', 'polyester'],
  wool: ['wool'],
  silk: ['silk'],
  viscose: ['viscose', 'rayon'],
  nylon: ['nylon'],
  acrylic: ['acrylic'],
};

export function familiesOf(yarnType) {
  const t = String(yarnType || '').toLowerCase();
  return Object.entries(KEYWORDS).filter(([, words]) => words.some((w) => t.includes(w))).map(([f]) => f);
}

export const fabricRules = (fabricType) =>
  db.prepare('SELECT * FROM fabric_yarn_compatibility WHERE lower(fabric_type)=lower(?) ORDER BY yarn_type').all(String(fabricType || '').trim());

// Yarn families a fabric can be made from. null = no rule set for this fabric, so do not restrict.
export function allowedFamilies(fabricType) {
  const rules = fabricRules(fabricType);
  if (!rules.length) return null;
  return [...new Set(rules.map((r) => r.yarn_type))];
}

export function isCompatible(fabricType, yarnType) {
  const allowed = allowedFamilies(fabricType);
  if (!allowed) return true;
  const mine = familiesOf(yarnType);
  return mine.some((f) => allowed.includes(f));
}

export const isBlend = (fabricType) => (allowedFamilies(fabricType) || []).length > 1;
