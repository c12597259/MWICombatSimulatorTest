const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let api, wasm, engine;
const ready = (async () => {
    const webpack = require('webpack');
    await new Promise((resolve, reject) => {
        const compiler = webpack({ mode: 'development', target: 'node', devtool: false, context: root,
            entry: './bench/labyrinthTestExports.js', output: { path: root + '/.bench', filename: 'labyrinth-tests.cjs', library: { type: 'commonjs2' } } });
        compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString())) : resolve()));
    });
    api = require(root + '/.bench/labyrinth-tests.cjs');
    wasm = await import('data:text/javascript;base64,' + fs.readFileSync(root + '/.wasm-build/pkg/combat_wasm.js').toString('base64'));
    await wasm.default({ module_or_path: fs.readFileSync(root + '/.wasm-build/pkg/combat_wasm_bg.wasm') });
    const manifest = JSON.parse(fs.readFileSync(root + '/.wasm-build/manifest.json'));
    engine = new wasm.PrototypeEngine(fs.readFileSync(root + '/.wasm-build/data/combat-data.json', 'utf8'), manifest.dataFingerprint);
    global.CustomEvent ??= class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
})();
process.on('exit', () => { engine?.free(); });
const dto = (level = 100) => ({ hrid: 'player1', ...Object.fromEntries(['stamina','intelligence','attack','melee','defense','ranged','magic'].map(name => [name + 'Level', level])), equipment: {}, food: [], drinks: [], abilities: [], houseRooms: {}, achievements: {}, guildCombatBuffLevels: {} });
const request = player => ({ players: [player], labyrinth: { labyrinthHrid: '/monsters/giant_scorpion', roomLevel: 20, crates: [] }, simulationTimeLimit: 1200e9, extra: {} });

test('upgrade imports use 1% per level and never double count DTO levels plus raw buffs', async () => {
    await ready;
    const player = { ...dto(), labyrinthUpgrades: { '/buff_uniques/labyrinth_upgrade_combat_damage': 5 } };
    const buffs = api.getLabyrinthRequestBuffs(player, { buffs: [
        { uniqueHrid: '/buff_uniques/labyrinth_upgrade_combat_damage', typeHrid: '/buff_types/damage', ratioBoost: .05 },
        { uniqueHrid: '/buff_uniques/personal_damage', typeHrid: '/buff_types/damage', ratioBoost: .08 },
        { uniqueHrid: 'community', typeHrid: '/buff_types/wisdom', flatBoost: .2 },
    ] });
    assert.equal(buffs.length, 2);
    assert.equal(buffs[1].ratioBoost, .05);
    const input = api.normalizeSimulationRequest({ ...request(player), extra: { personalBuffs: ['/items/seal_of_damage'] } }, 7);
    assert.deepEqual(input.players[0].extra.personalBuffs, []);
    assert.equal(input.players[0].input.guildBuffs.find(b => b.typeHrid === '/buff_types/damage').ratioBoost, .05);
    const ordinary = api.normalizeSimulationRequest({ ...request(player), labyrinth: null, zone: { zoneHrid: '/actions/combat/fly', difficultyTier: 0 }, extra: { personalBuffs: ['/items/seal_of_damage'] } }, 7);
    assert.equal(ordinary.players[0].input.guildBuffs.length, 0);
    assert.deepEqual(ordinary.players[0].extra.personalBuffs, ['/items/seal_of_damage']);
});

test('WASM excludes personal seals even when called directly and stats do not change simulation output', async () => {
    await ready;
    const input = api.normalizeSimulationRequest(request(dto(300)), 7);
    const base = JSON.parse(engine.simulate(JSON.stringify(input)));
    input.players[0].extra.personalBuffs = ['/items/seal_of_damage', '/items/seal_of_attack_speed'];
    assert.deepEqual(JSON.parse(engine.simulate(JSON.stringify(input))), base);
    input.recordLabyrinthStats = true;
    const recorded = JSON.parse(engine.simulate(JSON.stringify(input)));
    assert(recorded.result.labyrinthStats.completed > 0);
    delete recorded.result.labyrinthStats;
    assert.deepEqual(recorded, base);
});

for (const [name, level, roomLevel, timeLimit, defense] of [
    ['success', 500, 1, 1200e9], ['death', 1, 100, 1200e9],
    ['timeout', 1, 100, 1200e9, 10000], ['unfinished', 1, 100, 1, 10000],
]) test(`WASM completed-attempt accounting matches instrumented JS: ${name}`, async () => {
    await ready;
    const playerDto = dto(level);
    if (defense) { playerDto.staminaLevel = defense; playerDto.defenseLevel = defense; }
    playerDto.labyrinthUpgrades = { labyrinthCombatDamageLevel: 5, labyrinthAttackSpeedLevel: 3, labyrinthCastSpeedLevel: 2, labyrinthCriticalRateLevel: 1, labyrinthExperienceLevel: 4 };
    const req = { ...request(playerDto), labyrinth: { labyrinthHrid: '/monsters/giant_scorpion', roomLevel, crates: ['/items/advanced_coffee_crate'] }, simulationTimeLimit: timeLimit };
    const input = api.normalizeSimulationRequest(req, 123);
    input.recordLabyrinthStats = true;
    const output = JSON.parse(engine.simulate(JSON.stringify(input))).result;
    const player = api.Player.createFromDTO(playerDto);
    player.extraBuffs = api.getLabyrinthUpgradeBuffs(playerDto.labyrinthUpgrades);
    const labyrinth = new api.Labyrinth(req.labyrinth.labyrinthHrid, roomLevel, req.labyrinth.crates);
    player.zoneBuffs = labyrinth.buffs;
    const simulator = new api.CombatSimulator([player], null, labyrinth, { enableHpMpVisualization: false });
    const stats = { completed: 0, successes: 0, deaths: 0, timeouts: 0, lastEnd: 0, minDuration: 0, maxDuration: 0 };
    let start = 0;
    const startEncounter = simulator.startNewEncounter.bind(simulator);
    simulator.startNewEncounter = function () { const result = startEncounter(); start = this.simulationTime; return result; };
    const check = simulator.checkEncounterEnd.bind(simulator);
    simulator.checkEncounterEnd = function () {
        const before = this.simResult.encounters, ended = check();
        if (ended) {
            const duration = this.simulationTime - start;
            if (!stats.completed || duration < stats.minDuration) stats.minDuration = duration;
            stats.maxDuration = Math.max(stats.maxDuration, duration);
            stats.completed++; stats.lastEnd = this.simulationTime;
            if (this.simResult.encounters > before) stats.successes++;
            else if (this.allPlayersDead) stats.deaths++;
            else stats.timeouts++;
        }
        return ended;
    };
    const originalRandom = Math.random, originalLog = console.log;
    let result;
    try {
        Math.random = require('../bench/lib/seededRandom.cjs').seededRandom(123);
        console.log = () => {};
        result = await simulator.simulate(timeLimit);
    } finally { Math.random = originalRandom; console.log = originalLog; }
    assert.deepEqual(output.labyrinthStats, stats);
    assert.equal(output.encounters, result.encounters);
    assert.equal(output.labyAttemptCount, result.labyAttemptCount);
    if (name === 'success') assert(stats.successes > 0);
    if (name === 'death') assert(stats.deaths > 0);
    if (name === 'timeout') assert(stats.timeouts > 0);
    if (name === 'unfinished') assert.equal(stats.completed, 0);
});
