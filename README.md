# Euler Atlas

A browser-based tool for visualizing first-order ordinary differential equations using numerical methods. Enter a differential equation, set an initial condition, choose a step size, and the app renders the slope field, the approximation path, and a full iteration table simultaneously.

## What it does

Given a differential equation of the form dy/dx = f(x, y) and an initial condition (x0, y0), Euler Atlas walks through the chosen numerical method step by step and plots the result. The slope field updates alongside the approximation, so you can see how well the method tracks the true behavior of the equation.

Four estimation methods are available:

- **Euler** - the classic forward-step method
- **Improved Euler (Heun's method)** - averages the slope at the start and end of each interval
- **Midpoint** - evaluates the slope at the midpoint of each interval
- **RK4** - fourth-order Runge-Kutta, the standard workhorse for most practical applications

The step count and step size are linked: adjusting one recalculates the other from the final x value you specify. The iteration table shows every column of the standard Euler layout: n, x_n, y_n, the effective slope, delta-y, x_{n+1}, and y_{n+1}.

## Getting started

Node 18 or later is required.

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173` by default.

To build for production:

```bash
npm run build
```

The output lands in `dist/`.

## Equation input

Equations can be typed in standard notation or LaTeX-like syntax. Implicit multiplication is supported, so `2x`, `xy`, and `2sin(x)y` all parse correctly. The following functions and constants are recognized:

- **Functions:** `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `exp`, `log` (natural), `log10`, `sqrt`, `abs`
- **Constants:** `pi`, `e`
- **LaTeX shortcuts:** `\sin`, `\cos`, `\frac{a}{b}`, `\sqrt{x}`, `\cdot`, `\times`, `\ln`, `\pi`

The input field uses MathLive, so equations render as you type.

## Tech stack

- Vue 3 with the Composition API and TypeScript
- Vite
- mathjs for expression parsing and evaluation
- MathLive for the math input field
- KaTeX for rendering math in the UI
- Plain SVG for the plot

## Project structure

```
src/
  lib/
    euler.ts      # All numerical methods, expression parsing, slope field, and SVG helpers
  App.vue         # Single-page UI: controls, plot, and iteration table
  main.ts         # App entry point
  styles.css      # Global styles
```

All of the math lives in `euler.ts`. The expression evaluator runs a whitelist check against the AST after parsing, so arbitrary code cannot be injected through the equation field.
