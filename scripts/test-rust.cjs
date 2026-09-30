const { run, versions } = require('./rust-tools.cjs');
console.log(versions({ wasm: false }));
run('cargo', ['fmt', '--manifest-path', 'rust/Cargo.toml', '--all', '--', '--check']);
run('cargo', ['test', '--manifest-path', 'rust/Cargo.toml', '--workspace', '--locked']);
run('cargo', ['clippy', '--manifest-path', 'rust/Cargo.toml', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']);
