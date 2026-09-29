'use strict';
// Parser/serializer minimale per file Markdown con front matter YAML.
// Supporta solo il sottoinsieme che usiamo: chiave: valore scalare,
// liste inline [a, b] e liste a blocco ("  - voce").

const PLAIN_SAFE = /^[\p{L}\p{N}][\p{L}\p{N} _.,/()'+&-]*$/u;
const RESERVED = /^(true|false|null|~|yes|no|-?\d+(\.\d+)?)$/i;

function quoteIfNeeded(s) {
  s = String(s);
  if (s === '') return '""';
  if (PLAIN_SAFE.test(s) && !RESERVED.test(s) && s.trim() === s) return s;
  return JSON.stringify(s);
}

function scalarToYaml(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return quoteIfNeeded(v);
}

function stringify(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) { lines.push(`${k}: []`); continue; }
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${scalarToYaml(item)}`);
    } else {
      const s = scalarToYaml(v);
      lines.push(s === '' ? `${k}:` : `${k}: ${s}`);
    }
  }
  lines.push('---');
  const text = (body || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  return lines.join('\n') + '\n' + (text ? '\n' + text + '\n' : '');
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function splitInline(inner) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map(parseScalar).filter((v) => v !== null);
}

function parse(text) {
  text = String(text || '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const data = {};
  if (!text.startsWith('---\n')) return { data, body: text.trim() };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { data, body: text.trim() };
  const head = text.slice(4, end);
  const after = text.slice(end + 4);
  const body = after.replace(/^[^\n]*\n?/, '').replace(/^\n+/, '').replace(/\s+$/, '');
  let listKey = null;
  for (const line of head.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s?(.*)$/);
    if (item && listKey) { const v = parseScalar(item[1]); if (v !== null) data[listKey].push(v); continue; }
    const m = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    const r = rest.trim();
    if (r === '') { data[key] = []; listKey = key; continue; }
    listKey = null;
    if (r.startsWith('[') && r.endsWith(']')) data[key] = splitInline(r.slice(1, -1));
    else data[key] = parseScalar(r);
  }
  // Una chiave vuota senza voci è un valore nullo, non una lista.
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && v.length === 0 && !/:\s*\[\]\s*$/m.test(head.split('\n').find((l) => l.startsWith(k + ':')) || '')) data[k] = null;
  return { data, body };
}

module.exports = { parse, stringify };
