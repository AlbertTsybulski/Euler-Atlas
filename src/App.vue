<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { renderToString } from 'katex'
import {
  buildSlopeField,
  computeEulerSteps,
  createEvaluator,
  deriveBounds,
  formatNumber,
  toLatex,
  toPolylinePoints,
  type Bounds,
  type EulerStep,
  type FieldSegment,
} from './lib/euler'

type Example = {
  id: 'growth' | 'wave' | 'logistic'
  label: string
  expression: string
  latex: string
  x0: number
  y0: number
  stepSize: number
  steps: number
  xFinal: number
}

const examples: Example[] = [
  {
    id: 'growth',
    label: 'Growth balance',
    expression: 'x + y',
    latex: 'x + y',
    x0: 0,
    y0: 1,
    stepSize: 0.25,
    xFinal: 3,
    steps: 12,
  },
  {
    id: 'wave',
    label: 'Damped wave',
    expression: '\\sin(x) - \\frac{y}{2}',
    latex: '\\sin(x) - \\frac{y}{2}',
    x0: 0,
    y0: 2,
    stepSize: 0.2,
    xFinal: 3.2,
    steps: 16,
  },
  {
    id: 'logistic',
    label: 'Logistic curve',
    expression: 'y \\left(1 - \\frac{y}{5}\\right)',
    latex: 'y \\left(1 - \\frac{y}{5}\\right)',
    x0: 0,
    y0: 0.8,
    stepSize: 0.35,
    xFinal: 4.9,
    steps: 14,
  },
]

const activeExample = ref<Example['id'] | 'custom'>('growth')
const equation = ref(examples[0].expression)
const x0 = ref(examples[0].x0)
const y0 = ref(examples[0].y0)
const stepSize = ref(examples[0].stepSize)
const steps = ref(examples[0].steps)
const xFinal = ref(examples[0].xFinal)
const mathFieldElement = ref<HTMLElement & { value: string } | null>(null)

function renderMath(latex: string): string {
  return renderToString(latex, { throwOnError: false })
}

const equationLatex = computed(() => {
  try {
    return toLatex(equation.value)
  } catch {
    return equation.value
  }
})

const renderedEquation = computed(() => renderMath(`\\frac{dy}{dx} = ${equationLatex.value || '\\text{Enter an equation}'}`))

const evaluatorResult = computed(() => {
  try {
    return {
      evaluator: createEvaluator(equation.value),
      error: '',
    }
  } catch (error) {
    return {
      evaluator: null,
      error: error instanceof Error ? error.message : 'Could not parse the function.',
    }
  }
})

const stepData = computed<EulerStep[]>(() => {
  if (!evaluatorResult.value.evaluator) {
    return []
  }

  try {
    return computeEulerSteps(evaluatorResult.value.evaluator, x0.value, y0.value, stepSize.value, steps.value)
  } catch {
    return []
  }
})

const pathPoints = computed(() => [{ x: x0.value, y: y0.value }, ...stepData.value.map((step) => ({ x: step.nextX, y: step.nextY }))])

const finalStep = computed(() => stepData.value.at(-1) ?? null)

const plotBounds = computed<Bounds>(() => {
  const raw = deriveBounds(pathPoints.value)
  const xPadding = Math.max(stepSize.value * 2.5, (raw.xMax - raw.xMin) * 0.08)
  const yPadding = Math.max(1.8, (raw.yMax - raw.yMin) * 0.18)
  return {
    xMin: raw.xMin - xPadding,
    xMax: raw.xMax + xPadding,
    yMin: raw.yMin - yPadding,
    yMax: raw.yMax + yPadding,
  }
})

const slopeField = computed<FieldSegment[]>(() => {
  if (!evaluatorResult.value.evaluator) {
    return []
  }

  try {
    return buildSlopeField(evaluatorResult.value.evaluator, plotBounds.value, svgWidth, svgHeight)
  } catch {
    return []
  }
})

const svgWidth = 1200
const svgHeight = 760

function toSvgX(value: number): number {
  return ((value - plotBounds.value.xMin) / (plotBounds.value.xMax - plotBounds.value.xMin)) * svgWidth
}

function toSvgY(value: number): number {
  return svgHeight - ((value - plotBounds.value.yMin) / (plotBounds.value.yMax - plotBounds.value.yMin)) * svgHeight
}

const svgPolyline = computed(() =>
  toPolylinePoints(pathPoints.value.map((point) => ({ x: toSvgX(point.x), y: toSvgY(point.y) }))),
)

const svgSegments = computed(() =>
  slopeField.value,
)

const gridLines = computed(() => {
  const lines = [] as Array<{ orientation: 'x' | 'y'; position: number; label: string }>
  const xTicks = 7
  const yTicks = 5
  const xSpan = plotBounds.value.xMax - plotBounds.value.xMin
  const ySpan = plotBounds.value.yMax - plotBounds.value.yMin

  for (let index = 0; index <= xTicks; index += 1) {
    const value = plotBounds.value.xMin + (xSpan * index) / xTicks
    lines.push({ orientation: 'y', position: toSvgX(value), label: formatNumber(value, 1) })
  }

  for (let index = 0; index <= yTicks; index += 1) {
    const value = plotBounds.value.yMin + (ySpan * index) / yTicks
    lines.push({ orientation: 'x', position: toSvgY(value), label: formatNumber(value, 1) })
  }

  return lines
})

const currentSlope = computed(() => {
  if (!finalStep.value) {
    return evaluatorResult.value.evaluator ? evaluatorResult.value.evaluator(x0.value, y0.value) : 0
  }

  return finalStep.value.slope
})

const hasRenderableSteps = computed(() => !evaluatorResult.value.error && stepData.value.length > 0)

const plotKey = computed(() => `${equation.value}|${x0.value}|${xFinal.value}|${y0.value}|${stepSize.value}|${steps.value}`)

function syncStepSizeFromFinalX(): void {
  const span = xFinal.value - x0.value
  if (span <= 0 || steps.value <= 0) {
    return
  }

  stepSize.value = span / steps.value
}

watch([x0, xFinal, steps], syncStepSizeFromFinalX, { immediate: true })

function loadExample(index: number): void {
  const example = examples[index]
  activeExample.value = example.id
  equation.value = example.expression
  x0.value = example.x0
  y0.value = example.y0
  stepSize.value = example.stepSize
  steps.value = example.steps
  xFinal.value = example.xFinal
}

function selectCustomEquation(): void {
  activeExample.value = 'custom'
}

function resetCurrentExample(): void {
  if (activeExample.value === 'custom') {
    loadExample(0)
    return
  }

  const exampleIndex = examples.findIndex((item) => item.id === activeExample.value)
  loadExample(exampleIndex >= 0 ? exampleIndex : 0)
}

function handleFinalXInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const nextValue = Number(target.value)
  if (!Number.isFinite(nextValue)) {
    return
  }

  xFinal.value = nextValue
}

function handleStepsInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const nextValue = Math.max(1, Math.round(Number(target.value)))
  if (!Number.isFinite(nextValue)) {
    return
  }

  steps.value = nextValue
  syncStepSizeFromFinalX()
}

function handleStepSizeInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const nextValue = Number(target.value)
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return
  }

  const span = xFinal.value - x0.value
  if (span <= 0) {
    stepSize.value = nextValue
    return
  }

  steps.value = Math.max(1, Math.round(span / nextValue))
  syncStepSizeFromFinalX()
}

function handleMathFieldInput(event: Event): void {
  const target = event.target as HTMLElement & { value?: string }
  if (typeof target.value === 'string') {
    equation.value = target.value
  }

  activeExample.value = 'custom'
}

watch(
  [equation, activeExample],
  () => {
    if (activeExample.value === 'custom' && mathFieldElement.value) {
      mathFieldElement.value.value = equation.value
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="page-shell">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <main class="app-frame">
      <section class="hero card">
        <div class="hero-copy">
          <p class="eyebrow">Euler Atlas</p>
          <h1>Visualize first-order ODEs with a clean, fast Euler workflow.</h1>
          <p class="lede">
            Enter a differential equation, set the initial condition, and watch the slope field, the
            approximation path, and each numeric step update together.
          </p>
        </div>

        <div class="hero-stats">
          <div class="stat">
            <span>Steps</span>
            <strong>{{ steps }}</strong>
          </div>
          <div class="stat">
            <span>Final estimate</span>
            <strong>{{ finalStep ? formatNumber(finalStep.nextY) : '—' }}</strong>
          </div>
          <div class="stat">
            <span>Start slope</span>
            <strong>{{ formatNumber(currentSlope) }}</strong>
          </div>
        </div>
      </section>

      <section class="layout-grid">
        <aside class="card controls-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Controls</p>
              <h2>Shape the model</h2>
            </div>
            <div class="panel-actions">
              <button type="button" class="ghost-button" @click="resetCurrentExample">Reset</button>
            </div>
          </div>

          <p class="microcopy">
            Try one of the presets, then tweak the equation or step size to see the approximation change instantly.
          </p>

          <div class="preset-grid" role="tablist" aria-label="Example equations">
            <button
              v-for="(example, index) in examples"
              :key="example.label"
              type="button"
              class="preset-card"
              :class="{ active: activeExample === example.id }"
              @click="loadExample(index)"
            >
              <span class="preset-label">{{ example.label }}</span>
              <span class="preset-math" v-html="renderMath(example.latex)"></span>
            </button>

            <button
              type="button"
              class="preset-card custom-card"
              :class="{ active: activeExample === 'custom' }"
              @click="selectCustomEquation"
            >
              <span class="preset-label">Custom</span>
              <span class="preset-math">Type your own DE</span>
            </button>
          </div>

          <div v-if="activeExample === 'custom'" class="field equation-field">
            <span>Custom equation</span>
            <math-field
              ref="mathFieldElement"
              class="math-input"
              :value="equation"
              virtual-keyboard-mode="onfocus"
              @input="handleMathFieldInput"
            ></math-field>
            <p class="microcopy equation-help">Use x and y with e, pi, and functions like sin, cos, tan, exp, log, sqrt, abs.</p>
          </div>

          <div v-else class="summary-card equation-summary">
            <div>
              <span>Selected equation</span>
              <div class="equation-render" v-html="renderedEquation"></div>
            </div>
            <div>
              <span>Mode</span>
              <strong>Preset preview</strong>
            </div>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>x0</span>
              <input v-model.number="x0" type="number" step="0.1" />
            </label>

            <label class="field">
              <span>Final x</span>
              <input :value="xFinal" type="number" step="0.1" @input="handleFinalXInput" />
            </label>

            <label class="field">
              <span>y0</span>
              <input v-model.number="y0" type="number" step="0.1" />
            </label>

            <label class="field">
              <span>Step size</span>
              <input :value="stepSize" type="number" step="0.05" min="0.01" @input="handleStepSizeInput" />
            </label>

            <label class="field">
              <span>Steps</span>
              <input :value="steps" type="number" step="1" min="1" @input="handleStepsInput" />
            </label>
          </div>

          <div v-if="evaluatorResult.error" class="error-banner" role="alert">
            {{ evaluatorResult.error }}
          </div>

          <div v-else class="summary-card metric-card">
            <div>
              <span>Equation</span>
              <strong class="equation-render" v-html="renderedEquation"></strong>
            </div>
            <div>
              <span>Path length</span>
              <strong>{{ stepData.length }} segments</strong>
            </div>
          </div>
        </aside>

        <section class="card plot-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Visualization</p>
              <h2>Slope field and Euler path</h2>
            </div>
          </div>

          <div class="plot-frame">
            <svg :key="plotKey" viewBox="0 0 1200 760" role="img" aria-label="Euler method plot">
              <defs>
                <linearGradient id="pathGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#7cf7d4" />
                  <stop offset="100%" stop-color="#7b8cff" />
                </linearGradient>
                <linearGradient id="segmentGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stop-color="#b6c4ff" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="#b6c4ff" stop-opacity="0.75" />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feColorMatrix
                    in="blur"
                    type="matrix"
                    values="1 0 0 0 0.3 0 1 0 0 0.9 0 0 1 0 0.8 0 0 0 0.75 0"
                  />
                </filter>
              </defs>

              <rect x="0" y="0" width="1200" height="760" class="plot-backdrop"></rect>

              <g class="grid-lines">
                <template v-for="line in gridLines" :key="`${line.orientation}-${line.position}-${line.label}`">
                  <line
                    v-if="line.orientation === 'y'"
                    :x1="line.position"
                    y1="0"
                    :x2="line.position"
                    y2="760"
                  />
                  <line
                    v-else
                    x1="0"
                    :y1="line.position"
                    x2="1200"
                    :y2="line.position"
                  />
                </template>
              </g>

              <g v-if="plotBounds.xMin <= 0 && plotBounds.xMax >= 0" class="axis-lines">
                <line :x1="toSvgX(0)" y1="0" :x2="toSvgX(0)" y2="760" />
              </g>
              <g v-if="plotBounds.yMin <= 0 && plotBounds.yMax >= 0" class="axis-lines">
                <line x1="0" :y1="toSvgY(0)" x2="1200" :y2="toSvgY(0)" />
              </g>

              <g class="slope-field">
                <line
                  v-for="segment in svgSegments"
                  :key="`${segment.x1}-${segment.y1}-${segment.x2}-${segment.y2}`"
                  :x1="segment.x1"
                  :y1="segment.y1"
                  :x2="segment.x2"
                  :y2="segment.y2"
                />
              </g>

              <g class="euler-path">
                <polyline :points="svgPolyline" />
                <polyline :points="svgPolyline" filter="url(#glow)" class="euler-path-glow" />
                <circle
                  v-for="(point, index) in pathPoints"
                  :key="`${point.x}-${point.y}-${index}`"
                  :cx="toSvgX(point.x)"
                  :cy="toSvgY(point.y)"
                  r="6"
                  :class="{ start: index === 0, end: index === pathPoints.length - 1 }"
                />
              </g>

              <g class="axis-labels">
                <text
                  v-for="line in gridLines.filter((item) => item.orientation === 'y')"
                  :key="`x-label-${line.position}`"
                  :x="line.position"
                  y="738"
                >
                  {{ line.label }}
                </text>
                <text
                  v-for="line in gridLines.filter((item) => item.orientation === 'x')"
                  :key="`y-label-${line.position}`"
                  x="18"
                  :y="line.position + 4"
                >
                  {{ line.label }}
                </text>
              </g>
            </svg>
          </div>
        </section>
      </section>

      <section class="card table-panel">
        <div class="panel-header">
          <div>
            <p class="section-label">Iteration table</p>
            <h2>Step-by-step Euler output</h2>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th v-html="renderMath('n')"></th>
                <th v-html="renderMath('x_n')"></th>
                <th v-html="renderMath('y_n')"></th>
                <th v-html="renderMath('f(x_n, y_n)')"></th>
                <th v-html="renderMath('\\Delta y')"></th>
                <th v-html="renderMath('x_{n+1}')"></th>
                <th v-html="renderMath('y_{n+1}')"></th>
              </tr>
            </thead>
            <tbody v-if="hasRenderableSteps">
              <tr v-for="step in stepData" :key="step.index" :class="{ latest: step.index === stepData.length - 1 }">
                <td>{{ step.index }}</td>
                <td>{{ formatNumber(step.x) }}</td>
                <td>{{ formatNumber(step.y) }}</td>
                <td>{{ formatNumber(step.slope) }}</td>
                <td>{{ formatNumber(step.deltaY) }}</td>
                <td>{{ formatNumber(step.nextX) }}</td>
                <td>{{ formatNumber(step.nextY) }}</td>
              </tr>
            </tbody>
            <tbody v-else>
              <tr>
                <td colspan="7" class="empty-state">
                  {{ evaluatorResult.error ? 'Fix the function above to generate a new approximation table.' : 'No Euler steps requested yet.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="finalStep" class="footer-summary metric-footer">
          <div>
            <span>Final x</span>
            <strong>{{ formatNumber(finalStep.nextX) }}</strong>
          </div>
          <div>
            <span>Final y</span>
            <strong>{{ formatNumber(finalStep.nextY) }}</strong>
          </div>
          <div>
            <span>Total change</span>
            <strong>{{ formatNumber(finalStep.nextY - y0) }}</strong>
          </div>
        </div>

        <p v-else class="microcopy footer-note">
          The table will populate once the function is valid and the step count is greater than zero.
        </p>
      </section>
    </main>
  </div>
</template>
