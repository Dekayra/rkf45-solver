// CLI runner: solves the tank network defined in problem.js (or a JSON file
// passed as the 2nd argument) and writes the time series to a CSV file.
//
// Usage:
//   node codigo.js                 -> uses problem.js, reaction as configured there
//   node codigo.js true            -> uses problem.js, forces reaction ON
//   node codigo.js false           -> uses problem.js, forces reaction OFF
//   node codigo.js true my.json    -> uses a custom problem JSON file (see problem.js shape)

const fs = require('fs');
const engine = require('./engine.js');
const defaultProblem = require('./problem.js');

function parseUseReactionArg(arg) {
    if (arg === undefined) return undefined; // don't override problem.js
    const normalized = arg.trim().toLowerCase();
    if (['true', '1', 'com', 'cr'].includes(normalized)) return true;
    if (['false', '0', 'sem', 'sr'].includes(normalized)) return false;
    console.warn(`[!] Argumento "${arg}" não reconhecido para useReaction. Ignorando.`);
    return undefined;
}

function loadProblem(jsonPath) {
    if (!jsonPath) return JSON.parse(JSON.stringify(defaultProblem)); // deep clone
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw);
}

function salvarResultados(problem, results) {
    const variableTanks = problem.tanks.filter((t) => !t.fixed);
    const headers = ['Tempo'];
    for (const tank of variableTanks) headers.push(`C${tank.name}`, `T${tank.name}`);

    const data = results.map((r) => {
        const t = r.t !== undefined ? r.t.toString().replace('.', ',') : '0';
        const y = r.y.slice(0, variableTanks.length * 2).map((v) => v.toString().replace('.', ','));
        return [t, ...y];
    });

    const csvContent = [headers, ...data].map((row) => row.join(';')).join('\n');
    const suffix = problem.reaction && problem.reaction.enabled ? 'cr' : 'sr';
    const outFile = `resultados_${suffix}.csv`;
    fs.writeFileSync(outFile, csvContent);
    console.log(`[i] Resultados salvos em ${outFile}`);
}

function main() {
    const forcedReaction = parseUseReactionArg(process.argv[2]);
    const jsonPath = process.argv[3];
    const problem = loadProblem(jsonPath);
    if (forcedReaction !== undefined) {
        problem.reaction = Object.assign({}, problem.reaction, { enabled: forcedReaction });
    }

    console.log('[i] Preparando condições iniciais.');
    console.log(`[i] Reação: ${problem.reaction.enabled ? 'ativada' : 'desativada'}`);
    console.log('[i] Iniciando RKF.');

    const started = Date.now();
    let lastPrint = 0;
    const { tanks, results } = engine.solve(problem, (state, info, tf) => {
        if (Date.now() - lastPrint > 250) {
            lastPrint = Date.now();
            console.log(`t= ${info.t.toFixed(4)}s\t\t${(info.t * 100 / tf).toFixed(4)}%\t\th=${info.h.toFixed(4)}`);
        }
    });

    const final = results[results.length - 1];
    console.log('Condições Finais:');
    for (const tank of tanks.filter((t) => !t.fixed)) {
        console.log(`Tanque ${tank.name}: C=${final.y[tank.Cindex].toFixed(6)} T=${(final.y[tank.Tindex] - 273.15).toFixed(6)} °C`);
    }
    console.log('------------------------');

    console.log('[i] Salvando Resultados.');
    salvarResultados(problem, results);

    console.log(`[i] Finalizado. Tempo de execução: ${(Date.now() - started) / 1000}s`);
}

main();
