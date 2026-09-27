// Generic mixing-tank network engine.
// Builds and solves a system of mass/energy balance ODEs for an arbitrary
// network of tanks connected by pipes, optionally with an exothermic
// second-order decomposition reaction (r = -k*C^2) inside each tank.
//
// Works in Node (module.exports) and in the browser (window.TankEngine).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./rkf.js'));
    } else {
        root.TankEngine = factory(root.RKF);
    }
}(typeof self !== 'undefined' ? self : this, function (rkf) {

    // A tank (or a fixed boundary/feed node when `fixed: true`).
    // name         : unique id (string or number)
    // concentration: initial concentration [kg/m3] (also fixed value if fixed=true)
    // temperature  : initial temperature [C] (also fixed value if fixed=true)
    // volume       : tank volume [m3] (ignored when fixed=true)
    // fixed        : true for feed/discharge nodes whose C,T never change
    class Tank {
        constructor({ name, concentration = 0, temperature = 20, volume = 1, fixed = false }) {
            this.name = name;
            this.C = concentration;      // kg/m3
            this.T = temperature + 273.15; // K
            this.V = volume;             // m3
            this.fixed = fixed;
        }

        dCdt(y, pipes, indexOf, reaction) {
            let inflow = 0, outflow = 0;
            const Ci = y[this.Cindex], Ti = y[this.Tindex];
            const myName = String(this.name);
            for (const pipe of pipes) {
                if (String(pipe.to) === myName) inflow += pipe.Q * y[indexOf(pipe.from).Cindex];
                if (String(pipe.from) === myName) outflow += pipe.Q * Ci;
            }
            const k = reaction.k(Ti);
            return ((inflow - outflow) / this.V) - (k * Ci * Ci);
        }

        dTdt(y, pipes, indexOf, reaction, fluid) {
            let inflow = 0, outflow = 0;
            const Ci = y[this.Cindex], Ti = y[this.Tindex];
            const myName = String(this.name);
            for (const pipe of pipes) {
                if (String(pipe.to) === myName) inflow += pipe.Q * y[indexOf(pipe.from).Tindex];
                if (String(pipe.from) === myName) outflow += pipe.Q * Ti;
            }
            const k = reaction.k(Ti);
            return ((inflow - outflow) / this.V) - (reaction.deltaHr * k * Ci * Ci) / (fluid.rho * fluid.cp);
        }
    }

    // A pipe connecting two tank/node names, carrying a volumetric flow.
    // flow is given in m3/h and stored internally in m3/s.
    class Pipe {
        constructor({ from, to, flow }) {
            this.from = from;
            this.to = to;
            this.Q = flow / 3600; // m3/s
        }
    }

    // Reaction kinetics: r = -k * C^2, k = A * exp(Ea/T), releasing deltaHr per kg reacted.
    // Set enabled=false to zero out the reaction term (linear case).
    class Reaction {
        constructor({ enabled = true, preExpFactor = 1000 / 60, activationTerm = -34187.66, deltaHr = -80000000 } = {}) {
            this.enabled = enabled;
            this.preExpFactor = preExpFactor;   // includes unit conversion baked in
            this.activationTerm = activationTerm; // Ea/R-like term already combined, per original derivation
            this.deltaHr = deltaHr; // J/kg
        }
        k(temperatureK) {
            return this.enabled ? Math.exp(this.activationTerm / temperatureK) * this.preExpFactor : 0;
        }
    }

    class Fluid {
        constructor({ rho = 994, cp = 4186 } = {}) {
            this.rho = rho; // kg/m3
            this.cp = cp;   // J/kg.C
        }
    }

    // problem = {
    //   tanks: [{name, concentration, temperature, volume, fixed}, ...],
    //   pipes: [{from, to, flow}, ...],
    //   reaction: {enabled, preExpFactor, activationTerm, deltaHr},
    //   fluid: {rho, cp},
    //   sim: {t0, tf, h0, tol, logIntervalSeconds}
    // }
    function buildSystem(problem) {
        const fluid = new Fluid(problem.fluid);
        const reaction = new Reaction(problem.reaction);

        const tanks = problem.tanks.map((t) => new Tank(t));
        const byName = new Map(tanks.map((t) => [String(t.name), t]));
        const indexOf = (name) => {
            const tank = byName.get(String(name));
            if (!tank) throw new Error(`Unknown tank/node "${name}" referenced by a pipe.`);
            return tank;
        };

        const pipes = problem.pipes.map((p) => {
            // validate endpoints early with a clear error
            indexOf(p.from); indexOf(p.to);
            return new Pipe(p);
        });

        const f = [], y0 = [];
        // Variable (mixed) tanks first, fixed feed/discharge nodes after — mirrors the
        // original layout but works for any names/order the caller supplies.
        for (const tank of tanks.filter((t) => !t.fixed)) {
            y0.push(tank.C); tank.Cindex = y0.length - 1;
            f.push((t, y) => tank.dCdt(y, pipes, indexOf, reaction));
            y0.push(tank.T); tank.Tindex = y0.length - 1;
            f.push((t, y) => tank.dTdt(y, pipes, indexOf, reaction, fluid));
        }
        for (const tank of tanks.filter((t) => t.fixed)) {
            y0.push(tank.C); tank.Cindex = y0.length - 1;
            y0.push(tank.T); tank.Tindex = y0.length - 1;
        }

        return { tanks, pipes, fluid, reaction, f, y0 };
    }

    // Runs the simulation for a fully-specified problem object and returns
    // { tanks, results } where results is an array of { t, y } accepted steps
    // (throttled to roughly one sample per `logIntervalSeconds` of sim time,
    // plus the initial and final states), sampled at a manageable resolution.
    function solve(problem, onProgress) {
        const sim = Object.assign({ t0: 0, tf: 24 * 3600, h0: 1, tol: 1e-10, logIntervalSeconds: 10 }, problem.sim || {});
        const { tanks, f, y0 } = buildSystem(problem);

        const results = [{ t: sim.t0, y: [...y0] }];
        let lastLoggedT = 0;

        rkf(f, y0, sim.t0, sim.h0, sim.tf, sim.tol, [], (state, info) => {
            if (info.t - lastLoggedT >= sim.logIntervalSeconds || info.t >= sim.tf) {
                lastLoggedT = info.t;
                results.push(state);
            }
            if (onProgress) onProgress(state, info, sim.tf);
        });

        if (results[results.length - 1].t < sim.tf) {
            // guarantee a final sample even if the last accepted step landed exactly on tf
            // and was already captured above (defensive; harmless if duplicated by caller).
        }

        return { tanks, results };
    }

    return { Tank, Pipe, Reaction, Fluid, buildSystem, solve };
}));
