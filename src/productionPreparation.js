// Ordinary production only. Permanent source buffs are already resolved by the
// game; equipment and drinks are rebuilt for EACH profession, never combat gear.
export const PRODUCTION_ACTIONS = ['milking', 'foraging', 'woodcutting', 'cheesesmithing',
    'crafting', 'tailoring', 'cooking', 'brewing', 'alchemy'];
export const DEFAULT_PRODUCTION_SETTINGS = Object.freeze({ gatheringPercent: 29.5, efficiencyPercent: 19.7, includeTeaSupply: false });
// Rare gems come from general play rather than a dedicated production action.
// User assumption: raw gems are already available; crushing/processing still costs time.
export const PREPARED_PRODUCTION_MATERIALS = Object.freeze([
    '/items/amber', '/items/amethyst', '/items/garnet', '/items/moonstone', '/items/pearl', '/items/sunstone',
]);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const emptyMinutes = () => ({ gathering: 0, cooking: 0, brewing: 0, other: 0 });

export function resolveProductionLoadout(snapshot, actionType, choices = {}) {
    const candidates = (snapshot?.loadouts || []).filter(l => l.actionTypeHrid === actionType || l.actionTypeHrid === '');
    const preferred = choices[actionType] ?? snapshot?.productionChoices?.[actionType];
    let selected = candidates.find(l => l.loadoutId === preferred);
    let pool = candidates.filter(l => l.actionTypeHrid === actionType);
    if (!pool.length) pool = candidates.filter(l => l.actionTypeHrid === '');
    if (!preferred) {
        const defaults = pool.filter(l => l.isDefault);
        selected = defaults.length === 1 ? defaults[0] : pool.length === 1 ? pool[0] : null;
    }
    if (!selected) return { candidates, status: candidates.length || preferred ? 'choose-loadout' : 'missing-loadout' };
    // Tools left unspecified by a loadout stay equipped. Other wearable slots
    // are taken solely from that loadout, not from the current combat outfit.
    const equipment = new Map((snapshot.equipment || []).filter(i => i.itemLocationHrid.endsWith('_tool'))
        .map(i => [i.itemLocationHrid, i]));
    for (const item of selected.equipment || []) equipment.set(item.itemLocationHrid, item);
    const drinks = selected.actionTypeHrid === actionType && selected.drinks !== null
        ? selected.drinks : snapshot.drinks?.[actionType];
    return { candidates, selected, status: 'selected', equipment: [...equipment.values()], drinks };
}

export function buildProductionProfile(snapshot, settings = {}, data = {}) {
    const issues = new Set();
    const setups = {};
    const skills = Object.fromEntries((snapshot?.skills || []).map(s => [s.skillHrid, s.level]));
    if (snapshot?.schemaVersion !== 1) issues.add('missing-profile');
    for (const action of PRODUCTION_ACTIONS) {
        const hrid = `/action_types/${action}`;
        const setup = resolveProductionLoadout(snapshot, hrid, settings.choices);
        if (Array.isArray(settings.drinks?.[hrid])) setup.drinks = settings.drinks[hrid];
        const errors = [];
        if (setup.status !== 'selected') errors.push(`${setup.status}:${hrid}`);
        if (!snapshot?.complete) errors.push('incomplete-profile');
        if (skills[`/skills/${action}`] === undefined) errors.push(`missing-skill:${hrid}`);
        if (!Array.isArray(setup.drinks)) errors.push(`missing-drinks:${hrid}`);
        const stats = {};
        for (const item of setup.equipment || []) {
            const slot = item.itemLocationHrid;
            if (slot.endsWith('_tool') && slot !== `/item_locations/${action}_tool`) continue;
            const detail = data.itemDetailMap?.[item.itemHrid]?.equipmentDetail;
            const multiplier = data.enhancementMultipliers?.[item.enhancementLevel];
            if (!detail || multiplier === undefined) { errors.push(`unknown-equipment:${item.itemHrid}`); continue; }
            if (item.unresolved) errors.push(`unavailable-equipment:${item.itemHrid}`);
            for (const [key, base] of Object.entries(detail.noncombatStats || {})) {
                stats[key] = (stats[key] || 0) + base + number(detail.noncombatEnhancementBonuses?.[key]) * multiplier;
            }
        }
        const buffs = [];
        for (const source of ['house', 'guild', 'achievement', 'mooPass']) {
            if (!snapshot?.permanentBuffs?.[source]) errors.push(`missing-buffs:${source}`);
            buffs.push(...(snapshot?.permanentBuffs?.[source]?.[hrid] || []));
        }
        const sum = (type, field = 'flatBoost') => buffs.filter(b => b.typeHrid === `/buff_types/${type}`)
            .reduce((total, b) => total + number(b[field]), 0);
        const concentration = Math.max(0, number(stats.drinkConcentration));
        const drinks = [];
        const seenDrinks = new Set();
        for (const drink of setup.drinks || []) {
            if (!drink.itemHrid) continue;
            if (seenDrinks.has(drink.itemHrid)) { errors.push(`duplicate-drink:${drink.itemHrid}`); continue; }
            seenDrinks.add(drink.itemHrid);
            const detail = data.itemDetailMap?.[drink.itemHrid]?.consumableDetail;
            if (!detail?.usableInActionTypeMap?.[hrid]) { errors.push(`invalid-drink:${drink.itemHrid}`); continue; }
            for (const buff of detail.buffs || []) buffs.push({ ...buff,
                flatBoost: number(buff.flatBoost) * (1 + concentration),
                ratioBoost: number(buff.ratioBoost) * (1 + concentration) });
            const duration = Math.max(...(detail.buffs || []).map(b => number(b.duration)), 0) / 1e9;
            if (!duration) errors.push(`unknown-duration:${drink.itemHrid}`);
            else drinks.push({ itemHrid: drink.itemHrid, perHour: 3600 * (1 + concentration) / duration });
        }
        const gatheringPercent = Math.max(0, Math.min(100, number(settings.gatheringPercent, DEFAULT_PRODUCTION_SETTINGS.gatheringPercent)));
        const efficiencyPercent = Math.max(0, Math.min(100, number(settings.efficiencyPercent, DEFAULT_PRODUCTION_SETTINGS.efficiencyPercent)));
        setups[hrid] = { ...setup, issues: [...new Set(errors)], drinks,
            baseLevel: skills[`/skills/${action}`],
            boostedLevel: number(skills[`/skills/${action}`]) * (1 + sum(`${action}_level`, 'ratioBoost')) + sum(`${action}_level`),
            actionLevel: sum('action_level'),
            speed: number(stats.skillingSpeed) + number(stats[`${action}Speed`]) + sum('action_speed'),
            efficiency: number(stats.skillingEfficiency) + number(stats[`${action}Efficiency`]) + sum('efficiency')
                + (['milking', 'foraging', 'woodcutting'].includes(action) ? 0 : efficiencyPercent / 100),
            gathering: number(stats.gatheringQuantity) + sum('gathering') + gatheringPercent / 100,
            gourmet: sum('gourmet'), artisan: sum('artisan'), processing: sum('processing'),
        };
    }
    return { setups, issues: [...issues], capturedAt: snapshot?.capturedAt || '' };
}

function sourceIndex(actions) {
    const index = new Map();
    for (const action of Object.values(actions || {})) {
        if (!PRODUCTION_ACTIONS.some(s => action.type === `/action_types/${s}`) || !(action.baseTimeCost > 0)) continue;
        for (const output of action.outputItems || []) {
            const list = index.get(output.itemHrid) || [];
            list.push({ action, output: output.count, gathering: false }); index.set(output.itemHrid, list);
        }
        for (const drop of action.dropTable || []) {
            const list = index.get(drop.itemHrid) || [];
            list.push({ action, output: number(drop.dropRate, 1) * (number(drop.minCount) + number(drop.maxCount)) / 2, gathering: true });
            index.set(drop.itemHrid, list);
        }
    }
    return index;
}

export function calculateProductionPreparation({ consumables = {}, snapshot, settings = {}, inventory = null,
    actionDetailMap = {}, itemDetailMap = {}, enhancementMultipliers = {} }) {
    const profile = buildProductionProfile(snapshot, settings, { itemDetailMap, enhancementMultipliers });
    const issues = new Set();
    const index = sourceIndex(actionDetailMap);
    const nodes = new Map();
    const base = {};
    const usedActions = new Set();
    const externalMaterials = {};
    const preparedMaterials = {};
    const stock = inventory?.complete === true && String(inventory.characterId) === String(snapshot?.characterId)
        ? inventory.items || {} : {};
    const inventoryMode = settings.inventoryMode || 'all';
    const available = hrid => inventoryMode === 'none' || (inventoryMode === 'finished' && !Object.hasOwn(consumables, hrid))
        ? 0 : Math.max(0, number(stock[hrid]));
    for (const [hrid, qty] of Object.entries(consumables)) if (number(qty) > 0) base[hrid] = number(qty);
    const ensure = hrid => {
        if (nodes.has(hrid)) return;
        // Mark before descending: teas can require themselves through brewing.
        const node = { dependencies: {}, minutes: 0, category: 'other', issues: [] }; nodes.set(hrid, node);
        if (PREPARED_PRODUCTION_MATERIALS.includes(hrid)) return;
        const sources = index.get(hrid) || [];
        const expectedName = (itemDetailMap[hrid]?.name || '').replace('Milk', 'Cow').replace('Rainbow Cow', 'Unicow').replace('Log', 'Tree');
        const source = sources.find(s => s.action.name === expectedName) || sources.find(s => !s.gathering) || sources[0];
        if (!source || !(source.output > 0)) { node.issues.push(`missing-source:${hrid}`); return; }
        const { action } = source;
        node.actionType = action.type;
        const setup = profile.setups[action.type];
        node.issues.push(...profile.issues, ...setup.issues);
        if (setup.issues.length || profile.issues.length) return;
        const required = number(action.levelRequirement?.level, 1) + setup.actionLevel;
        if (setup.boostedLevel < required) { node.issues.push(`level-too-low:${action.hrid}`); return; }
        const levelEfficiency = Math.max(0, setup.boostedLevel - required) / 100;
        const seconds = Math.max(3, action.baseTimeCost / 1e9 / (1 + setup.speed));
        const processable = source.gathering && Object.values(actionDetailMap).some(a =>
            ['/action_types/cheesesmithing', '/action_types/crafting', '/action_types/tailoring'].includes(a.type)
            && a.inputItems?.length === 1 && a.inputItems[0].itemHrid === hrid && a.inputItems[0].count === 2);
        // Same continuous expectation as the Toolkit: processed materials are
        // not credited against other demand. Integer/remainder effects excluded.
        const rawFraction = processable ? Math.max(0, 1 - setup.processing) : 1;
        const output = source.output * (1 + (source.gathering ? setup.gathering : setup.gourmet)) * rawFraction;
        if (!(output > 0)) { node.issues.push(`invalid-output:${hrid}`); return; }
        const hours = seconds / 3600 / (1 + setup.efficiency + levelEfficiency) / output;
        node.minutes = hours * 60;
        node.category = source.gathering ? 'gathering' : action.type.endsWith('/cooking') ? 'cooking'
            : action.type.endsWith('/brewing') ? 'brewing' : 'other';
        for (const input of action.inputItems || []) {
            const qty = input.count * Math.max(0, 1 - setup.artisan) / output;
            node.dependencies[input.itemHrid] = (node.dependencies[input.itemHrid] || 0) + qty;
        }
        if (settings.includeTeaSupply === true) for (const drink of setup.drinks)
            node.dependencies[drink.itemHrid] = (node.dependencies[drink.itemHrid] || 0) + hours * drink.perHour;
        for (const dependency of Object.keys(node.dependencies)) ensure(dependency);
    };
    Object.keys(base).forEach(ensure);
    // Fixed-point material balance includes food ingredients, professional tea,
    // and tea consumed to make that tea. Positive cycles must converge.
    let demand = { ...base }, converged = !Object.keys(base).length;
    for (let iteration = 0; iteration < 512 && !converged; iteration++) {
        const next = { ...base };
        for (const [hrid, qty] of Object.entries(demand)) for (const [dep, ratio] of Object.entries(nodes.get(hrid)?.dependencies || {}))
            next[dep] = (next[dep] || 0) + Math.max(0, qty - available(hrid)) * ratio;
        const scale = Math.max(1, ...Object.values(next));
        if (!Number.isFinite(scale) || scale > 1e18) break;
        converged = [...nodes.keys()].every(key => Math.abs(number(next[key]) - number(demand[key])) <= 1e-10 * Math.max(1, number(next[key])));
        demand = next;
    }
    if (!converged) issues.add('nonconvergent-supply');
    const minutes = emptyMinutes();
    const materialBalance = {};
    for (const [hrid, qty] of Object.entries(demand)) {
        const node = nodes.get(hrid);
        const remaining = Math.max(0, qty - available(hrid));
        materialBalance[hrid] = { required: qty, available: available(hrid), used: Math.min(qty, available(hrid)), remaining };
        if (!(remaining > 1e-10)) continue;
        if (node?.actionType) usedActions.add(node.actionType);
        for (const issue of node?.issues || []) issues.add(issue);
        if (node) minutes[node.category] += remaining * node.minutes;
        if (issues.has(`missing-source:${hrid}`)) externalMaterials[hrid] = remaining;
        if (PREPARED_PRODUCTION_MATERIALS.includes(hrid)) preparedMaterials[hrid] = remaining;
    }
    const knownMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
    return { minutes, knownMinutes, totalMinutes: issues.size ? null : knownMinutes,
        complete: issues.size === 0, issues: [...issues], externalMaterials, preparedMaterials, materialBalance,
        usedActions: [...usedActions], setups: profile.setups, capturedAt: profile.capturedAt };
}

export function calculatePlanPreparation(player, settings, data) {
    // Production uses the first selected history snapshot, not the latest server.
    return calculateProductionPreparation({ ...data, settings,
        snapshot: player.productionSnapshot, consumables: player.consumablesUsed });
}
