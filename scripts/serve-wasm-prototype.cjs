const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { root } = require('./rust-tools.cjs');

const directory = path.join(root, '.wasm-build/browser');
const reports = path.join(root, '.bench/rust-wasm-p1');
const prefix = '/MWICombatSimulatorTest/dist/';
if (!fs.existsSync(path.join(root, '.wasm-build/browser-ready.json'))) throw new Error('Run npm run build:wasm-prototype first');
fs.mkdirSync(reports, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
    '.wasm': 'application/wasm', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        if (['/__prototype_report', '/__attribute_report', '/__encounter_report', '/__simulation_report'].includes(pathname) && request.method === 'POST') {
            if (request.headers.origin !== `http://127.0.0.1:${server.address().port}`) { response.writeHead(403).end(); return; }
            let body = '';
            for await (const chunk of request) {
                body += chunk;
                if (body.length > 100_000) { response.writeHead(413).end(); return; }
            }
            const report = JSON.parse(body);
            const attributes = pathname === '/__attribute_report';
            const encounters = pathname === '/__encounter_report';
            const simulations=pathname==='/__simulation_report';
            const paths = simulations ? ['/simulations.html',prefix+'simulations.html'] : encounters ? ['/encounters.html', prefix + 'encounters.html'] : attributes ? ['/attributes.html', prefix + 'attributes.html'] : ['/', '/index.html', prefix, prefix + 'index.html'];
            if (report.schemaVersion !== 1 || report.phase !== (simulations ? 'P2.3' : encounters ? 'P2.2' : attributes ? 'P2.1' : 'P1') || !Array.isArray(report.tests) ||
                !paths.includes(report.path)) { response.writeHead(400).end(); return; }
            const output = simulations ? path.join(root,'.bench/rust-wasm-p2-simulations') : encounters ? path.join(root, '.bench/rust-wasm-p2-events') : attributes ? path.join(root, '.bench/rust-wasm-p2-attributes') : reports;
            fs.mkdirSync(output, { recursive: true });
            const name = report.path.startsWith(prefix) ? 'browser-pages.json' : 'browser-root.json';
            fs.writeFileSync(path.join(output, name), JSON.stringify(report, null, 2));
            console.log(`${name}: ${report.tests.filter(test => test.passed).length}/${report.tests.length}, passed=${report.passed}`);
            response.writeHead(200).end('saved'); return;
        }
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
        const relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.slice(1);
        const file = path.resolve(directory, relative || 'index.html');
        if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end('missing'); return; }
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(400).end('invalid request'); }
});
server.listen(Number(process.env.MWI_PROTOTYPE_PORT || 9011), '127.0.0.1', () => {
    console.log(`P1 prototype: http://127.0.0.1:${server.address().port}/`);
    console.log(`Pages path: http://127.0.0.1:${server.address().port}${prefix}`);
});
