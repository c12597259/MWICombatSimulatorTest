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
    if args.len() != 4 || !["attributes", "math", "encounters"].contains(&args[1].as_str()) {
        return Err(
            "Usage: mwi-combat-cli {attributes|math|encounters} DATA_FILE EXPECTED_HASH (JSON input on stdin)".into(),
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
