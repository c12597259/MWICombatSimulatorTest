import { normalizeCharacterInput } from '../src/combatEngineInput.js';
import party from '../tests/fixtures/combat/synthetic-party.json';
import abilities from '../src/combatsimulator/data/abilityDetailMap.json';
import monsters from '../src/combatsimulator/data/combatMonsterDetailMap.json';
import items from '../src/combatsimulator/data/itemDetailMap.json';
import conditions from '../src/combatsimulator/data/combatTriggerConditionDetailMap.json';

const player = (index = 1, clean = false) => {
    const input = normalizeCharacterInput(party[String(index)], `player${index}`);
    if (clean) { input.abilities = []; input.food = []; input.drinks = []; }
    return { input, zoneHrid: '/actions/combat/pirate_cove', extra: { mooPass: true, comExp: 4, comDrop: 3 }, steps: [] };
};
const enemy = (hrid, difficultyTier = 2, roomLevel = 0) => ({ input: { kind: 'monster', hrid, difficultyTier, roomLevel }, steps: [] });
const base = (players = [player(1, true)], enemies = [enemy('/monsters/crab')]) => ({ players, enemies, seed: 1, maxEvents: 80, timeLimit: 180e9, setup: [], scheduled: [] });
const stable = run => {
    run.setup.push(...run.players.map((_, unit) => ({ unit, combatDetails: { maxHitpoints: 100_000, currentHitpoints: 80_000, maxManapoints: 100_000, currentManapoints: 80_000 } })),
        ...run.enemies.map((_, index) => ({ unit: run.players.length + index, combatDetails: { maxHitpoints: 1_000_000, currentHitpoints: 1_000_000 } })));
    return run;
};
const selected = (hrid, level = 1, triggers = []) => ({ hrid, level, triggers });
const withStat = (stat, index = 1) => {
    const result = player(index, true);
    const choices = Object.entries(items).filter(([, value]) => value.equipmentDetail?.combatStats?.[stat] > 0 && value.equipmentDetail?.type !== '/equipment_types/tool');
    choices.sort((a, b) => b[1].equipmentDetail.combatStats[stat] - a[1].equipmentDetail.combatStats[stat]);
    if (!choices.length) {
        if (!['physicalThorns', 'elementalThorns', 'retaliation', 'tenacity'].includes(stat)) throw new Error(`No public equipment for ${stat}`);
        result.input.guildBuffs.push({ uniqueHrid: `synthetic:${stat}`, typeHrid: '/buff_types/' + stat.replace(/[A-Z]/g, value => '_' + value.toLowerCase()), ratioBoost: 0, flatBoost: 0.6, duration: 0 });
        return result;
    }
    const [hrid, value] = choices[0], slot = value.equipmentDetail.type;
    result.input.equipment = result.input.equipment.filter(item => item.slot !== slot && !(slot === '/equipment_types/two_hand' && item.slot === '/equipment_types/main_hand'));
    result.input.equipment.push({ slot, hrid, enhancementLevel: 20 });
    return result;
};
const named = (name, request) => ({ name, request });

export function encounterGroups() {
    const natural = [];
    for (const hrid of Object.keys(monsters)) {
        for (const seed of [1, 0xffffffff]) natural.push(named(`${hrid}:${seed}`, { ...base([player(1), player(2), player(3)], [enemy(hrid)]), seed, maxEvents: 32 }));
    }
    for (const seed of [1, 7, 0xffffffff]) natural.push(named(`party-boss:${seed}`, { ...base([1, 2, 3, 4, 5].map(id => player(id)),
        ['/monsters/anchor_shark', '/monsters/captain_fishhook', '/monsters/acrobat'].map(hrid => enemy(hrid))), seed, maxEvents: 240 }));
    const skills = [];
    for (const hrid of Object.keys(abilities)) for (const level of [1, 20]) {
        const run = stable(base([player(1, true), player(2, true), player(3, true)], [enemy('/monsters/crab'), enemy('/monsters/crab')]));
        run.players[0].input.abilities = [selected(hrid, level)]; run.maxEvents = 20;
        if (abilities[hrid].abilityEffects.some(effect => effect.effectType === '/ability_effect_types/revive')) {
            run.setup.push({ unit: 1, combatDetails: { currentHitpoints: 0, currentManapoints: 0 }, flags: { isStunned: true, stunExpireTime: 2e9, isBlinded: true, blindExpireTime: 2e9, isSilenced: true, silenceExpireTime: 2e9 } });
        }
        skills.push(named(`${hrid}:${level}`, run));
    }
    const mechanics = [];
    for (const stat of ['parry', 'mayhem', 'pierce', 'curse', 'fury', 'weaken', 'blaze', 'bloom', 'ripple', 'lifeSteal', 'manaLeech', 'physicalThorns', 'elementalThorns', 'retaliation', 'foodHaste', 'drinkConcentration', 'abilityHaste', 'castSpeed', 'tenacity']) {
        const caster = withStat(stat);
        const run = stable(base([caster, player(2, true)], [enemy('/monsters/crab'), enemy('/monsters/crab')]));
        if (['blaze', 'bloom', 'ripple', 'abilityHaste', 'castSpeed'].includes(stat)) caster.input.abilities = [selected('/abilities/fireball', 20)];
        if (['foodHaste', 'drinkConcentration'].includes(stat)) {
            const profile = player(1); caster.input.food = profile.input.food; caster.input.drinks = profile.input.drinks;
        }
        run.maxEvents = 120; run.timeLimit = 600e9;
        mechanics.push(named(`property:${stat}`, run));
    }
    for (const resistance of [-120, -99, -1, 0, 200]) for (const style of ['stab', 'slash', 'smash', 'ranged', 'magic']) {
        const run = stable(base()); run.maxEvents = 12;
        run.setup.push({ unit: 0, combatDetails: { combatStats: { combatStyleHrid: `/combat_styles/${style}`, damageType: '/damage_types/physical', armorPenetration: 0.7, criticalRate: 0.5, lifeSteal: 0.2, manaLeech: 0.1 } }, flags: { isWeakened: true, weakenPercentage: 0.25 } },
            { unit: 1, combatDetails: { totalArmor: resistance, combatStats: { physicalThorns: 0.7, retaliation: 0.5 } } });
        mechanics.push(named(`resistance:${resistance}:${style}`, run));
    }
    for (const kind of ['stunExpiration', 'blindExpiration', 'silenceExpiration']) {
        const run = stable(base()); const flag = kind.slice(0, kind.indexOf('Expiration'));
        run.players[0].input.abilities = [selected('/abilities/fireball', 1, [{ dependencyHrid: '/combat_trigger_dependencies/self', conditionHrid: `/combat_trigger_conditions/${flag}_status`, comparatorHrid: '/combat_trigger_comparators/is_active', value: 0 }])];
        run.setup.push({ unit: 0, flags: { [`is${flag[0].toUpperCase() + flag.slice(1)}${flag === 'stun' ? 'ned' : flag === 'blind' ? 'ed' : 'd'}`]: true, [`${flag}ExpireTime`]: 1e9 } });
        run.scheduled.push({ kind, time: 1e9, unit: 0 }); run.maxEvents = 12;
        mechanics.push(named(`status-boundary:${flag}`, run));
    }
    for (const [type, resistance] of [['water', -70], ['nature', 0], ['fire', 140]]) {
        const run = stable(base()); run.maxEvents = 12;
        run.setup.push({ unit: 0, combatDetails: { magicAccuracyRating: 1e20, combatStats: { combatStyleHrid: '/combat_styles/magic', damageType: `/damage_types/${type}`, criticalRate: 1, [`${type}Penetration`]: 0.7 } } },
            { unit: 1, combatDetails: { [`total${type[0].toUpperCase() + type.slice(1)}Resistance`]: resistance, combatStats: { elementalThorns: 0.7, retaliation: 0.5 } }, lastUsed: [[0, 1e20]] });
        mechanics.push(named(`elemental-reflection:${type}:${resistance}`, run));
    }
    const respawn = stable(base([player(1, true), player(2, true)])); respawn.setup.push({ unit: 1, combatDetails: { currentHitpoints: 0 } });
    respawn.scheduled.push({ kind: 'playerRespawn', time: 1e9, unit: 1 }); respawn.maxEvents = 16;
    mechanics.push(named('player-respawn-keeps-identity', respawn));
    const dotSourceDies = stable(base([player(1, true), player(2, true)])); dotSourceDies.players[0].input.abilities = [selected('/abilities/maim', 20)];
    dotSourceDies.setup.push({ unit: 0, combatDetails: { currentHitpoints: 1, slashAccuracyRating: 1e20, slashEvasionRating: 0, stabEvasionRating: 0, smashEvasionRating: 0, combatStats: { lifeSteal: 0, threat: 1e20 } } },
        { unit: 2, combatDetails: { combatStats: { attackInterval: 1e9, mayhem: 0 }, stabAccuracyRating: 1e20, slashAccuracyRating: 1e20, smashAccuracyRating: 1e20 }, lastUsed: [[0, 1e20]] });
    dotSourceDies.maxEvents = 40;
    mechanics.push(named('dot-survives-source-death', dotSourceDies));
    for (const kind of ['furyExpiration', 'weakenExpiration']) {
        const run = stable(base()); run.maxEvents = 30;
        const fury = kind === 'furyExpiration';
        run.setup.push({ unit: 0, buffs: [{ uniqueHrid: fury ? '/buff_uniques/fury_damage' : '/buff_uniques/weaken', typeHrid: fury ? '/buff_types/damage' : '/buff_types/accuracy', ratioBoost: 0.1, flatBoost: 0, duration: 15e9 }],
            flags: fury ? {} : { isWeakened: true, weakenPercentage: 0.1, weakenExpireTime: 15e9 } });
        run.scheduled.push({ kind, time: 15e9, unit: 0 });
        mechanics.push(named(`stack-expiration:${kind}`, run));
    }
    const manaRecovery = stable(base()); manaRecovery.maxEvents = 40;
    manaRecovery.players[0].input.food = [{ hrid: '/items/apple_yogurt', triggers: [] }];
    manaRecovery.players[0].input.abilities = [selected('/abilities/fireball', 20), selected('/abilities/quick_shot', 1)];
    manaRecovery.setup.push({ unit: 0, combatDetails: { currentManapoints: 0 }, flags: { isOutOfMana: true } });
    mechanics.push(named('mana-recovery-awaits-next-attack', manaRecovery));
    const triggers = [];
    for (const hrid of Object.keys(conditions)) for (const dependency of ['self', 'targeted_enemy', 'all_allies', 'all_enemies']) {
        const key = hrid.split('/').pop();
        if (['number_of_active_units', 'number_of_dead_units', 'lowest_hp_percentage'].includes(key) && ['self', 'targeted_enemy'].includes(dependency)) continue;
        for (const comparator of ['is_active', 'is_inactive', 'greater_than_equal', 'less_than_equal']) {
            const run = stable(base([player(1, true), player(2, true)])); run.maxEvents = 3;
            run.players[0].input.abilities = [selected('/abilities/fireball', 1, [{ dependencyHrid: `/combat_trigger_dependencies/${dependency}`, conditionHrid: hrid, comparatorHrid: `/combat_trigger_comparators/${comparator}`, value: 0 }])];
            if (comparator === 'is_active') run.setup.push({ unit: 0, buffs: [{ uniqueHrid: `/buff_uniques/${key}`, typeHrid: '/buff_types/damage', ratioBoost: 0, flatBoost: 0, duration: 100e9 }] });
            triggers.push(named(`${dependency}:${key}:${comparator}`, run));
        }
    }
    return { natural, skills, mechanics, triggers };
}
export function mathCases() {
    const values = [0, -1, 1, 0.1, 0.2, 0.5, 1.5, 11, 1e-100, 1e100, Number.MIN_VALUE, Number.MAX_VALUE];
    for (let index = 1; index <= 10_000; index++) values.push(index / 7, index * 0.001 + 0.123456789);
    const cases = [{ op: 'pow', values }];
    for (const [min, max] of [[1, 1], [1.1, 1.9], [-2.5, -0.5], [0.25, 0.75], [1, 2], [1.2, 3.4], [1.9, 3.1], [0, 100], [11, 1.5], [-0.1, 0.1]]) {
        for (const seed of [0, 1, 7, 0xffffffff]) cases.push({ op: 'random_int', min, max, seed, draws: 128 });
    }
    for (const total of [0, 1, 10, 17.7, -5, 100.123456789]) for (const ticks of [1, 2, 3, 7]) cases.push({ op: 'tick', total, ticks });
    return cases;
}
