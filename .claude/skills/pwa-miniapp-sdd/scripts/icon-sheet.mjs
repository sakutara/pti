#!/usr/bin/env node
// Render every SVG in an icon folder into one HTML review sheet: 20/24/48 px, light and dark,
// inside a 44px button, plus a side-by-side row to compare optical size.
// Usage: node icon-sheet.mjs <icons-dir> > icon-sheet.html
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'src/icons'
const icons = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()
  .map((f) => ({ id: f.replace(/\.svg$/, ''), svg: readFileSync(join(dir, f), 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '') }))

const cell = (svg, px) => `<span class="i" style="width:${px}px;height:${px}px">${svg}</span>`
const row = ({ id, svg }) => `
<tr><th>${id}</th>
<td>${cell(svg, 20)}</td><td>${cell(svg, 24)}</td><td>${cell(svg, 48)}</td>
<td><button>${cell(svg, 24)}</button></td>
<td class="dark">${cell(svg, 24)} <button>${cell(svg, 24)}</button></td></tr>`

process.stdout.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Icon sheet</title><style>
body{font:14px system-ui;margin:16px;background:#fff;color:#0f172a}
table{border-collapse:collapse}th{text-align:left;padding-right:16px;font-weight:500}
td{padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
.i{display:inline-flex}.i svg{width:100%;height:100%}
button{all:unset;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border-radius:12px;background:#f1f5f9;color:#2563eb}
.dark{background:#0b1120;color:#e2e8f0}.dark button{background:#1e293b;color:#60a5fa}
.strip{display:flex;gap:16px;flex-wrap:wrap;padding:12px;background:#f8fafc;margin:16px 0}.strip .i{outline:1px dashed #cbd5e1}
</style></head><body>
<h1>Icon sheet (${icons.length})</h1>
<p>Side by side at 24px — similar visual weight? silhouettes distinct?</p>
<div class="strip">${icons.map((i) => cell(i.svg, 24)).join('')}</div>
<table><tr><th>id</th><th>20</th><th>24</th><th>48</th><th>button</th><th>dark</th></tr>${icons.map(row).join('')}</table>
</body></html>`)
