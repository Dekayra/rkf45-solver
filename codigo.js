const rkf = require('./rkf.js');

const fs = require('fs'); function salvarResultados(resultados) {
    const headers = ['Tempo'];
    for (let i = 1; i <= resultados[0].y.length / 2; i++) {
      headers.push(`C${i}`, `T${i}`);
    }
  
    const data = resultados.map((resultado) => {
      const t = resultado.t ? resultado.t.toString().replace('.', ',') : 0;
      const y = resultado.y.map((valor) => valor.toString().replace('.', ','));
      return [t, ...y];
    });
  
    const csvData = [headers, ...data];
    const csvContent = csvData.map((row) => row.join(';')).join('\n');
    fs.writeFileSync(`resultados_${useReaction ? "cr" : "sr"}.csv`, csvContent);
}

class Tanque {
    constructor(name, concentration = 0, temperature = 20, volume = 1) {
        this.name = name;
        this.C = concentration; // kg/m³
        this.T = (temperature+273.15); // K
        this.V = volume; // m³
    }

    calcularDerivadaConcentracao(t, y){
        let somaEntradaC = 0, somaSaidaC = 0;
        let Ti = y[this.Tindex], Ci = y[this.Cindex], k = Reaction.k(Ti);
        for (let i = 0; i < pipes.length; i++) {
            const pipe = pipes[i];
            somaEntradaC += pipe.f === this.name ? pipe.Q * y[tanque[pipe.i].Cindex] : 0;
            somaSaidaC += pipe.i === this.name ? pipe.Q * Ci : 0;
        } 
        let dCdt = (((somaEntradaC - somaSaidaC) / this.V) - (k * Ci * Ci));

        return dCdt;
    }

    calcularDerivadaTemperatura(t, y){
        let somaEntradaT = 0, somaSaidaT = 0;
        let Ti = y[this.Tindex], Ci = y[this.Cindex], k = Reaction.k(Ti);
        for (let i = 0; i < pipes.length; i++) {
            const pipe = pipes[i];
            somaEntradaT += pipe.f === this.name ? pipe.Q * y[tanque[pipe.i].Tindex] : 0;
            somaSaidaT += pipe.i === this.name ? pipe.Q * Ti : 0;
        }
        let dTdt = ((somaEntradaT - somaSaidaT)/(this.V) - (Reaction.ΔHr() * k * Ci* Ci)/(Water.ρ * Water.Cp))
        return dTdt;
    }
}

class Pipe {
    constructor(origem, destino, flow) {
        this.i = origem; // inicial
        this.f = destino; // final
        this.Q = (flow/3600); // m³/s
    }
}

class Water {
    static ρ = 994; // kg/m³
    static Cp=4186; // J/kg.°C
}

class Reaction {
    static R = 8.314 // J/mol.K
    static ΔHr() {return -80000000} // J/kg
    static k(Temperature) {return useReaction ? (Math.exp(-34187.66 / (Temperature)) * 1000 / 60) : 0} // m³/kg.s
}

function realizarCalculos(){
    let f = [], y0 = [], resultados = [];
    let logTimeLast=0, logTimeInterval=10, logTime = 0;
    let tempoInicio = Date.now();
    
    console.log(`[i] Preparando condições iniciais.`); // Escrever as funções e valores iniciais
    for (let key in tanque) {
        if (!isNaN(parseFloat(key)) && isFinite(key)) {
          y0.push(tanque[key].C); tanque[key].Cindex = y0.length - 1
          f.push((t, y) => tanque[key].calcularDerivadaConcentracao(t, y))
          y0.push(tanque[key].T); tanque[key].Tindex = y0.length - 1
          f.push((t, y) => tanque[key].calcularDerivadaTemperatura(t, y))
        }
    }
    for (let key in tanque) {
        if (isNaN(key)) {
            y0.push(tanque[key].C); tanque[key].Cindex = y0.length - 1
            y0.push(tanque[key].T); tanque[key].Tindex = y0.length - 1
        }
    }
    resultados.push({ t: t0, y: [...y0] }); // Salvar as condições iniciais

    console.log(`[i] Iniciando RKF.`); // Iniciar RKF
    rkf(f, y0, t0, h0, tf, resultados, logCallback)

    logCallback(resultados[resultados.length-1], undefined, false)

    console.log(`[i] Salvando Resultados.`); // Escrever resultados em um arquivo
    salvarResultados(resultados)

    console.log(`[i] Finalizado. Tempo de execução: ${(Date.now() - tempoInicio)/1000}s`);

    return resultados
    
    function logCallback(resultado, info = {}, isRKF = true) {
        if(info.t - logTimeLast > logTimeInterval || !isRKF){ logTimeLast = info.t
            resultados.push(resultado);
        }
        if(Date.now() - logTime > 250 || !isRKF) {logTime = Date.now()
            if(isRKF){
                console.log(`t= ${(info.t).toFixed(4)}s\t\t${(info.t*100/tf).toFixed(4)}%\t\th=${info.h.toFixed(4)}`);
            } else { console.log(`Condições Finais:`)} 
            console.log(`Tanque 1: C=${resultado.y[0].toFixed(6)} T=${(resultado.y[1]-273.15).toFixed(6)} °C`)
            console.log(`Tanque 2: C=${resultado.y[2].toFixed(6)} T=${(resultado.y[3]-273.15).toFixed(6)} °C`)
            console.log(`Tanque 3: C=${resultado.y[4].toFixed(6)} T=${(resultado.y[5]-273.15).toFixed(6)} °C`)
            console.log(`Tanque 4: C=${resultado.y[6].toFixed(6)} T=${(resultado.y[7]-273.15).toFixed(6)} °C`)
            console.log(`Tanque 5: C=${resultado.y[8].toFixed(6)} T=${(resultado.y[9]-273.15).toFixed(6)} °C`)
            console.log('------------------------');
        }
    }
}

// Entrada de Dados
const tanque = {
    inf1: new Tanque("inf1", 10, 70),
    inf3: new Tanque("inf3", 20, 10),
    1: new Tanque(1, undefined, undefined, 10),
    2: new Tanque(2, undefined, undefined, 5),
    3: new Tanque(3, undefined, undefined, 12),
    4: new Tanque(4, undefined, undefined, 6),
    5: new Tanque(5, undefined, undefined, 15),
    inf4: new Tanque("inf4"),
    inf5: new Tanque("inf5")
}

const pipes = [
    new Pipe("inf1", 1, 5),
    new Pipe("inf3", 3, 8),
    new Pipe(1, 2, 3),
    new Pipe(1, 5, 3),
    new Pipe(2, 3, 1),
    new Pipe(2, 4, 1),
    new Pipe(2, 5, 1),
    new Pipe(3, 1, 1),
    new Pipe(3, 4, 8),
    new Pipe(4, "inf4", 11),
    new Pipe(5, 4, 2),
    new Pipe(5, "inf5", 2),
]

global.t0 = 0;
global.tf = 24*3600;
global.h0 = 1;
global.tol= 0.0000000001;

// useReaction pode ser definido via argumento de linha de comando:
//   node codigo.js true   -> com reação
//   node codigo.js false  -> sem reação
//   node codigo.js        -> usa o padrão (true, com reação)
function parseUseReactionArg(argv) {
    const arg = argv[2];
    if (arg === undefined) return true;
    const normalized = arg.trim().toLowerCase();
    if (['true', '1', 'com', 'cr'].includes(normalized)) return true;
    if (['false', '0', 'sem', 'sr'].includes(normalized)) return false;
    console.warn(`[!] Argumento "${arg}" não reconhecido para useReaction. Use true/false. Usando padrão: true.`);
    return true;
}
global.useReaction = parseUseReactionArg(process.argv);

realizarCalculos();
