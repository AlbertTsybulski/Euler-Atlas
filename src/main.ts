import { createApp } from 'vue'
import { Analytics } from "@vercel/analytics/vue"
import { SpeedInsights } from "@vercel/speed-insights/vue"
import 'mathlive'
import 'katex/dist/katex.min.css'
import App from './App.vue'
import './styles.css'

const mathVirtualKeyboard = (globalThis as typeof globalThis & {
	mathVirtualKeyboard?: {
		layouts: unknown
	}
}).mathVirtualKeyboard

if (mathVirtualKeyboard) {
	mathVirtualKeyboard.layouts = [
		{
			label: 'ODE',
			tooltip: 'First-order ODE input',
			displayEditToolbar: false,
			rows: [
				['x', 'y', 'e', '\\pi', '[separator]', '+', '-', '\\times', '/', '=', '[separator]', '(', ')'],
				['\\frac{#@}{#0}', '\\sqrt{#0}', '#@^{#?}', '[separator]', '\\sin', '\\cos', '\\tan', '\\exp'],
				['\\log', '\\ln', '\\abs{#0}', '[separator]', '[left]', '[right]', '[backspace]', '[hide-keyboard]'],
				['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
			],
		},
	]
}

createApp(App).mount('#app')
