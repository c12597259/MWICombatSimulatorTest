import init, { PrototypeEngine, module_info } from '../.wasm-build/pkg/combat_wasm.js';
import wasmUrl from '../.wasm-build/pkg/combat_wasm_bg.wasm';
import dataUrl from '../.wasm-build/data/combat-data.json?asset';
import manifest from '../.wasm-build/manifest.json';

export { manifest };
const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0')).join('');

async function loadVerifiedAsset(url, expectedHash) {
    let cache;
    try {
        cache = await caches.open('mwi-combat-wasm-assets-v1');
        const cached = await cache.match(url);
        if (cached) {
            const bytes = await cached.arrayBuffer();
            if (await sha256(bytes) === expectedHash) return bytes;
            await cache.delete(url);
        }
    } catch { /* Storage denial must not prevent online calculation. */ }
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error('Could not load combat engine asset: ' + url);
    const bytes = await response.arrayBuffer();
    if (await sha256(bytes) !== expectedHash) throw new Error('Combat engine asset version mismatch');
    try {
        await cache?.put(url, new Response(bytes));
        const keys = await cache?.keys() || [];
        // Keep at most four pairs of immutable assets, including the current pair.
        for (const key of keys.slice(0, Math.max(0, keys.length - 8))) await cache.delete(key);
    } catch { /* Quota errors affect caching only. */ }
    return bytes;
}

export async function loadEngine() {
    const base = self.__mwiLabAssetBase || self.location.href;
    const [bytes, data] = await Promise.all([
        loadVerifiedAsset(new URL(wasmUrl, base), manifest.artifacts['combat_wasm_bg.wasm']),
        loadVerifiedAsset(new URL(dataUrl, base), manifest.dataAssetSha256),
    ]);
    await init({ module_or_path: bytes });
    const info = JSON.parse(module_info());
    if (info.interfaceVersion !== manifest.interfaceVersion || info.rngVersion !== manifest.rngVersion ||
        info.dataFingerprint !== manifest.dataFingerprint) throw new Error('Combat engine interface mismatch');
    return new PrototypeEngine(new TextDecoder().decode(data), manifest.dataFingerprint);
}

