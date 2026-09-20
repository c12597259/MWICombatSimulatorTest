const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const webpack = require('webpack');
const { parseArgs } = require('node:util');

const { values: args } = parseArgs({ options: {
    input: { type: 'string' }, bundle: { type: 'string', default: 'current' },
    reuse: { type: 'boolean', default: false }, hours: { type: 'string', default: '72' },
    zone: { type: 'string', default: '/actions/combat/pirate_cove' }, tier: { type: 'string', default: '2' },
    seed: { type: 'string', default: '1' }, runs: { type: 'string', default: '3' },
    warmups: { type: 'string', default: '1' }, out: { type: 'string' },
    players: { type: 'string', default: '5' }, labyrinth: { type: 'string' }, room: { type: 'string' },
    visualization: { type: 'boolean', default: false }, metrics: { type: 'boolean', default: false },
} });
if (!args.input) throw new Error('Use --input path/to/team.json (private data stays outside the repository)');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.bench');
const filename = `${args.bundle}.cjs`;
if (!/^[\w-]+$/.test(args.bundle)) throw new Error('Invalid bundle name');
const options = { zone: args.zone, tier: Number(args.tier), hours: Number(args.hours),
    players: Number(args.players), seed: Number(args.seed), labyrinth: args.labyrinth, room: Number(args.room),
    visualization: args.visualization, metrics: args.metrics };

// A seeded stream only inside this isolated benchmark process. UI and production
// Math.random are untouched. The counter catches changed random call ordering.
function seededRandom(seed) {
    let state = seed >>> 0;
    let calls = 0;
    const random = () => {
        calls++;
        let t = state += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    random.count = () => calls;
    return random;
}
async function main() {
    fs.mkdirSync(output, { recursive: true });
    if (!args.reuse) await new Promise((resolve, reject) => {
        const compiler = webpack({ mode: 'development', target: 'node', devtool: false,
            entry: path.join(__dirname, 'entry.js'), output: { path: output, filename, library: { type: 'commonjs2' } } });
        compiler.run((error, stats) => compiler.close(() => {
            if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
            else resolve();
        }));
    });
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
        const report = { elapsedMs: data.elapsedMs, randomCalls: rng.count(), hash,
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
        inputSha256: crypto.createHash('sha256').update(input).digest('hex'),
        medianMs: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        reports };
    if (new Set(reports.map(r => r.hash)).size !== 1) throw new Error('Non-deterministic results');
    if (args.out) fs.writeFileSync(path.resolve(args.out) + '.json', JSON.stringify(summary, null, 2));
    log(JSON.stringify({ medianMs: summary.medianMs, deterministic: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
