(function () {
    'use strict';

    // ===================== Model =====================
    // tanks: [{id, name, x, y, concentration, temperature, volume, fixed}]
    // pipes: [{id, from: tankId, to: tankId, flow}]
    let tanks = [];
    let pipes = [];
    let nextTankId = 1;
    let nextPipeId = 1;

    let selection = null; // { type: 'tank'|'pipe', id }
    let connectMode = false;
    let connectSource = null; // tank id awaiting a second tap

    const RADIUS_MIN = 16, RADIUS_MAX = 70, RADIUS_BASE = 18, RADIUS_K = 7;
    function volumeToRadius(v) {
        const r = RADIUS_BASE + Math.sqrt(Math.max(v, 0.01)) * RADIUS_K;
        return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, r));
    }
    function radiusToVolume(r) {
        const rr = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, r));
        return Math.pow((rr - RADIUS_BASE) / RADIUS_K, 2);
    }

    function findTank(id) { return tanks.find((t) => t.id === id); }
    function findPipe(id) { return pipes.find((p) => p.id === id); }

    function uniqueName(prefix) {
        let i = 1;
        const names = new Set(tanks.map((t) => t.name));
        while (names.has(prefix + i)) i++;
        return prefix + i;
    }

    // ===================== SVG canvas / view =====================

    const svg = document.getElementById('canvas');
    const NS = 'http://www.w3.org/2000/svg';
    const WORLD_W = 1000, WORLD_H = 620;
    let view = { x: 0, y: 0, zoom: 1 };

    function applyViewBox() {
        const w = WORLD_W / view.zoom, h = WORLD_H / view.zoom;
        svg.setAttribute('viewBox', `${view.x} ${view.y} ${w} ${h}`);
    }

    function screenToWorld(clientX, clientY) {
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        const inv = ctm.inverse();
        const p = pt.matrixTransform(inv);
        return { x: p.x, y: p.y };
    }

    function el(tag, attrs, parent) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    // ===================== Rendering =====================

    function render() {
        svg.innerHTML = '';
        const bg = el('rect', { x: view.x - 2000, y: view.y - 2000, width: 6000, height: 6000, fill: 'transparent', id: 'bgRect' }, svg);

        const pipeLayer = el('g', { id: 'pipeLayer' }, svg);
        const tankLayer = el('g', { id: 'tankLayer' }, svg);

        for (const pipe of pipes) {
            const from = findTank(pipe.from), to = findTank(pipe.to);
            if (!from || !to) continue;
            const g = el('g', { class: 'pipe-group', 'data-id': pipe.id }, pipeLayer);
            const dx = to.x - from.x, dy = to.y - from.y;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist, uy = dy / dist;
            const fromR = from.fixed ? 26 : volumeToRadius(from.volume);
            const toR = to.fixed ? 26 : volumeToRadius(to.volume);
            const x1 = from.x + ux * fromR, y1 = from.y + uy * fromR;
            const x2 = to.x - ux * toR, y2 = to.y - uy * toR;
            const midx = (x1 + x2) / 2, midy = (y1 + y2) / 2;

            el('path', { d: `M${x1},${y1} L${x2},${y2}`, class: 'pipe-hit' }, g);
            const isSel = selection && selection.type === 'pipe' && selection.id === pipe.id;
            const line = el('path', { d: `M${x1},${y1} L${x2},${y2}`, class: 'pipe-line' + (isSel ? ' selected' : ''), 'marker-end': 'url(#arrow)' }, g);
            el('text', { x: midx, y: midy - 6, class: 'pipe-label' }, g).textContent = `${pipe.flow} m³/h`;

            g.addEventListener('pointerdown', (evt) => {
                evt.stopPropagation();
                selectItem('pipe', pipe.id);
            });
        }

        // arrowhead marker
        const defs = el('defs', {}, svg);
        const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#6b7aa0' }, marker);

        for (const tank of tanks) {
            const g = el('g', { class: 'tank-node ' + (tank.fixed ? 'tank-fixed' : 'tank-var') + (selection && selection.type === 'tank' && selection.id === tank.id ? ' tank-selected' : '') + (connectMode && connectSource === tank.id ? ' tank-pending' : ''), 'data-id': tank.id }, tankLayer);

            if (tank.fixed) {
                el('rect', { x: tank.x - 30, y: tank.y - 20, width: 60, height: 40, rx: 8 }, g);
            } else {
                const r = volumeToRadius(tank.volume);
                el('circle', { cx: tank.x, cy: tank.y, r }, g);
                // resize handle at bottom-right of bounding circle
                const hx = tank.x + r * 0.7071, hy = tank.y + r * 0.7071;
                el('circle', { cx: hx, cy: hy, r: 7, class: 'resize-handle', 'data-role': 'resize', 'data-id': tank.id }, g);
            }

            el('text', { x: tank.x, y: tank.y - 2, class: 'tank-label' }, g).textContent = tank.name;
            const sub = tank.fixed ? `${tank.concentration}kg/m³ ${tank.temperature}°C` : `${tank.volume}m³`;
            el('text', { x: tank.x, y: tank.y + 14, class: 'tank-sub' }, g).textContent = sub;

            g.addEventListener('pointerdown', (evt) => onTankPointerDown(evt, tank));
        }

        applyViewBox();
        renderPropsPanel();
    }

    // ===================== Pointer interaction =====================

    let pointers = new Map(); // pointerId -> {x, y} in screen coords
    let mode = null; // 'pan' | 'dragTank' | 'resize' | 'pinch'
    let dragTankId = null;
    let dragOffset = { x: 0, y: 0 };
    let pinchStartDist = 0, pinchStartZoom = 1, pinchMid = { x: 0, y: 0 };
    let panStartWorld = null;
    let downPos = null;
    const TAP_THRESHOLD = 8;

    svg.addEventListener('pointerdown', (evt) => {
        pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
        downPos = { x: evt.clientX, y: evt.clientY };

        if (pointers.size >= 2) {
            mode = 'pinch';
            const pts = Array.from(pointers.values());
            pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            pinchStartZoom = view.zoom;
            pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
            return;
        }

        const target = evt.target;
        if (target && target.dataset && target.dataset.role === 'resize') {
            mode = 'resize';
            dragTankId = parseInt(target.dataset.id, 10);
            svg.setPointerCapture(evt.pointerId);
            return;
        }
        if (target && target.id === 'bgRect') {
            mode = 'pan';
            panStartWorld = screenToWorld(evt.clientX, evt.clientY);
            svg.setPointerCapture(evt.pointerId);
        }
    });

    function onTankPointerDown(evt, tank) {
        evt.stopPropagation();
        pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
        downPos = { x: evt.clientX, y: evt.clientY };

        if (connectMode) {
            if (connectSource === null) {
                connectSource = tank.id;
                render();
            } else if (connectSource !== tank.id) {
                const pipe = { id: nextPipeId++, from: connectSource, to: tank.id, flow: 1 };
                pipes.push(pipe);
                connectSource = null;
                selectItem('pipe', pipe.id);
            }
            return;
        }

        mode = 'dragTank';
        dragTankId = tank.id;
        const world = screenToWorld(evt.clientX, evt.clientY);
        dragOffset = { x: world.x - tank.x, y: world.y - tank.y };
        svg.setPointerCapture(evt.pointerId);
    }

    svg.addEventListener('pointermove', (evt) => {
        if (!pointers.has(evt.pointerId)) return;
        pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

        if (mode === 'pinch' && pointers.size >= 2) {
            const pts = Array.from(pointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            const ratio = dist / pinchStartDist;
            const worldBefore = screenToWorld(pinchMid.x, pinchMid.y);
            view.zoom = Math.min(4, Math.max(0.3, pinchStartZoom * ratio));
            applyViewBox();
            const worldAfter = screenToWorld(pinchMid.x, pinchMid.y);
            view.x += worldBefore.x - worldAfter.x;
            view.y += worldBefore.y - worldAfter.y;
            applyViewBox();
            return;
        }

        if (mode === 'pan') {
            const world = screenToWorld(evt.clientX, evt.clientY);
            view.x -= (world.x - panStartWorld.x);
            view.y -= (world.y - panStartWorld.y);
            applyViewBox();
            return;
        }

        if (mode === 'dragTank' && dragTankId !== null) {
            const tank = findTank(dragTankId);
            if (!tank) return;
            const world = screenToWorld(evt.clientX, evt.clientY);
            tank.x = world.x - dragOffset.x;
            tank.y = world.y - dragOffset.y;
            render();
            return;
        }

        if (mode === 'resize' && dragTankId !== null) {
            const tank = findTank(dragTankId);
            if (!tank || tank.fixed) return;
            const world = screenToWorld(evt.clientX, evt.clientY);
            const dist = Math.hypot(world.x - tank.x, world.y - tank.y) / Math.SQRT1_2;
            tank.volume = Math.round(radiusToVolume(dist) * 100) / 100;
            render();
            return;
        }
    });

    function endPointer(evt) {
        const moved = downPos ? Math.hypot(evt.clientX - downPos.x, evt.clientY - downPos.y) : 999;
        pointers.delete(evt.pointerId);

        if (mode === 'dragTank' && dragTankId !== null && moved < TAP_THRESHOLD) {
            selectItem('tank', dragTankId);
        } else if (mode === 'pan' && moved < TAP_THRESHOLD) {
            selectItem(null, null);
        }

        if (pointers.size < 2 && mode === 'pinch') mode = null;
        if (pointers.size === 0) {
            mode = null; dragTankId = null;
        }
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);

    svg.addEventListener('wheel', (evt) => {
        evt.preventDefault();
        const worldBefore = screenToWorld(evt.clientX, evt.clientY);
        const factor = evt.deltaY < 0 ? 1.12 : 1 / 1.12;
        view.zoom = Math.min(4, Math.max(0.3, view.zoom * factor));
        applyViewBox();
        const worldAfter = screenToWorld(evt.clientX, evt.clientY);
        view.x += worldBefore.x - worldAfter.x;
        view.y += worldBefore.y - worldAfter.y;
        applyViewBox();
    }, { passive: false });

    // ===================== Selection & props panel =====================

    function selectItem(type, id) {
        selection = type ? { type, id } : null;
        render();
    }

    const propsPanel = document.getElementById('propsPanel');

    function renderPropsPanel() {
        if (!selection) { propsPanel.classList.remove('visible'); propsPanel.innerHTML = ''; return; }
        propsPanel.classList.add('visible');

        if (selection.type === 'tank') {
            const tank = findTank(selection.id);
            if (!tank) { propsPanel.classList.remove('visible'); return; }
            propsPanel.innerHTML = `
                <h3>Tank properties</h3>
                <div class="field-row">
                    <div><label>Name</label><input id="p-name" value="${tank.name}"></div>
                    <div><label>Concentration [kg/m³]</label><input id="p-c" value="${tank.concentration}"></div>
                    <div><label>Temperature [°C]</label><input id="p-t" value="${tank.temperature}"></div>
                    ${tank.fixed ? '' : '<div><label>Volume [m³]</label><input id="p-v" value="' + tank.volume + '"></div>'}
                    <div style="display:flex;align-items:center;gap:6px;padding-top:16px">
                        <input type="checkbox" id="p-fixed" ${tank.fixed ? 'checked' : ''}>
                        <label style="margin:0" for="p-fixed">Fixed (feed/discharge)</label>
                    </div>
                </div>
            `;
            document.getElementById('p-name').addEventListener('input', (e) => { tank.name = e.target.value; render(); });
            document.getElementById('p-c').addEventListener('input', (e) => { tank.concentration = parseFloat(e.target.value) || 0; });
            document.getElementById('p-t').addEventListener('input', (e) => { tank.temperature = parseFloat(e.target.value) || 0; });
            const v = document.getElementById('p-v');
            if (v) v.addEventListener('input', (e) => { tank.volume = Math.max(0.01, parseFloat(e.target.value) || 1); render(); });
            document.getElementById('p-fixed').addEventListener('change', (e) => { tank.fixed = e.target.checked; if (tank.fixed) tank.volume = undefined; else tank.volume = tank.volume || 1; render(); });
        }

        if (selection.type === 'pipe') {
            const pipe = findPipe(selection.id);
            if (!pipe) { propsPanel.classList.remove('visible'); return; }
            const from = findTank(pipe.from), to = findTank(pipe.to);
            propsPanel.innerHTML = `
                <h3>Pipe properties</h3>
                <div class="field-row">
                    <div><label>From</label><input value="${from ? from.name : '?'}" disabled></div>
                    <div><label>To</label><input value="${to ? to.name : '?'}" disabled></div>
                    <div><label>Flow [m³/h]</label><input id="p-flow" value="${pipe.flow}"></div>
                </div>
            `;
            document.getElementById('p-flow').addEventListener('input', (e) => { pipe.flow = parseFloat(e.target.value) || 0; render(); });
        }
    }

    // ===================== Toolbar actions =====================

    function addTank(fixed) {
        const centerWorld = screenToWorld(
            svg.getBoundingClientRect().left + svg.clientWidth / 2,
            svg.getBoundingClientRect().top + svg.clientHeight / 2
        );
        const jitter = (tanks.length % 5) * 24;
        const tank = {
            id: nextTankId++,
            name: uniqueName(fixed ? 'F' : 'T'),
            x: centerWorld.x + jitter, y: centerWorld.y + jitter,
            concentration: 0, temperature: 20,
            volume: fixed ? undefined : 1,
            fixed: !!fixed,
        };
        tanks.push(tank);
        selectItem('tank', tank.id);
    }

    function deleteSelected() {
        if (!selection) return;
        if (selection.type === 'tank') {
            tanks = tanks.filter((t) => t.id !== selection.id);
            pipes = pipes.filter((p) => p.from !== selection.id && p.to !== selection.id);
        } else if (selection.type === 'pipe') {
            pipes = pipes.filter((p) => p.id !== selection.id);
        }
        selection = null;
        render();
    }

    function clearAll() {
        tanks = []; pipes = []; selection = null; connectSource = null;
        render();
        resetLog('Cleared.');
    }

    function loadProblemIntoModel(problem) {
        tanks = []; pipes = []; selection = null; connectSource = null;
        nextTankId = 1; nextPipeId = 1;

        const nameToId = new Map();
        const variableTanks = problem.tanks.filter((t) => !t.fixed);
        const fixedTanks = problem.tanks.filter((t) => t.fixed);

        const cols = Math.ceil(Math.sqrt(variableTanks.length)) || 1;
        const spacing = 240;
        variableTanks.forEach((t, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const id = nextTankId++;
            nameToId.set(String(t.name), id);
            tanks.push({
                id, name: String(t.name), x: 200 + col * spacing, y: 180 + row * spacing,
                concentration: t.concentration, temperature: t.temperature, volume: t.volume, fixed: false,
            });
        });

        fixedTanks.forEach((t, i) => {
            const id = nextTankId++;
            nameToId.set(String(t.name), id);
            // place near the first pipe endpoint it touches, offset outward at a
            // wide angle so labels don't overlap the tank it feeds/drains
            const relatedPipe = problem.pipes.find((p) => String(p.from) === String(t.name) || String(p.to) === String(t.name));
            let x = 120 + (i % 3) * 90, y = 60 + Math.floor(i / 3) * 500;
            if (relatedPipe) {
                const otherName = String(relatedPipe.from) === String(t.name) ? relatedPipe.to : relatedPipe.from;
                const otherId = nameToId.get(String(otherName));
                const other = tanks.find((tk) => tk.id === otherId);
                if (other) {
                    const isSource = String(relatedPipe.from) === String(t.name);
                    const angle = (isSource ? 200 : 20) + i * 35;
                    const rad = angle * Math.PI / 180;
                    x = other.x + Math.cos(rad) * 220;
                    y = other.y + Math.sin(rad) * 220;
                }
            }
            tanks.push({ id, name: String(t.name), x, y, concentration: t.concentration, temperature: t.temperature, volume: undefined, fixed: true });
        });

        problem.pipes.forEach((p) => {
            const from = nameToId.get(String(p.from));
            const to = nameToId.get(String(p.to));
            if (from === undefined || to === undefined) return;
            pipes.push({ id: nextPipeId++, from, to, flow: p.flow });
        });

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

        view = { x: 0, y: 0, zoom: 1 };
        render();
    }

    // ===================== Collect problem for solving =====================

    function collectProblem() {
        if (tanks.some((t) => !t.name || !t.name.trim())) throw new Error('Every tank needs a non-empty name.');
        const names = tanks.map((t) => t.name.trim());
        if (new Set(names).size !== names.length) throw new Error('Tank names must be unique.');
        for (const t of tanks) {
            if (!t.fixed && !(t.volume > 0)) throw new Error(`Tank "${t.name}" needs a volume > 0 (or mark it as fixed).`);
        }
        if (pipes.length === 0) throw new Error('Add at least one pipe.');

        const idToName = new Map(tanks.map((t) => [t.id, t.name.trim()]));
        const problemTanks = tanks.map((t) => {
            const obj = { name: t.name.trim(), concentration: t.concentration, temperature: t.temperature, fixed: t.fixed };
            if (!t.fixed) obj.volume = t.volume;
            return obj;
        });
        const problemPipes = pipes.map((p) => ({ from: idToName.get(p.from), to: idToName.get(p.to), flow: p.flow }));

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
            t0: 0, tf: hours * 3600,
            h0: parseFloat(document.getElementById('simH0').value),
            tol: parseFloat(document.getElementById('simTol').value),
            logIntervalSeconds: parseFloat(document.getElementById('simLog').value),
        };

        return { tanks: problemTanks, pipes: problemPipes, reaction, fluid, sim };
    }

    // ===================== Charting =====================

    const palette = ['#4a90d9', '#e2711d', '#9a9a9a', '#f2c811', '#7ed957', '#c084fc', '#ff6b81', '#2dd4bf'];

    function drawChart(canvas, series, title) {
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
        if (allX.length === 0) return;
        const xMin = Math.min(...allX), xMax = Math.max(...allX);
        const yMin = Math.min(0, ...allY), yMax = Math.max(...allY) * 1.05 || 1;

        const xScale = (x) => padL + (x - xMin) / (xMax - xMin || 1) * plotW;
        const yScale = (y) => padT + plotH - (y - yMin) / (yMax - yMin || 1) * plotH;

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

    // ===================== Log helpers =====================

    const logEl = document.getElementById('log');
    function log(msg) { logEl.textContent += '\n' + msg; logEl.scrollTop = logEl.scrollHeight; }
    function resetLog(msg) { logEl.textContent = msg; }

    // ===================== Run =====================

    let lastRun = null;

    function runCalculation() {
        let problem;
        try {
            problem = collectProblem();
        } catch (err) {
            resetLog('[!] ' + err.message);
            return;
        }

        resetLog('[i] Building system...');
        log(`[i] ${problem.tanks.filter((t) => !t.fixed).length} variable tank(s), ${problem.tanks.filter((t) => t.fixed).length} fixed node(s), ${problem.pipes.length} pipe(s).`);
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

        const { tanks: solvedTanks, results } = result;
        const variableTanks = solvedTanks.filter((t) => !t.fixed);

        log(`[i] Done in ${elapsed}s, ${results.length} sampled points.`);

        const cSeries = variableTanks.map((tank, i) => ({
            label: `C${tank.name}`, color: palette[i % palette.length],
            x: results.map((r) => r.t / 3600), y: results.map((r) => r.y[tank.Cindex]),
        }));
        const tSeries = variableTanks.map((tank, i) => ({
            label: `T${tank.name}`, color: palette[i % palette.length],
            x: results.map((r) => r.t / 3600), y: results.map((r) => r.y[tank.Tindex] - 273.15),
        }));
        drawChart(document.getElementById('chartC'), cSeries, 'Concentration (kg/m³)');
        drawChart(document.getElementById('chartT'), tSeries, 'Temperature (°C)');

        const finalState = results[results.length - 1];
        document.getElementById('finalTimeLabel').textContent = `t = ${(finalState.t / 3600).toFixed(2)} h`;
        const tbody = document.querySelector('#finalTable tbody');
        tbody.innerHTML = '';
        for (const tank of variableTanks) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${tank.name}</td><td>${finalState.y[tank.Cindex].toFixed(6)}</td><td>${(finalState.y[tank.Tindex] - 273.15).toFixed(6)}</td>`;
            tbody.appendChild(tr);
        }

        lastRun = { problem, tanks: solvedTanks, results, variableTanks };
    }

    function exportCsv() {
        if (!lastRun) { resetLog('[!] Run a calculation first.'); return; }
        const headers = ['Tempo'];
        for (const tank of lastRun.variableTanks) headers.push(`C${tank.name}`, `T${tank.name}`);
        const rows = lastRun.results.map((r) => {
            const vals = [r.t];
            for (const tank of lastRun.variableTanks) vals.push(r.y[tank.Cindex], r.y[tank.Tindex]);
            return vals.join(';');
        });
        const csv = [headers.join(';'), ...rows].join('\n');
        downloadFile(csv, `resultados_${lastRun.problem.reaction.enabled ? 'cr' : 'sr'}.csv`, 'text/csv');
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

    // ===================== Wire up toolbar =====================

    document.getElementById('addTank').addEventListener('click', () => addTank(false));
    document.getElementById('addFixed').addEventListener('click', () => addTank(true));
    document.getElementById('connectMode').addEventListener('click', (e) => {
        connectMode = !connectMode;
        connectSource = null;
        e.target.classList.toggle('active', connectMode);
        document.getElementById('hint').textContent = connectMode
            ? 'Connect mode: tap a source tank, then a destination tank.'
            : 'Tip: drag empty space to pan, pinch/scroll to zoom.';
        render();
    });
    document.getElementById('deleteSelected').addEventListener('click', deleteSelected);
    document.getElementById('zoomIn').addEventListener('click', () => { view.zoom = Math.min(4, view.zoom * 1.25); applyViewBox(); });
    document.getElementById('zoomOut').addEventListener('click', () => { view.zoom = Math.max(0.3, view.zoom / 1.25); applyViewBox(); });
    document.getElementById('resetView').addEventListener('click', () => { view = { x: 0, y: 0, zoom: 1 }; applyViewBox(); });
    document.getElementById('calculate').addEventListener('click', runCalculation);
    document.getElementById('loadDefault').addEventListener('click', () => loadProblemIntoModel(DEFAULT_PROBLEM));
    document.getElementById('loadEmpty').addEventListener('click', clearAll);
    document.getElementById('exportCsv').addEventListener('click', exportCsv);
    document.getElementById('exportJson').addEventListener('click', exportJson);

    window.addEventListener('resize', render);

    loadProblemIntoModel(DEFAULT_PROBLEM);
})();
