'use strict';
const crypto = require('node:crypto');
const GROUPS = ['colors', 'animals', 'emotions', 'accessories'];
const LAYERS = {animals: 'head', emotions: 'mood', accessories: 'accessory'};
const POLICY_KEYS = ['singleCharacterColor', 'twoCharacterColorAndEmotion', 'otherwise'];
const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = code => Object.assign(new Error(code), {status: 400, code});
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function keys(value, expected, code) {
  if (!object(value) || Object.keys(value).sort().join('\0') !== [...expected].sort().join('\0')) throw error(code);
}
function allowedWordOrders(color, emotion, policy) {
  return policy[[...color.label].length === 1 ? 'singleCharacterColor' : [...color.label].length === 2 && [...emotion.label].length === 2 ? 'twoCharacterColorAndEmotion' : 'otherwise'];
}
function createDefinitionModel(input) {
  const base = copy(input);
  if (base.mappingVersion !== 'refinetaste-assets-v3' || !base.manifestVersion || GROUPS.some(g => !Array.isArray(base[g]) || !base[g].length)) throw Error('Canonical v3 manifest required');
  const rows = Object.fromEntries(GROUPS.flatMap(group => base[group].map(row => [row.id, {...row, group}])));
  if (Object.keys(rows).length !== GROUPS.reduce((count, group) => count + base[group].length, 0)) throw Error('Duplicate stable ID');
  const assets = Object.fromEntries(Object.keys(LAYERS).flatMap(group => base[group].map(row => {
    const asset = row.asset;
    if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || !/^\/assets\/[a-zA-Z0-9_./-]+$/.test(asset.url) || asset.url.includes('..') || !['image/png','image/webp'].includes(asset.mimeType)) throw Error('Only registered verified image assets are supported');
    return [asset.id, {...copy(asset), layer: LAYERS[group], label: row.label, state: row.state}];
  })));
  const seed = {
    schemaVersion: 1,
    labels: Object.fromEntries(Object.values(rows).map(row => [row.id, row.label])),
    colors: Object.fromEntries(base.colors.map(row => [row.id, row.hex])),
    assetRefs: Object.fromEntries(Object.values(rows).filter(row => row.asset).map(row => [row.id, row.asset.id])),
    rules: {schemaVersion: 1, wordOrderPolicy: copy(base.wordOrderPolicy), emotionAccessories: Object.fromEntries(base.emotions.map(row => [row.id, row.accessoryId]))}
  };
  function normalize(value) {
    keys(value, ['schemaVersion','labels','colors','assetRefs','rules'], 'invalid_definition_keys');
    if (value.schemaVersion !== 1) throw error('unsupported_definition_version');
    keys(value.labels, Object.keys(seed.labels), 'stable_label_ids_required');
    keys(value.colors, Object.keys(seed.colors), 'stable_color_ids_required');
    keys(value.assetRefs, Object.keys(seed.assetRefs), 'stable_asset_ids_required');
    keys(value.rules, ['schemaVersion','wordOrderPolicy','emotionAccessories'], 'invalid_rule_keys');
    if (value.rules.schemaVersion !== 1) throw error('unsupported_rules_version');
    keys(value.rules.wordOrderPolicy, POLICY_KEYS, 'invalid_word_order_policy');
    keys(value.rules.emotionAccessories, Object.keys(seed.rules.emotionAccessories), 'stable_emotion_ids_required');
    const out = copy(seed);
    for (const row of Object.values(rows)) {
      const label = value.labels[row.id];
      if (typeof label !== 'string' || label !== label.normalize('NFC') || [...label].length < 1 || [...label].length > 8 || /[\s\p{C}<>"'`&{}]/u.test(label)) throw error('invalid_label');
      out.labels[row.id] = label;
    }
    for (const group of GROUPS) if (new Set(base[group].map(row => out.labels[row.id])).size !== base[group].length) throw error('duplicate_label');
    for (const id of Object.keys(seed.colors)) {
      if (typeof value.colors[id] !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value.colors[id])) throw error('invalid_color');
      out.colors[id] = value.colors[id].toLowerCase();
    }
    for (const id of Object.keys(seed.assetRefs)) {
      const asset = assets[value.assetRefs[id]], row = rows[id];
      if (!asset || asset.layer !== LAYERS[row.group]) throw error('unknown_or_wrong_layer_asset');
      if (row.state === 'active' && asset.state !== 'active') throw error('asset_not_activated');
      out.assetRefs[id] = asset.id;
    }
    for (const key of POLICY_KEYS) {
      const orders = value.rules.wordOrderPolicy[key];
      if (!Array.isArray(orders) || orders.length < 1 || orders.length > 2 || new Set(orders).size !== orders.length || orders.some(order => !['color_first','trait_first'].includes(order))) throw error('invalid_word_order');
      out.rules.wordOrderPolicy[key] = [...orders];
    }
    for (const row of base.emotions) {
      const accessory = rows[value.rules.emotionAccessories[row.id]];
      if (!accessory || accessory.group !== 'accessories' || (row.state === 'active' && accessory.state !== 'active')) throw error('invalid_emotion_accessory');
      out.rules.emotionAccessories[row.id] = accessory.id;
    }
    // Do not admit ambiguous newly generated display names. Existing identity IDs are never rewritten.
    const names = new Map();
    for (const color of base.colors.filter(x => x.state === 'active')) for (const emotion of base.emotions.filter(x => x.state === 'active')) for (const animal of base.animals.filter(x => x.state === 'active')) {
      const c = out.labels[color.id], e = out.labels[emotion.id], a = out.labels[animal.id];
      for (const order of allowedWordOrders({label:c}, {label:e}, out.rules.wordOrderPolicy)) {
        const name = (order === 'color_first' ? c + e : e + c) + a;
        const key = [color.id, emotion.id, animal.id, order].join('|');
        if (names.has(name) && names.get(name) !== key) throw error('ambiguous_display_name');
        names.set(name, key);
      }
    }
    return out;
  }
  function materialize(definition) {
    const manifest = copy(base);
    for (const group of GROUPS) for (const row of manifest[group]) {
      row.label = definition.labels[row.id];
      if (group === 'colors') row.hex = definition.colors[row.id];
      else {
        const asset = assets[definition.assetRefs[row.id]];
        const {layer,label,state,...metadata} = asset;
        row.asset = copy(metadata);
      }
    }
    // The original pairing and word-order contract remain in the manifest for stored identities.
    // New-generation rules are separate. No dynamic edit adds/removes/reorders stable IDs or activates assets.
    return manifest;
  }
  return {base, baseHash: digest(base), seed: normalize(seed), assets: Object.values(assets), normalize, materialize, allowedWordOrders};
}
module.exports = {createDefinitionModel, allowedWordOrders, digest, copy};
