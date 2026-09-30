// Adapted from V8 10.2.154.26 src/base/ieee754.cc (fdlibm), specialized to y=1.4.
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
// Copyright 2016 the V8 project authors. All rights reserved.
// See rust/THIRD-PARTY-NOTICES.md for the V8 BSD license and libm notices.
// Keep the final correction inside the denominator: libm 0.2.8's pow places it
// after the division, producing different last bits from the frozen JS oracle.
#![allow(clippy::excessive_precision, clippy::approx_constant)] // Preserve fdlibm literals.

fn high(x: f64) -> i32 {
    (x.to_bits() >> 32) as i32
}
fn set_high(x: f64, word: i32) -> f64 {
    f64::from_bits((x.to_bits() & 0xffff_ffff) | ((word as u32 as u64) << 32))
}
fn truncate(x: f64) -> f64 {
    f64::from_bits(x.to_bits() & 0xffff_ffff_0000_0000)
}

pub fn pow_1p4(x: f64) -> f64 {
    if x.is_nan() {
        return x;
    }
    if x == 0.0 {
        return 0.0;
    }
    if x.is_infinite() {
        return f64::INFINITY;
    }
    if x < 0.0 {
        return f64::NAN;
    }
    if x == 1.0 {
        return 1.0;
    }
    const BP: [f64; 2] = [1.0, 1.5];
    const DP_H: [f64; 2] = [0.0, 5.84962487220764160156e-01];
    const DP_L: [f64; 2] = [0.0, 1.35003920212974897128e-08];
    const L1: f64 = 5.99999999999994648725e-01;
    const L2: f64 = 4.28571428578550184252e-01;
    const L3: f64 = 3.33333329818377432918e-01;
    const L4: f64 = 2.72728123808534006489e-01;
    const L5: f64 = 2.30660745775561754067e-01;
    const L6: f64 = 2.06975017800338417784e-01;
    const P1: f64 = 1.66666666666666019037e-01;
    const P2: f64 = -2.77777777770155933842e-03;
    const P3: f64 = 6.61375632143793436117e-05;
    const P4: f64 = -1.65339022054652515390e-06;
    const P5: f64 = 4.13813679705723846039e-08;
    const LG2: f64 = 6.93147180559945286227e-01;
    const LG2_H: f64 = 6.93147182464599609375e-01;
    const LG2_L: f64 = -1.90465429995776804525e-09;
    const CP: f64 = 9.61796693925975554329e-01;
    const CP_H: f64 = 9.61796700954437255859e-01;
    const CP_L: f64 = -7.02846165095275826516e-09;
    let mut ax = x;
    let mut ix = high(ax);
    let mut n = 0;
    if ix < 0x0010_0000 {
        ax *= 9007199254740992.0;
        n -= 53;
        ix = high(ax);
    }
    n += (ix >> 20) - 0x3ff;
    let j = ix & 0x000f_ffff;
    ix = j | 0x3ff0_0000;
    let k = if j <= 0x3988e {
        0
    } else if j < 0xbb67a {
        1
    } else {
        n += 1;
        ix -= 0x0010_0000;
        0
    };
    ax = set_high(ax, ix);
    let u = ax - BP[k];
    let v = 1.0 / (ax + BP[k]);
    let ss = u * v;
    let s_h = truncate(ss);
    let t_h = set_high(
        0.0,
        ((ix >> 1) | 0x2000_0000) + 0x0008_0000 + ((k as i32) << 18),
    );
    let t_l = ax - (t_h - BP[k]);
    let s_l = v * ((u - s_h * t_h) - s_h * t_l);
    let s2 = ss * ss;
    let mut r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    let s2 = s_h * s_h;
    let t_h = truncate(3.0 + s2 + r);
    let t_l = r - ((t_h - 3.0) - s2);
    let u = s_h * t_h;
    let v = s_l * t_h + t_l * ss;
    let p_h = truncate(u + v);
    let p_l = v - (p_h - u);
    let z_h = CP_H * p_h;
    let z_l = CP_L * p_h + p_l * CP + DP_L[k];
    let t = n as f64;
    let t1 = truncate(((z_h + z_l) + DP_H[k]) + t);
    let t2 = z_l - (((t1 - t) - DP_H[k]) - z_h);
    let y = 1.4;
    let y1 = truncate(y);
    let p_l = (y - y1) * t1 + y * t2;
    let mut p_h = y1 * t1;
    let z = p_l + p_h;
    let mut j = high(z);
    let i = z.to_bits() as i32;
    if j >= 0x4090_0000 {
        if ((j - 0x4090_0000) | i) != 0 || p_l + 8.0085662595372944372e-17 > z - p_h {
            return f64::INFINITY;
        }
    } else if (j & 0x7fff_ffff) >= 0x4090_cc00
        && ((j.wrapping_sub(0xc090_cc00_u32 as i32) | i) != 0 || p_l <= z - p_h)
    {
        return 0.0;
    }
    let i = j & 0x7fff_ffff;
    let k = (i >> 20) - 0x3ff;
    let mut n = 0;
    if i > 0x3fe0_0000 {
        n = j + (0x0010_0000 >> (k + 1));
        let k = ((n & 0x7fff_ffff) >> 20) - 0x3ff;
        let t = set_high(0.0, n & !(0x000f_ffff >> k));
        n = ((n & 0x000f_ffff) | 0x0010_0000) >> (20 - k);
        if j < 0 {
            n = -n;
        }
        p_h -= t;
    }
    let t = truncate(p_l + p_h);
    let u = t * LG2_H;
    let v = (p_l - (t - p_h)) * LG2 + t * LG2_L;
    let z = u + v;
    let w = v - (z - u);
    let t = z * z;
    let t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    let r = (z * t1) / ((t1 - 2.0) - (w + z * w));
    let z = 1.0 - (r - z);
    j = high(z).wrapping_add(n.wrapping_shl(20));
    if (j >> 20) <= 0 {
        libm::scalbn(z, n)
    } else {
        set_high(z, j)
    }
}
