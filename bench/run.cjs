const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { parseArgs } = require('node:util');
const { buildBundle } = require('./lib/build.cjs');
const { seededRandom, RNG_VERSION } = require('./lib/seededRandom.cjs');
const { resultHash, NORMALIZATION_VERSION } = require('./lib/resultComparison.cjs');
const { loadReference, sha256 } = require('./lib/reference.cjs');

const { values: args } = parseArgs({ options: {
    input: { type: 'string' }, bundle: { type: 'string', default: 'current' },
    reuse: { type: 'boolean', default: false }, hours: { type: 'string', default: '72' },
    zone: { type: 'string', default: '/actions/combat/pirate_cove' }, tier: { type: 'string', default: '2' },
    seed: { type: 'string', default: '1' }, runs: { type: 'string', default: '3' },
    warmups: { type: 'string', default: '1' }, out: { type: 'string' },
    players: { type: 'string', default: '5' }, labyrinth: { type: 'string' }, room: { type: 'string' },
    visualization: { type: 'boolean', default: false }, metrics: { type: 'boolean', default: false },
    extra: { type: 'string' }, crates: { type: 'string' },
} });
if (!args.input) throw new Error('Use --input path/to/team.json (private data stays outside the repository)');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.bench');
const filename = `${args.bundle}.cjs`;
if (!/^[\w-]+$/.test(args.bundle)) throw new Error('Invalid bundle name');
const options = { zone: args.zone, tier: Number(args.tier), hours: Number(args.hours),
    players: Number(args.players), seed: Number(args.seed), labyrinth: args.labyrinth, room: Number(args.room),
    visualization: args.visualization, metrics: args.metrics,
    extra: args.extra ? JSON.parse(args.extra) : undefined, crates: args.crates ? JSON.parse(args.crates) : undefined };
for (const key of ['hours', 'players', 'seed', 'tier', 'room']) {
    if (key === 'room' && !args.room) continue;
    if (!Number.isFinite(options[key])) throw new Error(`Invalid --${key}`);
}
if (options.hours <= 0 || !Number.isInteger(options.players) || options.players < 1 || options.players > 5
    || !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xFFFFFFFF
    || !Number.isInteger(options.tier) || options.tier < 0
    || (args.room && (!Number.isInteger(options.room) || options.room < 1))
    || !Number.isFinite(options.hours * 3600e9)
    || !Number.isInteger(Number(args.runs)) || Number(args.runs) < 1
    || !Number.isInteger(Number(args.warmups)) || Number(args.warmups) < 0) throw new Error('Invalid benchmark options');

// A seeded stream only inside this isolated benchmark process. UI and production
// Math.random are untouched. The counter catches changed random call ordering.
async function main() {
    fs.mkdirSync(output, { recursive: true });
    const frozen = fs.existsSync(path.join(output, `${args.bundle}.manifest.json`));
    if (frozen && !args.reuse) throw new Error('Cannot overwrite a frozen reference; pass --reuse');
    const reference = frozen ? loadReference(args.bundle) : null;
    if (!args.reuse) await buildBundle(filename);
    if (args.out) fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    globalThis.onmessage = null;
    globalThis.CustomEvent ??= class CustomEvent extends Event {
        constructor(type, options) { super(type); this.detail = options.detail; }
    };
    const { run } = require(path.join(output, filename));
    const input = fs.readFileSync(args.input, 'utf8');
    const team = JSON.parse(input);
    const reports = [];
    const log = console.log;
    for (let i = -Number(args.warmups); i < Number(args.runs); i++) {
        const rng = seededRandom(options.seed);
        const oldRandom = Math.random;
        let data;
        try {
            Math.random = rng;
            console.log = () => {};
            data = await run(team, options);
        } finally { Math.random = oldRandom; console.log = log; }
        // Wall clock timestamps on wipe records are the only non-deterministic field.
        for (const wipe of data.result.wipeEvents || []) delete wipe.timestamp;
        const serialized = JSON.stringify(data.result);
        const hash = crypto.createHash('sha256').update(serialized).digest('hex');
        const report = { elapsedMs: data.elapsedMs, randomCalls: rng.count(), hash, canonicalHash: resultHash(data.result),
            messages: data.messages, events: data.events, maxQueue: data.maxQueue,
            completed: data.result.dungeonsCompleted, failed: data.result.dungeonsFailed,
            simulatedTime: data.result.simulatedTime, memory: process.memoryUsage() };
        log(JSON.stringify({ iteration: i, ...report }));
        if (i >= 0) {
            reports.push(report);
            if (args.out && i === 0) fs.writeFileSync(path.resolve(args.out) + '.result.json', serialized);
        }
    }
    const sorted = reports.map(r => r.elapsedMs).sort((a, b) => a - b);
    const summary = { node: process.version, cpu: os.cpus()[0].model, options,
        normalizationVersion: NORMALIZATION_VERSION,
        rngVersion: RNG_VERSION,
        bundleSha256: sha256(fs.readFileSync(path.join(output, filename))),
        reference: reference ? { name: reference.name, baseCommit: reference.baseCommit,
            engineSourceSha256: reference.engineSourceSha256, gameDataSha256: reference.gameDataSha256 } : null,
        inputSha256: crypto.createHash('sha256').update(input).digest('hex'),
        medianMs: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        reports };
    if (new Set(reports.map(r => r.canonicalHash)).size !== 1
        || new Set(reports.map(r => r.randomCalls)).size !== 1) throw new Error('Non-deterministic results or RNG consumption');
    if (args.out) fs.writeFileSync(path.resolve(args.out) + '.json', JSON.stringify(summary, null, 2));
    log(JSON.stringify({ medianMs: summary.medianMs, deterministic: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
