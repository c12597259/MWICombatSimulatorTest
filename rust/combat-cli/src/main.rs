use mwi_combat_core::{
    attributes::{attribute_trace, AttributeCase},
    data::DefinitionSet,
};
use std::{
    env, fs,
    io::{self, Read},
};

fn execute() -> Result<(), String> {
    let args: Vec<_> = env::args().collect();
    if args.len() != 4 || args[1] != "attributes" {
        return Err(
            "Usage: mwi-combat-cli attributes DATA_FILE EXPECTED_HASH (JSON input on stdin)".into(),
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
    let cases: Vec<AttributeCase> =
        serde_json::from_str(&input).map_err(|_| "Invalid attribute input")?;
    println!("{}", attribute_trace(&cases, &data)?);
    Ok(())
}
fn main() {
    if let Err(error) = execute() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
