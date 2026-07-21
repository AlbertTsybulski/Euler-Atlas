import { all, create, type MathNode } from 'mathjs'

export interface EulerStep {
  index: number
  x: number
  y: number
  slope: number
  deltaY: number
  nextX: number
  nextY: number
}

export interface FieldSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Bounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const math = create(all, {})

const ALLOWED_FUNCTIONS = new Set([
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'cos',
  'cosh',
  'exp',
  'log',
  'log10',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
])

const ALLOWED_SYMBOLS = new Set(['x', 'y', 'e', 'pi'])

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return 'NaN'
  }

  return Number(value.toFixed(digits)).toString()
}

function readBalancedGroup(source: string, startIndex: number): { content: string; nextIndex: number } {
  if (source[startIndex] !== '{') {
    throw new Error('Expected a grouped expression.')
  }

  let depth = 1
  let index = startIndex + 1
  let content = ''

  while (index < source.length) {
    const character = source[index]
    if (character === '{') {
      depth += 1
      content += character
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return { content, nextIndex: index + 1 }
      }
      content += character
    } else {
      content += character
    }
    index += 1
  }

  throw new Error('Unbalanced braces in the equation.')
}

function transformLatexLikeInput(source: string): string {
  const trimmed = source
    .trim()
    .replaceAll('$', '')
    .replaceAll('\u00a0', ' ')
    .replace(/\s+/g, ' ')

  let result = ''
  let index = 0

  while (index < trimmed.length) {
    const character = trimmed[index]

    if (character === '\\') {
      const commandMatch = trimmed.slice(index + 1).match(/^[a-zA-Z]+/)
      if (!commandMatch) {
        index += 1
        continue
      }

      const command = commandMatch[0]
      index += command.length + 1

      if (command === 'left' || command === 'right') {
        continue
      }

      if (command === 'cdot' || command === 'times') {
        result += '*'
        continue
      }

      if (command === 'pi') {
        result += 'pi'
        continue
      }

      if (command === 'e') {
        result += 'e'
        continue
      }

      if (command === 'ln') {
        result += 'log'
        continue
      }

      if (command === 'log') {
        let tempIndex = index
        while (tempIndex < trimmed.length && trimmed[tempIndex] === ' ') tempIndex++
        if (trimmed[tempIndex] === '_') {
          tempIndex++
          while (tempIndex < trimmed.length && trimmed[tempIndex] === ' ') tempIndex++
          if (trimmed[tempIndex] === '{') {
            index = tempIndex
            const baseGroup = readBalancedGroup(trimmed, index)
            index = baseGroup.nextIndex
            result += `log_BASE_${transformLatexLikeInput(baseGroup.content)}_ENDBASE_`
          } else {
            const baseChar = trimmed[tempIndex]
            index = tempIndex + 1
            result += `log_BASE_${baseChar}_ENDBASE_`
          }
        } else {
          result += 'log'
        }
        continue
      }

      if (ALLOWED_FUNCTIONS.has(command)) {
        result += command
        continue
      }

      if (command === 'frac') {
        while (trimmed[index] === ' ') {
          index += 1
        }
        const numerator = readBalancedGroup(trimmed, index)
        index = numerator.nextIndex
        while (trimmed[index] === ' ') {
          index += 1
        }
        const denominator = readBalancedGroup(trimmed, index)
        index = denominator.nextIndex
        result += `(${transformLatexLikeInput(numerator.content)})/(${transformLatexLikeInput(denominator.content)})`
        continue
      }

      if (command === 'sqrt') {
        while (trimmed[index] === ' ') {
          index += 1
        }
        const radicand = readBalancedGroup(trimmed, index)
        index = radicand.nextIndex
        result += `sqrt(${transformLatexLikeInput(radicand.content)})`
        continue
      }

      throw new Error(`Unsupported symbol: \\${command}`)
    }

    if (character === '{') {
      result += '('
      index += 1
      continue
    }

    if (character === '}') {
      result += ')'
      index += 1
      continue
    }

    result += character
    index += 1
  }

  return result.replace(/\s+/g, ' ').trim()
}

function resolveLogBases(source: string): string {
  const marker = /log_BASE_(.*?)_ENDBASE_/g
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = marker.exec(source)) !== null) {
    const base = match[1]
    const afterMarker = match.index + match[0].length
    result += source.slice(lastIndex, match.index)

    let argStr = ''
    let nextIndex = afterMarker
    while (nextIndex < source.length && source[nextIndex] === ' ') nextIndex++

    if (source[nextIndex] === '(') {
      let depth = 1
      let i = nextIndex + 1
      while (i < source.length && depth > 0) {
        if (source[i] === '(') depth++
        else if (source[i] === ')') depth--
        i++
      }
      argStr = source.slice(nextIndex + 1, i - 1)
      nextIndex = i
    } else {
      const tokenMatch = source.slice(nextIndex).match(/^[A-Za-z0-9_.]+/)
      if (tokenMatch) {
        argStr = tokenMatch[0]
        nextIndex += tokenMatch[0].length
      }
    }

    result += `log(${argStr},${base})`
    lastIndex = nextIndex
    marker.lastIndex = nextIndex
  }

  result += source.slice(lastIndex)
  return result
}

function insertImplicitMultiplication(source: string): string {
  source = resolveLogBases(source)

  source = source.replace(/log_\{([^}]+)\}/g, 'log_BASE_$1_ENDBASE_')
  source = source.replace(/log_([A-Za-z0-9]+)/g, 'log_BASE_$1_ENDBASE_')

  source = resolveLogBases(source)

  type Token =
    | { kind: 'number'; text: string }
    | { kind: 'identifier'; text: string }
    | { kind: 'operator'; text: string }
    | { kind: 'openParen'; text: '(' }
    | { kind: 'closeParen'; text: ')' }
    | { kind: 'comma'; text: ',' }

  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (/[0-9.]/.test(character)) {
      let end = index + 1
      while (end < source.length && /[0-9.eE]/.test(source[end])) {
        const next = source[end]
        const previous = source[end - 1]
        if ((next === '+' || next === '-') && (previous === 'e' || previous === 'E')) {
          end += 1
          continue
        }
        end += 1
      }
      tokens.push({ kind: 'number', text: source.slice(index, end) })
      index = end
      continue
    }

    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) {
        end += 1
      }
      const word = source.slice(index, end)
      index = end

      if (ALLOWED_SYMBOLS.has(word) || ALLOWED_FUNCTIONS.has(word)) {
        tokens.push({ kind: 'identifier', text: word })
        continue
      }

      let wordIndex = 0
      let splitOk = true
      const splitTokens: Token[] = []
      while (wordIndex < word.length) {
        let matched = false
        for (let len = word.length - wordIndex; len >= 1; len--) {
          const candidate = word.slice(wordIndex, wordIndex + len)
          if (ALLOWED_SYMBOLS.has(candidate) || ALLOWED_FUNCTIONS.has(candidate)) {
            splitTokens.push({ kind: 'identifier', text: candidate })
            wordIndex += len
            matched = true
            break
          }
        }
        if (!matched) {
          splitOk = false
          break
        }
      }

      if (splitOk && splitTokens.length > 0) {
        for (const t of splitTokens) {
          tokens.push(t)
        }
      } else {
        tokens.push({ kind: 'identifier', text: word })
      }
      continue
    }

    if (character === '(') {
      tokens.push({ kind: 'openParen', text: '(' })
      index += 1
      continue
    }

    if (character === ')') {
      tokens.push({ kind: 'closeParen', text: ')' })
      index += 1
      continue
    }

    if (character === ',') {
      tokens.push({ kind: 'comma', text: ',' })
      index += 1
      continue
    }

    tokens.push({ kind: 'operator', text: character })
    index += 1
  }

  const pieces: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    const previousToken = pieces.length > 0 ? tokens[i - 1] : undefined

    const previousIsValue = (() => {
      for (let k = i - 1; k >= 0; k--) {
        const t = tokens[k]
        if (t.kind === 'number' || t.kind === 'closeParen') return true
        if (t.kind === 'identifier') return true
        if (t.kind === 'operator') return false
        if (t.kind === 'openParen' || t.kind === 'comma') return false
      }
      return false
    })()
    void previousToken

    const isFunctionIdent = token.kind === 'identifier' && ALLOWED_FUNCTIONS.has(token.text)
    const nextToken = tokens[i + 1]
    const nextIsOpenParen = nextToken?.kind === 'openParen'

    if (isFunctionIdent && !nextIsOpenParen && nextToken !== undefined) {
      const nextIsValue =
        nextToken.kind === 'number' ||
        (nextToken.kind === 'identifier')

      if (nextIsValue) {
        if (previousIsValue) pieces.push('*')
        pieces.push(token.text)
        pieces.push('(')
        pieces.push(nextToken.text)
        pieces.push(')')
        i += 2
        continue
      }
    }

    const currentStartsValue = token.kind === 'number' || token.kind === 'identifier' || token.kind === 'openParen'
    const previousIsFunctionName = (() => {
      for (let k = i - 1; k >= 0; k--) {
        const t = tokens[k]
        if (t.kind === 'identifier') return ALLOWED_FUNCTIONS.has(t.text)
        break
      }
      return false
    })()

    if (previousIsValue && currentStartsValue && !(token.kind === 'openParen' && previousIsFunctionName)) {
      pieces.push('*')
    }

    pieces.push(token.text)
    i++
  }

  return pieces.join('')
}

function validateNode(node: MathNode): void {
  switch (node.type) {
    case 'ParenthesisNode':
    case 'OperatorNode':
    case 'ConstantNode':
      break
    case 'SymbolNode':
      {
        const symbolNode = node as MathNode & { name: string }
        if (!ALLOWED_SYMBOLS.has(symbolNode.name)) {
          throw new Error(`Unsupported symbol: ${symbolNode.name}`)
        }
      }
      break
    case 'FunctionNode':
      {
        const functionNode = node as MathNode & { name: string }
        if (!ALLOWED_FUNCTIONS.has(functionNode.name)) {
          throw new Error(`Unsupported function: ${functionNode.name}`)
        }
        const args = (functionNode as MathNode & { args?: MathNode[] }).args ?? []
        args.forEach((child) => validateNode(child))
        return
      }
      break
    default:
      throw new Error(`Unsupported expression element: ${node.type}`)
  }

  node.forEach((child: MathNode) => {
    validateNode(child)
  })
}

export function createEvaluator(expression: string): (x: number, y: number) => number {
  const normalized = insertImplicitMultiplication(transformLatexLikeInput(expression))

  if (!normalized) {
    throw new Error('Enter a function such as x + y or sin(x) - y.')
  }

  const parsed = math.parse(normalized)
  validateNode(parsed)
  const compiled = parsed.compile()

  return (x: number, y: number) => {
    try {
      const result = compiled.evaluate({ x, y, pi: Math.PI, e: Math.E })
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new Error('The expression produced a non-finite value at some point over the interval provided.')
      }

      return result
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error('Could not evaluate the function.')
    }
  }
}

export function toLatex(expression: string): string {
  const normalized = insertImplicitMultiplication(transformLatexLikeInput(expression))

  if (!normalized) {
    return ''
  }

  const parsed = math.parse(normalized)
  validateNode(parsed)
  return parsed.toTex({ parenthesis: 'keep' })
}

export type EstimationMethod = 'euler' | 'improved_euler' | 'midpoint' | 'rk4'

export function computeSteps(
  method: EstimationMethod,
  evaluator: (x: number, y: number) => number,
  x0: number,
  y0: number,
  stepSize: number,
  steps: number,
): EulerStep[] {
  if (stepSize <= 0) {
    throw new Error('Step size must be greater than zero.')
  }

  if (steps < 0) {
    throw new Error('Step count cannot be negative.')
  }

  const result: EulerStep[] = []
  let x = x0
  let y = y0

  for (let index = 0; index < steps; index += 1) {
    let slope = 0
    if (method === 'euler') {
      slope = evaluator(x, y)
    } else if (method === 'improved_euler') {
      const k1 = evaluator(x, y)
      const yPred = y + stepSize * k1
      const k2 = evaluator(x + stepSize, yPred)
      slope = (k1 + k2) / 2
    } else if (method === 'midpoint') {
      const k1 = evaluator(x, y)
      const yMid = y + (stepSize / 2) * k1
      const k2 = evaluator(x + stepSize / 2, yMid)
      slope = k2
    } else if (method === 'rk4') {
      const k1 = evaluator(x, y)
      const k2 = evaluator(x + stepSize / 2, y + (stepSize / 2) * k1)
      const k3 = evaluator(x + stepSize / 2, y + (stepSize / 2) * k2)
      const k4 = evaluator(x + stepSize, y + stepSize * k3)
      slope = (k1 + 2 * k2 + 2 * k3 + k4) / 6
    }

    const deltaY = stepSize * slope
    const nextX = x + stepSize
    const nextY = y + deltaY

    result.push({
      index,
      x,
      y,
      slope,
      deltaY,
      nextX,
      nextY,
    })

    x = nextX
    y = nextY
  }

  return result
}

export function computeEulerSteps(
  evaluator: (x: number, y: number) => number,
  x0: number,
  y0: number,
  stepSize: number,
  steps: number,
): EulerStep[] {
  return computeSteps('euler', evaluator, x0, y0, stepSize, steps)
}

export function deriveBounds(points: Array<{ x: number; y: number }>, padding = 0.18): Bounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xSpan = Math.max(1, xMax - xMin)
  const ySpan = Math.max(1, yMax - yMin)

  return {
    xMin: xMin - xSpan * padding,
    xMax: xMax + xSpan * padding,
    yMin: yMin - ySpan * padding,
    yMax: yMax + ySpan * padding,
  }
}

export function buildSlopeField(
  evaluator: (x: number, y: number) => number,
  bounds: Bounds,
  svgWidth: number,
  svgHeight: number,
  columns = 18,
  rows = 12,
  segmentLength = 18,
): FieldSegment[] {
  const segments: FieldSegment[] = []
  const xStep = (bounds.xMax - bounds.xMin) / Math.max(columns - 1, 1)
  const yStep = (bounds.yMax - bounds.yMin) / Math.max(rows - 1, 1)
  const scaleX = svgWidth / Math.max(bounds.xMax - bounds.xMin, Number.EPSILON)
  const scaleY = svgHeight / Math.max(bounds.yMax - bounds.yMin, Number.EPSILON)

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x = bounds.xMin + column * xStep
      const y = bounds.yMin + row * yStep
      const slope = evaluator(x, y)
      const screenSlope = slope * (scaleY / scaleX)
      const dx = 1 / Math.sqrt(1 + screenSlope * screenSlope)
      const dy = screenSlope * dx
      const centerX = (x - bounds.xMin) * scaleX
      const centerY = svgHeight - (y - bounds.yMin) * scaleY
      const halfLength = segmentLength / 2

      segments.push({
        x1: centerX - dx * halfLength,
        y1: centerY - dy * halfLength,
        x2: centerX + dx * halfLength,
        y2: centerY + dy * halfLength,
      })
    }
  }

  return segments
}

export function toPolylinePoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}
