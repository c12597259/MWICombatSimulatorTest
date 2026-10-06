// The growing Number state is intentional compatibility, not a wrapping u32.
// Above 2^53 it differs from conventional Mulberry32 (seed 1: call 4,917,760).
// Production Math.random is never changed here.
const RNG_VERSION = 'mulberry32-js-number-v1';
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

module.exports = { RNG_VERSION, seededRandom };
