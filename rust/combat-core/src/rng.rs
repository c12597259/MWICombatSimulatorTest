pub const RNG_VERSION: &str = "mulberry32-js-number-v1";

/// Reproduces the existing JS benchmark, including Number rounding after 2^53.
/// A conventional wrapping-u32 state would diverge during long simulations.
pub struct CombatRng {
    state: f64,
    calls: u64,
}

impl CombatRng {
    pub fn new(seed: u32) -> Self {
        Self {
            state: f64::from(seed),
            calls: 0,
        }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state += f64::from(0x6D2B79F5_u32);
        self.calls += 1;
        // The growing state is positive and integral. Explicit modulo implements
        // JS ToUint32; casting the growing f64 directly would saturate in Rust.
        let bits = (self.state % 4_294_967_296.0) as u32;
        let mut t = (bits ^ (bits >> 15)).wrapping_mul(bits | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    pub fn next_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) / 4_294_967_296.0
    }

    pub fn calls(&self) -> u64 {
        self.calls
    }

    pub fn sample_to(&mut self, target: u64) -> Result<u32, String> {
        if target <= self.calls {
            return Err("RNG checkpoint must advance the stream".into());
        }
        let mut last = 0;
        while self.calls < target {
            last = self.next_u32();
        }
        Ok(last)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Vectors {
        rng_version: String,
        vectors: Vec<Vector>,
    }
    #[derive(Deserialize)]
    struct Vector {
        seed: u32,
        values: Vec<Checkpoint>,
    }
    #[derive(Deserialize)]
    struct Checkpoint {
        call: u64,
        u32: u32,
    }

    #[test]
    fn six_million_call_js_vectors_match() {
        let vectors: Vectors = serde_json::from_str(include_str!(
            "../../../tests/fixtures/combat/rng-js-number-v1.json"
        ))
        .unwrap();
        assert_eq!(vectors.rng_version, RNG_VERSION);
        for vector in vectors.vectors {
            let mut rng = CombatRng::new(vector.seed);
            for point in vector.values {
                assert_eq!(
                    rng.sample_to(point.call).unwrap(),
                    point.u32,
                    "seed {} call {}",
                    vector.seed,
                    point.call
                );
            }
            assert_eq!(rng.calls(), 6_000_000);
        }
    }

    #[test]
    fn chunk_boundaries_keep_the_same_stream() {
        let mut contiguous = CombatRng::new(1);
        let expected = contiguous.sample_to(5_007_481).unwrap();
        for chunk in [1_000, 10_001, 100_000] {
            let mut chunked = CombatRng::new(1);
            let mut last = 0;
            while chunked.calls() < 5_007_481 {
                last = chunked
                    .sample_to((chunked.calls() + chunk).min(5_007_481))
                    .unwrap();
            }
            assert_eq!(last, expected);
        }
    }

    #[test]
    fn first_value_and_invalid_checkpoints() {
        let mut rng = CombatRng::new(1);
        assert_eq!(rng.next_f64(), 0.6270739405881613);
        assert!(rng.sample_to(1).is_err());
        assert!(rng.sample_to(0).is_err());
    }
}
