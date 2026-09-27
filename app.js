(function () {
    'use strict';

    const tanksBody = document.querySelector('#tanksTable tbody');
    const pipesBody = document.querySelector('#pipesTable tbody');
    const logEl = document.getElementById('log');

    let tankRows = [];
    let pipeRows = [];

    function log(msg) {
        logEl.textContent += '\n' + msg;
        logEl.scrollTop = logEl.scrollHeight;
    }
    function resetLog(msg) {
        logEl.textContent = msg;
    }

    // ---------- Tank / pipe table rendering ----------

    function tankNames() {
        return tankRows.map((r) => r.name.value.trim()).filter((v) => v !== '');
    }

    function renderPipeNameOptions(selectEl, current) {
        const names = tankNames();
        const currentStr = current === undefined || current === null ? '' : String(current);
        selectEl.innerHTML = '';
        for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === currentStr) opt.selected = true;
            selectEl.appendChild(opt);
        }
    }

    function refreshPipeDropdowns() {
        for (const row of pipeRows) {
            const curFrom = row.from.value;
            const curTo = row.to.value;
            renderPipeNameOptions(row.from, curFrom);
            renderPipeNameOptions(row.to, curTo);
        }
    }

    function addTankRow(tank) {
        tank = tank || { name: '', concentration: 0, temperature: 20, volume: 1, fixed: false };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input class="t-name" value="${tank.name}"></td>
            <td><input class="t-c" value="${tank.concentration}"></td>
            <td><input class="t-t" value="${tank.temperature}"></td>
            <td><input class="t-v" value="${tank.volume === undefined ? '' : tank.volume}"></td>
            <td class="checkbox-cell"><input type="checkbox" class="t-fixed" ${tank.fixed ? 'checked' : ''}></td>
            <td><button class="small danger t-remove">✕</button></td>
        `;
        tanksBody.appendChild(tr);
        const row = {
            tr,
            name: tr.querySelector('.t-name'),
            c: tr.querySelector('.t-c'),
            t: tr.querySelector('.t-t'),
            v: tr.querySelector('.t-v'),
            fixed: tr.querySelector('.t-fixed'),
        };
        tankRows.push(row);

        row.name.addEventListener('input', refreshPipeDropdowns);
        row.fixed.addEventListener('change', () => {
            row.v.disabled = row.fixed.checked;
        });
        row.v.disabled = row.fixed.checked;

        tr.querySelector('.t-remove').addEventListener('click', () => {
            tankRows = tankRows.filter((r) => r !== row);
            tr.remove();
            refreshPipeDropdowns();
        });

        refreshPipeDropdowns();
    }

    function addPipeRow(pipe) {
        pipe = pipe || { from: '', to: '', flow: 1 };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><select class="p-from"></select></td>
            <td><select class="p-to"></select></td>
            <td><input class="p-flow" value="${pipe.flow}"></td>
            <td><button class="small danger p-remove">✕</button></td>
        `;
        pipesBody.appendChild(tr);
        const row = {
            tr,
            from: tr.querySelector('.p-from'),
            to: tr.querySelector('.p-to'),
            flow: tr.querySelector('.p-flow'),
        };
        pipeRows.push(row);
        renderPipeNameOptions(row.from, pipe.from);
        renderPipeNameOptions(row.to, pipe.to);

        tr.querySelector('.p-remove').addEventListener('click', () => {
            pipeRows = pipeRows.filter((r) => r !== row);
            tr.remove();
        });
    }

    function clearAll() {
        tanksBody.innerHTML = '';
        pipesBody.innerHTML = '';
        tankRows = [];
        pipeRows = [];
    }

    function loadProblemIntoForm(problem) {
        clearAll();
        for (const tank of problem.tanks) addTankRow(tank);
        for (const pipe of problem.pipes) addPipeRow(pipe);

        document.getElementById('reactionEnabled').checked = !!(problem.reaction && problem.reaction.enabled);
        document.getElementById('preExpFactor').value = problem.reaction.preExpFactor;
        document.getElementById('activationTerm').value = problem.reaction.activationTerm;
        document.getElementById('deltaHr').value = problem.reaction.deltaHr;
        document.getElementById('fluidRho').value = problem.fluid.rho;
        document.getElementById('fluidCp').value = problem.fluid.cp;

        document.getElementById('simHours').value = (problem.sim.tf / 3600);
        document.getElementById('simH0').value = problem.sim.h0;
        document.getElementById('simTol').value = problem.sim.tol;
        document.getElementById('simLog').value = problem.sim.logIntervalSeconds;
    }

    // ---------- Collect current form state into a problem object ----------

    function collectProblem() {
        const tanks = tankRows.map((r) => {
            const fixed = r.fixed.checked;
            const t = {
                name: r.name.value.trim(),
                concentration: parseFloat(r.c.value),
                temperature: parseFloat(r.t.value),
                fixed,
            };
            if (!fixed) t.volume = parseFloat(r.v.value);
            return t;
        });

        if (tanks.some((t) => !t.name)) throw new Error('Every tank needs a non-empty name.');
        const names = tanks.map((t) => t.name);
        if (new Set(names).size !== names.length) throw new Error('Tank names must be unique.');
        for (const t of tanks) {
            if (!t.fixed && (!(t.volume > 0))) throw new Error(`Tank "${t.name}" needs a volume > 0 (or mark it as fixed).`);
        }

        const pipes = pipeRows.map((r) => ({
            from: r.from.value,
            to: r.to.value,
            flow: parseFloat(r.flow.value),
        }));
        for (const p of pipes) {
            if (!p.from || !p.to) throw new Error('Every pipe needs both a from and a to tank.');
            if (!(p.flow >= 0)) throw new Error(`Pipe ${p.from} -> ${p.to} needs a non-negative flow.`);
        }

        const reaction = {
            enabled: document.getElementById('reactionEnabled').checked,
            preExpFactor: parseFloat(document.getElementById('preExpFactor').value),
            activationTerm: parseFloat(document.getElementById('activationTerm').value),
            deltaHr: parseFloat(document.getElementById('deltaHr').value),
        };
        const fluid = {
            rho: parseFloat(document.getElementById('fluidRho').value),
            cp: parseFloat(document.getElementById('fluidCp').value),
        };
        const hours = parseFloat(document.getElementById('simHours').value);
        const sim = {
            t0: 0,
            tf: hours * 3600,
            h0: parseFloat(document.getElementById('simH0').value),
            tol: parseFloat(document.getElementById('simTol').value),
            logIntervalSeconds: parseFloat(document.getElementById('simLog').value),
        };

        return { tanks, pipes, reaction, fluid, sim };
    }

    // ---------- Charting (plain canvas, no dependencies) ----------

    const palette = ['#4a90d9', '#e2711d', '#9a9a9a', '#f2c811', '#7ed957', '#c084fc', '#ff6b81', '#2dd4bf'];

    function drawChart(canvas, series, xLabel, yLabel, title) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.clientWidth || 600;
        const cssHeight = 180;
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);

        const padL = 46, padR = 10, padT = 22, padB = 26;
        const plotW = cssWidth - padL - padR;
        const plotH = cssHeight - padT - padB;

        let allX = [], allY = [];
        for (const s of series) { allX = allX.concat(s.x); allY = allY.concat(s.y); }
        const xMin = Math.min(...allX), xMax = Math.max(...allX);
        const yMin = Math.min(0, ...allY), yMax = Math.max(...allY) * 1.05 || 1;

        const xScale = (x) => padL + (x - xMin) / (xMax - xMin || 1) * plotW;
        const yScale = (y) => padT + plotH - (y - yMin) / (yMax - yMin || 1) * plotH;

        // axes
        ctx.strokeStyle = '#2a3350';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
        ctx.stroke();

        ctx.fillStyle = '#8b93ab';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const val = yMin + (yMax - yMin) * (1 - i / 4);
            const y = padT + (plotH * i / 4);
            ctx.fillText(val.toFixed(1), padL - 6, y + 3);
        }
        ctx.textAlign = 'center';
        for (let i = 0; i <= 4; i++) {
            const val = xMin + (xMax - xMin) * (i / 4);
            const x = padL + (plotW * i / 4);
            ctx.fillText(val.toFixed(1), x, padT + plotH + 16);
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = '#e6e9f2';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(title, padL, 14);

        // series
        for (const s of series) {
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            s.x.forEach((x, i) => {
                const px = xScale(x), py = yScale(s.y[i]);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.stroke();
        }

        // legend
        ctx.font = '10px monospace';
        let lx = padL, ly = padT - 8;
        for (const s of series) {
            ctx.fillStyle = s.color;
            ctx.fillRect(lx, ly - 7, 8, 8);
            ctx.fillStyle = '#8b93ab';
            ctx.fillText(s.label, lx + 11, ly);
            lx += ctx.measureText(s.label).width + 26;
        }
    }

    // ---------- Run ----------

    function runCalculation() {
        let problem;
        try {
            problem = collectProblem();
        } catch (err) {
            resetLog('[!] ' + err.message);
            return;
        }

        resetLog('[i] Building system...');
        log(`[i] ${problem.tanks.filter(t => !t.fixed).length} variable tank(s), ${problem.tanks.filter(t => t.fixed).length} fixed node(s), ${problem.pipes.length} pipe(s).`);
        log(`[i] Reaction ${problem.reaction.enabled ? 'ENABLED' : 'disabled'}.`);

        const t0 = performance.now();
        let result;
        try {
            result = TankEngine.solve(problem);
        } catch (err) {
            log('[!] Error: ' + err.message);
            return;
        }
        const elapsed = ((performance.now() - t0) / 1000).toFixed(3);

        const { tanks, results } = result;
        const variableTanks = tanks.filter((t) => !t.fixed);

        log(`[i] Done in ${elapsed}s, ${results.length} sampled points.`);

        // Charts
        const cSeries = variableTanks.map((tank, i) => ({
            label: `C${tank.name}`,
            color: palette[i % palette.length],
            x: results.map((r) => r.t / 3600),
            y: results.map((r) => r.y[tank.Cindex]),
        }));
        const tSeries = variableTanks.map((tank, i) => ({
            label: `T${tank.name}`,
            color: palette[i % palette.length],
            x: results.map((r) => r.t / 3600),
            y: results.map((r) => r.y[tank.Tindex] - 273.15),
        }));
        drawChart(document.getElementById('chartC'), cSeries, 'Time (h)', 'C (kg/m³)', 'Concentration (kg/m³)');
        drawChart(document.getElementById('chartT'), tSeries, 'Time (h)', 'T (°C)', 'Temperature (°C)');

        // Final state table
        const finalState = results[results.length - 1];
        document.getElementById('finalTimeLabel').textContent = `t = ${(finalState.t / 3600).toFixed(2)} h`;
        const tbody = document.querySelector('#finalTable tbody');
        tbody.innerHTML = '';
        for (const tank of variableTanks) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${tank.name}</td><td>${finalState.y[tank.Cindex].toFixed(6)}</td><td>${(finalState.y[tank.Tindex] - 273.15).toFixed(6)}</td>`;
            tbody.appendChild(tr);
        }

        window.__lastRun = { problem, tanks, results, variableTanks };
    }

    function exportCsv() {
        const run = window.__lastRun;
        if (!run) { resetLog('[!] Run a calculation first.'); return; }
        const headers = ['Tempo'];
        for (const tank of run.variableTanks) headers.push(`C${tank.name}`, `T${tank.name}`);
        const rows = run.results.map((r) => {
            const vals = [r.t];
            for (const tank of run.variableTanks) vals.push(r.y[tank.Cindex], r.y[tank.Tindex]);
            return vals.join(';');
        });
        const csv = [headers.join(';'), ...rows].join('\n');
        downloadFile(csv, `resultados_${run.problem.reaction.enabled ? 'cr' : 'sr'}.csv`, 'text/csv');
    }

    function exportJson() {
        let problem;
        try { problem = collectProblem(); } catch (err) { resetLog('[!] ' + err.message); return; }
        downloadFile(JSON.stringify(problem, null, 2), 'problem.json', 'application/json');
    }

    function downloadFile(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }

    // ---------- Wire up UI ----------

    document.getElementById('addTank').addEventListener('click', () => addTankRow());
    document.getElementById('addPipe').addEventListener('click', () => addPipeRow());
    document.getElementById('calculate').addEventListener('click', runCalculation);
    document.getElementById('loadDefault').addEventListener('click', () => loadProblemIntoForm(DEFAULT_PROBLEM));
    document.getElementById('loadEmpty').addEventListener('click', () => { clearAll(); resetLog('Cleared.'); });
    document.getElementById('exportCsv').addEventListener('click', exportCsv);
    document.getElementById('exportJson').addEventListener('click', exportJson);

    loadProblemIntoForm(DEFAULT_PROBLEM);
})();
