// The original FURB assignment: five perfectly-mixed adiabatic tanks connected
// by pipes, with two external feed streams and an optional exothermic
// decomposition reaction. Expressed as plain data for engine.js / rkf.js.
//
// Works in Node (module.exports) and in the browser (window.DEFAULT_PROBLEM).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DEFAULT_PROBLEM = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    return {
        tanks: [
            // Mixed tanks (volumes from the assignment: 10, 5, 12, 6, 15 m3)
            { name: 1, concentration: 0, temperature: 20, volume: 10 },
            { name: 2, concentration: 0, temperature: 20, volume: 5 },
            { name: 3, concentration: 0, temperature: 20, volume: 12 },
            { name: 4, concentration: 0, temperature: 20, volume: 6 },
            { name: 5, concentration: 0, temperature: 20, volume: 15 },
            // Fixed feed/discharge nodes: concentration & temperature never change
            { name: 'inf1', concentration: 10, temperature: 70, fixed: true },
            { name: 'inf3', concentration: 20, temperature: 10, fixed: true },
            { name: 'inf4', concentration: 0, temperature: 20, fixed: true },
            { name: 'inf5', concentration: 0, temperature: 20, fixed: true },
        ],
        pipes: [
            { from: 'inf1', to: 1, flow: 5 },
            { from: 'inf3', to: 3, flow: 8 },
            { from: 1, to: 2, flow: 3 },
            { from: 1, to: 5, flow: 3 },
            { from: 2, to: 3, flow: 1 },
            { from: 2, to: 4, flow: 1 },
            { from: 2, to: 5, flow: 1 },
            { from: 3, to: 1, flow: 1 },
            { from: 3, to: 4, flow: 8 },
            { from: 4, to: 'inf4', flow: 11 },
            { from: 5, to: 4, flow: 2 },
            { from: 5, to: 'inf5', flow: 2 },
        ],
        reaction: {
            enabled: true,           // toggle for the "with/without reaction" cases
            preExpFactor: 1000 / 60, // pre-exponential factor, already unit-converted (L/g.min -> m3/kg.s)
            activationTerm: -34187.66, // combined activation-energy term (K), from k = 1e3*exp((34.34-34222)/T)
            deltaHr: -80000000,      // J/kg (given as -80,000 J/g in the assignment)
        },
        fluid: {
            rho: 994, // kg/m3 (water)
            cp: 4186, // J/kg.C (water)
        },
        sim: {
            t0: 0,
            tf: 24 * 3600, // 24 h in seconds
            h0: 1,
            tol: 1e-10,
            logIntervalSeconds: 10,
        },
    };
}));
