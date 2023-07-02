# Five-Tank Reactor Network — Runge-Kutta-Fehlberg Simulation

*University assignment (FURB — Modelos e Métodos Matemáticos em Engenharia Química) solved with a custom RKF45 ODE solver written in JavaScript.*

🇧🇷 [Leia em Português](#-pt-br) | 🇺🇸 [Read in English](#-en-us)

---

## 🇺🇸 EN-US

### What this repo is

This is a university project for the *Mathematical Models and Methods in Chemical Engineering* course at FURB (Fundação Universitária Regional de Blumenau). It implements the **Runge-Kutta-Fehlberg (RKF45)** method — an adaptive-step-size numerical ODE solver — from scratch in plain JavaScript, and uses it to simulate the transient behavior of a network of interconnected mixing tanks with an optional exothermic chemical reaction.

- `rkf.js` — the generic RKF45 solver (adaptive step size, embedded 4th/5th order error estimate).
- `codigo.js` — the problem setup: tank/pipe network, mass and energy balances, and the script that runs the simulation and exports results to CSV.
- `Ricardo_Solução.pdf` — the full handed-in solution: the derivation of the balance equations, the RKF theory, the annotated code, and the final result plots/tables.
- `PROBLEMA_ORIGINAL.md` — the original assignment statement, in Portuguese, exactly as given by the professor (kept for reference).
- `tanques.png` — the tank/pipe network diagram (see below).

### What is RKF (Runge-Kutta-Fehlberg)?

RKF45 is a numerical method for solving ordinary differential equations (ODEs) that don't have a closed-form analytical solution. Like the classic Runge-Kutta method, it advances the solution step by step using a weighted combination of derivative evaluations at intermediate points. What makes it special is that it computes **two solutions of different order (4th and 5th)** at every step using the same function evaluations; the difference between them estimates the local error, which is used to automatically shrink or grow the step size (`h`) — small steps where the solution changes fast, large steps where it doesn't. This makes it accurate and efficient without having to hand-tune the step size.

### The problem

Five perfectly-mixed, adiabatic tanks (volumes 10, 5, 12, 6 and 15 m³) are connected by pipes as shown below. Two external feed streams enter the network:

- Feed into Tank 1: 5 m³/h at 10 g/L, 70 °C
- Feed into Tank 3: 8 m³/h at 20 g/L, 10 °C

![Tank network diagram](tanques.png)

An exothermic decomposition reaction of a generic species may take place inside the tanks, with kinetics `r = -k·C²`, where `k = 10³·exp((34.34 − 34222)/T)` L/(g·min) (T in Kelvin) and released energy `ΔHr = -80,000 J/g`.

**Goal:** starting from 0 g/L concentration and 20 °C in every tank, determine the evolution of concentration (C₁…C₅) and temperature (T₁…T₅) over 24 hours, for two cases:
1. Without reaction (linear ODE system).
2. With reaction (non-linear ODE system).

The system boils down to 10 coupled ODEs (mass and energy balance per tank), solved simultaneously with the RKF45 method.

### Results

**Case 1 — without reaction** (final state at t = 24 h):

| Tank | Concentration [kg/m³] | Temperature [°C] |
|---|---|---|
| 1 | 11.509327 | 60.943147 |
| 2 | 11.508950 | 60.942269 |
| 3 | 19.056462 | 15.660045 |
| 4 | 16.987486 | 27.977508 |
| 5 | 11.459569 | 60.791395 |

**Case 2 — with reaction** (final state at t = 24 h):

| Tank | Concentration [kg/m³] | Temperature [°C] |
|---|---|---|
| 1 | 11.509327 | 60.943147 |
| 2 | 11.508950 | 60.942269 |
| 3 | 19.056462 | 15.660045 |
| 4 | 16.987486 | 27.977508 |
| 5 | 11.459569 | 60.791395 |

The two cases converge to essentially the same values: the reaction rate constant, evaluated at the process temperatures, is many orders of magnitude smaller than the mass/energy exchanged by the flows in and out of each tank (e.g. `dC1/dt` inflow/outflow term ≈ 1.25×10⁻³ vs. reaction term ≈ 1.13×10⁻⁴⁸), so the reaction term is effectively negligible here. Full transient plots, the error-tolerance/step-size sensitivity discussion (including a divergence case caused by too large a max step), and the complete derivation are in [`Ricardo_Solução.pdf`](Ricardo_Solução.pdf).

### Running it

```bash
node codigo.js
```

Set `useReaction` (true/false) at the bottom of `codigo.js` to switch between the two cases. Results are written to `resultados_sr.csv` (sem reação) or `resultados_cr.csv` (com reação).

---

## 🇧🇷 PT-BR

### O que é este repositório

Este é um projeto acadêmico da disciplina de *Modelos e Métodos Matemáticos em Engenharia Química* da FURB (Fundação Universitária Regional de Blumenau). Nele foi implementado, do zero, em JavaScript puro, o método **Runge-Kutta-Fehlberg (RKF45)** — um solver numérico de EDOs com passo adaptativo — utilizado para simular o comportamento transiente de uma rede de tanques de mistura interligados, com uma reação química exotérmica opcional.

- `rkf.js` — o solver RKF45 genérico (passo adaptativo, estimativa de erro embutida entre 4ª e 5ª ordem).
- `codigo.js` — a modelagem do problema: rede de tanques/tubulações, balanços de massa e energia, e o script que executa a simulação e exporta os resultados em CSV.
- `Ricardo_Solução.pdf` — a solução completa entregue: dedução das equações de balanço, teoria do RKF, código comentado e os gráficos/tabelas de resultado finais.
- `PROBLEMA_ORIGINAL.md` — o enunciado original do trabalho, tal como fornecido pelo professor (mantido para referência).
- `tanques.png` — o diagrama da rede de tanques e tubulações (veja abaixo).

### O que é o RKF (Runge-Kutta-Fehlberg)?

O RKF45 é um método numérico para resolver equações diferenciais ordinárias (EDOs) que não possuem solução analítica fechada. Assim como o método clássico de Runge-Kutta, ele avança a solução passo a passo usando uma combinação ponderada de avaliações da derivada em pontos intermediários. Sua particularidade é calcular **duas soluções de ordens diferentes (4ª e 5ª)** a cada passo, reaproveitando as mesmas avaliações da função; a diferença entre elas estima o erro local, usado para aumentar ou reduzir automaticamente o tamanho do passo (`h`) — passos pequenos onde a solução varia rápido, passos grandes onde ela é mais estável. Isso garante precisão e eficiência sem a necessidade de ajustar manualmente o passo.

### O problema

Cinco tanques de mistura perfeita, adiabáticos (volumes de 10, 5, 12, 6 e 15 m³) são interligados por tubulações conforme o diagrama abaixo. Duas correntes de alimentação externas entram na rede:

- Alimentação no Tanque 1: 5 m³/h a 10 g/L, 70 °C
- Alimentação no Tanque 3: 8 m³/h a 20 g/L, 10 °C

![Diagrama da rede de tanques](tanques.png)

Uma reação química de decomposição exotérmica de uma espécie genérica pode ocorrer nos tanques, com cinética `r = -k·C²`, onde `k = 10³·exp((34,34 − 34222)/T)` L/(g·min) (T em Kelvin) e energia liberada `ΔHr = -80.000 J/g`.

**Objetivo:** partindo de concentração 0 g/L e temperatura 20 °C em todos os tanques, determinar a evolução da concentração (C₁…C₅) e da temperatura (T₁…T₅) ao longo de 24 horas, em dois casos:
1. Sem reação (sistema linear de EDOs).
2. Com reação (sistema não-linear de EDOs).

O sistema resulta em 10 EDOs acopladas (balanço de massa e energia por tanque), resolvidas simultaneamente com o método RKF45.

### Resultados

**Caso 01 — sem reação** (condição final em t = 24 h):

| Tanque | Concentração [kg/m³] | Temperatura [°C] |
|---|---|---|
| 1 | 11.509327 | 60.943147 |
| 2 | 11.508950 | 60.942269 |
| 3 | 19.056462 | 15.660045 |
| 4 | 16.987486 | 27.977508 |
| 5 | 11.459569 | 60.791395 |

**Caso 02 — com reação** (condição final em t = 24 h):

| Tanque | Concentração [kg/m³] | Temperatura [°C] |
|---|---|---|
| 1 | 11.509327 | 60.943147 |
| 2 | 11.508950 | 60.942269 |
| 3 | 19.056462 | 15.660045 |
| 4 | 16.987486 | 27.977508 |
| 5 | 11.459569 | 60.791395 |

Os dois casos convergem para praticamente os mesmos valores: a constante de velocidade de reação, avaliada nas temperaturas do processo, é muitas ordens de grandeza menor que os termos de entrada/saída de massa e energia de cada tanque (ex.: termo de entrada/saída em `dC1/dt` ≈ 1,25×10⁻³ contra termo de reação ≈ 1,13×10⁻⁴⁸), tornando a reação praticamente desprezível neste caso. Os gráficos completos da evolução temporal, a discussão sobre sensibilidade de tolerância/passo (incluindo um caso de divergência causado por um passo máximo grande demais) e a dedução completa estão em [`Ricardo_Solução.pdf`](Ricardo_Solução.pdf).

### Executando

```bash
node codigo.js
```

Ajuste `useReaction` (true/false) no final de `codigo.js` para alternar entre os dois casos. Os resultados são salvos em `resultados_sr.csv` (sem reação) ou `resultados_cr.csv` (com reação).
