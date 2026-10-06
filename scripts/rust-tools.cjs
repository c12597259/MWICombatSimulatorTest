const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const RUST_VERSION = '1.98.1';
const WASM_PACK_VERSION = '0.15.0';

function toolEnvironment(extra = {}) {
    const env = { ...process.env, ...extra };
    const key = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
    const cargoBin = path.join(process.env.CARGO_HOME || path.join(process.env.USERPROFILE || process.env.HOME, '.cargo'), 'bin');
    env[key] = `${cargoBin}${path.delimiter}${env[key] || ''}`;
    return env;
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, env: toolEnvironment(options.env),
        stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} exited with ${result.status}: ${result.stderr || ''}`);
    return (result.stdout || '').trim();
}

function versions({ wasm = true } = {}) {
    const rustc = run('rustc', ['--version'], { capture: true });
    const cargo = run('cargo', ['--version'], { capture: true });
    if (!rustc.startsWith(`rustc ${RUST_VERSION} `)) throw new Error(`Expected Rust ${RUST_VERSION}, got ${rustc}`);
    const result = { rustc, cargo };
    if (wasm) {
        result.wasmPack = run('wasm-pack', ['--version'], { capture: true });
        if (result.wasmPack !== `wasm-pack ${WASM_PACK_VERSION}`) throw new Error(`Expected wasm-pack ${WASM_PACK_VERSION}`);
    }
    if (!fs.existsSync(path.join(root, 'rust/Cargo.lock'))) throw new Error('Missing rust/Cargo.lock; generate and review the lockfile first');
    return result;
}

module.exports = { root, run, versions };
