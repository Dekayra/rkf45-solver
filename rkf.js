// Runge-Kutta-Fehlberg 4(5) adaptive-step ODE solver.
// Works in Node (module.exports) and in the browser (window.RKF) via the UMD wrapper below.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RKF = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // f            : array of derivative functions f[j](t, y) -> dy_j/dt
    // y0           : initial state vector
    // t0, tf       : integration interval
    // h0           : initial step size
    // tol          : local error tolerance (max component of the embedded 4th/5th order error)
    // resultados   : optional array to push accepted steps into (also returned)
    // logCallback  : optional callback({t, y}, {t, h}) called on every accepted step
    function rkf(f, y0, t0, h0, tf, tol, resultados, logCallback) {
        resultados = resultados || [];
        logCallback = logCallback || function () {};

        const   A = [0, 1 / 4, 3 / 8, 12 / 13, 1, 1 / 2],
                B = [   [0, 0, 0, 0, 0],
                        [1 / 4, 0, 0, 0, 0],
                        [3 / 32, 9 / 32, 0, 0, 0],
                        [1932 / 2197, -7200 / 2197, 7296 / 2197, 0, 0],
                        [439 / 216, -8, 3680 / 513, -845 / 4104, 0],
                        [-8 / 27, 2, -3544 / 2565, 1859 / 4104, -11 / 40]
            ],  CH = [16 / 135, 0, 6656 / 12825, 28561 / 56430, -9 / 50, 2 / 55],
                CT = [-1 / 360, 0, 128 / 4275, 2197 / 75240, -1 / 50, -2 / 55];

        let t = t0, y = [...y0], h = h0;

        while (t < tf) {
            h = Math.min(h, tf - t, 0.001 * (tf - t0));

            let k = Array.from({ length: 6 }, () => new Array(f.length)),
                TE = new Array(f.length).fill(0);

            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < f.length; j++) {
                    k[i][j] = h * f[j](t + A[i] * h, y.map((yi, idx) => {
                        return B[i].reduce((sum, Bm, m) => { return sum + Bm * (k[m] ? (k[m][idx] || 0) : 0) }, yi)
                    }));
                    TE[j] += CT[i] * k[i][j];
                }
            }

            if (Math.max(...TE.map(Math.abs)) < tol) {
                t += h;
                for (let j = 0; j < f.length; j++) {
                    y[j] = CH.reduce((sum, CHm, m) => { return (sum + CHm * k[m][j]) }, y[j]);
                } // Resultado de 5a Ordem

                logCallback({ t, y: [...y] }, { t, h });

                h *= 3;
            } else {
                h *= 0.5;
            }
        }
        return resultados;
    }

    return rkf;
}));
