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
    fn negative_halves_and_large_integers_keep_js_semantics() {
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(2.5), 3.0);
        assert!(js_round(-0.5).is_sign_negative());
        assert!(js_round(-0.0).is_sign_negative());
        assert_eq!(js_round(4_503_599_627_370_497.0), 4_503_599_627_370_497.0);
    }
}
