/// JS Math.round preserves negative zero and rounds negative halves toward +inf.
pub fn js_round(value: f64) -> f64 {
    if !value.is_finite() || value == 0.0 {
        return value;
    }
    let floor = value.floor();
    let result = if value - floor < 0.5 {
        floor
    } else {
        floor + 1.0
    };
    if result == 0.0 {
        result.copysign(value)
    } else {
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn definition_decimals_keep_exact_js_binary64_values() {
        let values: Vec<f64> =
            serde_json::from_str("[0.0108,0.00021600000000000002,14.500000000000002]").unwrap();
        assert_eq!(values[0] + values[2] * values[1], 0.013932000000000002);
        assert_eq!(values[1].to_bits(), 0.00021600000000000002_f64.to_bits());
        assert_eq!(values[2].to_bits(), 14.500000000000002_f64.to_bits());
    }
    #[test]
    fn negative_halves_and_large_integers_keep_js_semantics() {
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(2.5), 3.0);
        assert!(js_round(-0.5).is_sign_negative());
        assert!(js_round(-0.0).is_sign_negative());
        assert_eq!(js_round(4_503_599_627_370_497.0), 4_503_599_627_370_497.0);
    }
}
