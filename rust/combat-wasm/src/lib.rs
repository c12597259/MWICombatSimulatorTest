use mwi_combat_core::{
    data::DefinitionSet,
    queue::{queue_trace, QueueAction},
    rng::{CombatRng, RNG_VERSION},
    INTERFACE_VERSION,
};
use std::cell::Cell;
use wasm_bindgen::prelude::*;

const DATA_HASH: &str = match option_env!("MWI_COMBAT_DATA_SHA") {
    Some(value) => value,
    None => "unprepared",
};
thread_local! {
    static LIVE_ENGINES: Cell<u32> = const { Cell::new(0) };
    static LIVE_PROBES: Cell<u32> = const { Cell::new(0) };
}

fn error(message: impl AsRef<str>) -> JsValue {
    JsValue::from_str(message.as_ref())
}

#[wasm_bindgen]
pub fn module_info() -> String {
    serde_json::json!({ "interfaceVersion": INTERFACE_VERSION, "rngVersion": RNG_VERSION,
        "dataFingerprint": DATA_HASH, "prototype": true })
    .to_string()
}

#[wasm_bindgen]
pub fn live_engines() -> u32 {
    LIVE_ENGINES.with(Cell::get)
}
#[wasm_bindgen]
pub fn live_probes() -> u32 {
    LIVE_PROBES.with(Cell::get)
}

#[wasm_bindgen]
pub fn js_round(value: f64) -> f64 {
    mwi_combat_core::numeric::js_round(value)
}

#[wasm_bindgen]
pub fn js_remainder(value: f64, divisor: f64) -> f64 {
    value % divisor
}

#[wasm_bindgen]
pub struct PrototypeEngine {
    definitions: DefinitionSet,
}

#[wasm_bindgen]
impl PrototypeEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(data_json: &str, expected_hash: &str) -> Result<PrototypeEngine, JsValue> {
        if expected_hash != DATA_HASH {
            return Err(error("Module/data fingerprint mismatch"));
        }
        let definitions = DefinitionSet::parse(data_json, expected_hash).map_err(error)?;
        LIVE_ENGINES.with(|count| count.set(count.get() + 1));
        Ok(Self { definitions })
    }

    pub fn info(&self) -> String {
        serde_json::json!({ "definitionCount": self.definitions.count(), "dataFingerprint": self.definitions.source_hash() }).to_string()
    }

    pub fn queue_trace(&self, actions_json: &str) -> Result<String, JsValue> {
        let actions: Vec<QueueAction> =
            serde_json::from_str(actions_json).map_err(|_| error("Invalid queue action JSON"))?;
        if actions.len() > 20_000 {
            return Err(error("Too many prototype queue actions"));
        }
        let frames = queue_trace(&actions).map_err(error)?;
        serde_json::to_string(&frames).map_err(|_| error("Cannot encode queue trace"))
    }

    pub fn create_rng_probe(&self, seed: u32) -> RngProbe {
        LIVE_PROBES.with(|count| count.set(count.get() + 1));
        RngProbe {
            rng: CombatRng::new(seed),
        }
    }
}

impl Drop for PrototypeEngine {
    fn drop(&mut self) {
        LIVE_ENGINES.with(|count| count.set(count.get() - 1));
    }
}

#[wasm_bindgen]
pub struct RngProbe {
    rng: CombatRng,
}

#[wasm_bindgen]
impl RngProbe {
    pub fn calls(&self) -> f64 {
        self.rng.calls() as f64
    }
    pub fn sample_to(&mut self, target: u32) -> Result<u32, JsValue> {
        self.rng.sample_to(u64::from(target)).map_err(error)
    }
}

impl Drop for RngProbe {
    fn drop(&mut self) {
        LIVE_PROBES.with(|count| count.set(count.get() - 1));
    }
}
