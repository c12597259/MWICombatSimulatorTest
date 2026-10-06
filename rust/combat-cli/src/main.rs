use mwi_combat_core::{
    attributes::{attribute_trace, AttributeCase},
    data::DefinitionSet,
};
use std::{
    env, fs,
    io::{self, Read},
    rc::Rc,
};

fn execute() -> Result<(), String> {
    let args: Vec<_> = env::args().collect();
    if args.len() != 4
        || ![
            "attributes",
            "math",
            "encounters",
            "simulations",
            "simulationTraces",
        ]
        .contains(&args[1].as_str())
    {
        return Err(
            "Usage: mwi-combat-cli {attributes|math|encounters|simulations|simulationTraces} DATA_FILE EXPECTED_HASH (JSON input on stdin)".into(),
        );
    }
    let data = DefinitionSet::parse(
        &fs::read_to_string(&args[2]).map_err(|_| "Cannot read definition file")?,
        &args[3],
    )?;
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|_| "Cannot read input")?;
    let output = match args[1].as_str() {
        "attributes" => {
            let cases: Vec<AttributeCase> =
                serde_json::from_str(&input).map_err(|_| "Invalid attribute input")?;
            attribute_trace(&cases, &data)?
        }
        "math" => {
            let cases: Vec<mwi_combat_core::combat_math::MathCase> =
                serde_json::from_str(&input).map_err(|_| "Invalid math input")?;
            mwi_combat_core::combat_math::math_trace(&cases)?
        }
        "encounters" => {
            let cases: Vec<mwi_combat_core::encounter::EncounterCase> =
                serde_json::from_str(&input).map_err(|_| "Invalid encounter input")?;
            mwi_combat_core::encounter::encounter_trace(&cases, Rc::new(data))?
        }
        "simulations" => {
            let cases: Vec<mwi_combat_core::simulation::SimulationInput> =
                serde_json::from_str(&input).map_err(|_| "Invalid simulation input")?;
            let data = Rc::new(data);
            let mut values = Vec::new();
            for case in cases {
                values.push(mwi_combat_core::simulation::simulate(case, data.clone())?);
            }
            serde_json::json!(values)
        }
        "simulationTraces" => {
            let cases: Vec<mwi_combat_core::simulation::TraceInput> =
                serde_json::from_str(&input).map_err(|_| "Invalid simulation trace")?;
            let data = Rc::new(data);
            let mut values = Vec::new();
            for case in cases {
                values.push(mwi_combat_core::simulation::trace(case, data.clone())?);
            }
            serde_json::json!(values)
        }
        _ => unreachable!(),
    };
    println!("{output}");
    Ok(())
}
fn main() {
    if let Err(error) = execute() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
