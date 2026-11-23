export const criterionNames = ['Suchbezug', 'Herkunft dokumentiert', 'Prüfstatus angegeben', 'Fundstelle auffindbar', 'Originaltext verfügbar'];
export const defaults = Object.freeze([40, 20, 20, 10, 10]);
export function validateWeights(weights = defaults) {
  if (!Array.isArray(weights) || weights.length !== defaults.length ||
      weights.some(w => !Number.isInteger(w) || w < 0 || w > 100) ||
      weights.reduce((sum, w) => sum + w, 0) !== 100) {
    throw Object.assign(Error('Die fünf Kriterien müssen zusammen 100 Punkte ergeben.'), {status:400});
  }
  return weights;
}
