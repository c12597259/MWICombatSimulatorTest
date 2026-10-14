import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const moduleFrom = async name => import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../src/' + name, import.meta.url), 'utf8')).toString('base64')}`);
const { abilityEffectsText } = await moduleFrom('abilityEffectsText.js');
const { normalizeLearnedAbilityLevels } = await moduleFrom('abilityLevels.js');
const abilities = JSON.parse(await readFile(new URL('../src/combatsimulator/data/abilityDetailMap.json', import.meta.url)));
const items = JSON.parse(await readFile(new URL('../src/combatsimulator/data/itemDetailMap.json', import.meta.url)));
const { inferAbilityWeaponProfile, isAbilityRecommended } = await moduleFrom('abilityRecommendations.js');
const text = (id, level) => abilityEffectsText(abilities['/abilities/' + id], level, (_, fallback) => fallback).join('\n');

test('tooltips scale damage and healing and distinguish flat stats from percentages', () => {
    assert.match(text('poke', 5), /10\.4 \+ 62\.4%/);
    assert.match(text('heal', 42), /42\.3 \+ 63\.45%/);
    assert.match(text('invincible', 1), /tenacity: \+700 ·/);
    assert.match(text('speed_aura', 1), /attack speed: \+3%/);
    assert.match(text('speed_aura', 1), /1 \+ 0\.005 × attack level/);
    for (const id of Object.keys(abilities)) assert.doesNotMatch(abilityEffectsText(abilities[id], 400, (_, fallback) => fallback).join(' '), /NaN|undefined|Infinity/);
});

test('learned-only filtering keeps imported membership separate from trial selections', () => {
    const data = { abilityLevels: { '/abilities/heal': 44, '/abilities/scratch': 1 }, learnedAbilityLevels: { '/abilities/heal': 42 }, abilities: [{ abilityHrid: '/abilities/scratch', level: 1 }] };
    assert.deepEqual(normalizeLearnedAbilityLevels(data), { '/abilities/heal': 42 });
    assert.deepEqual(normalizeLearnedAbilityLevels({ ...data, learnedAbilityLevels: {} }), {});
    assert.deepEqual(normalizeLearnedAbilityLevels({ abilities: { 0: { ability: '/abilities/heal', level: 42 } } }), { '/abilities/heal': 42 });
});

test('recommendations distinguish all nine weapon roles using combat metadata', () => {
    const cases = [
        ['verdant_sword', 'sword', 'cleave', 'poke'],
        ['verdant_spear', 'spear', 'poke', 'sweep'],
        ['verdant_mace', 'hammer', 'sweep', 'cleave'],
        ['verdant_bulwark', 'tank', 'shield_bash', 'fireball'],
        ['wooden_bow', 'bow', 'flame_arrow', 'fireball'],
        ['wooden_crossbow', 'crossbow', 'aqua_arrow', 'water_strike'],
        ['wooden_fire_staff', 'fire', 'fireball', 'ice_spear'],
        ['wooden_water_staff', 'water', 'ice_spear', 'entangle'],
        ['wooden_nature_staff', 'nature', 'entangle', 'fireball'],
    ];
    for (const [weapon, role, included, excluded] of cases) {
        const profile = inferAbilityWeaponProfile(items['/items/' + weapon]);
        assert.equal(profile.role, role);
        assert(isAbilityRecommended(abilities['/abilities/' + included], profile), weapon);
        assert(!isAbilityRecommended(abilities['/abilities/' + excluded], profile), weapon);
        for (const id of ['heal', 'revive', 'toughness', 'speed_aura', 'mystic_aura']) assert(isAbilityRecommended(abilities['/abilities/' + id], profile), `${weapon}: ${id}`);
        assert.equal(isAbilityRecommended(abilities['/abilities/taunt'], profile), role === 'tank');
    }
    const trident = inferAbilityWeaponProfile(items['/items/rippling_trident_refined']);
    assert.equal(trident.role, 'water');
    assert(!isAbilityRecommended(abilities['/abilities/poke'], trident));
    assert(!isAbilityRecommended(abilities['/abilities/berserk'], trident));
    assert(isAbilityRecommended(abilities['/abilities/elemental_affinity'], trident));
    assert.equal(inferAbilityWeaponProfile(items['/items/wooden_shield']), null);
    assert.equal(inferAbilityWeaponProfile(undefined), null);
    assert(isAbilityRecommended(abilities['/abilities/fireball'], null));
});
