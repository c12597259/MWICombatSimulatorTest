use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataEnvelope {
    schema_version: u32,
    source_sha256: String,
    definitions: Value,
}

pub struct DefinitionSet {
    source_hash: String,
    definitions: Value,
}

impl DefinitionSet {
    pub fn parse(json: &str, expected_hash: &str) -> Result<Self, String> {
        let envelope: DataEnvelope =
            serde_json::from_str(json).map_err(|_| "Invalid definition JSON")?;
        if envelope.schema_version != 1 {
            return Err("Unsupported definition schema".into());
        }
        if envelope.source_sha256 != expected_hash {
            return Err("Definition fingerprint mismatch".into());
        }
        let definitions = envelope
            .definitions
            .as_object()
            .ok_or("Definitions must be an object")?;
        for required in [
            "actionDetailMap",
            "abilityDetailMap",
            "itemDetailMap",
            "combatMonsterDetailMap",
        ] {
            if !definitions.get(required).is_some_and(Value::is_object) {
                return Err(format!("Missing definition: {required}"));
            }
        }
        Ok(Self {
            source_hash: envelope.source_sha256,
            definitions: envelope.definitions,
        })
    }

    pub fn source_hash(&self) -> &str {
        &self.source_hash
    }
    pub fn definition(&self, name: &str) -> Result<&Value, String> {
        self.definitions
            .get(name)
            .ok_or_else(|| format!("Missing definition table: {name}"))
    }
    pub fn count(&self) -> usize {
        self.definitions.as_object().map_or(0, |map| map.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn definitions_require_schema_fingerprint_and_maps() {
        let good = r#"{"schemaVersion":1,"sourceSha256":"expected","definitions":{"actionDetailMap":{},"abilityDetailMap":{},"itemDetailMap":{},"combatMonsterDetailMap":{}}}"#;
        assert_eq!(DefinitionSet::parse(good, "expected").unwrap().count(), 4);
        assert!(DefinitionSet::parse(good, "other").is_err());
        assert!(DefinitionSet::parse(
            &good.replace("schemaVersion\":1", "schemaVersion\":2"),
            "expected"
        )
        .is_err());
        assert!(DefinitionSet::parse("{}", "expected").is_err());
        assert!(DefinitionSet::parse("not json", "expected").is_err());
    }
}
