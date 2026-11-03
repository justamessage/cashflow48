#!/usr/bin/env node
// Baut den Ausgabeordner dist/ — Netlify liefert NUR diesen aus (netlify.toml: publish = "dist").
// Vorher war das Repo-Wurzelverzeichnis der Publish-Ordner und Repo-Interna (README.md, netlify/functions/stripe-webhook.js) waren
// öffentlich. Muster wie HIGHERPlan/systhetiq #28, HIGHERPlan/aeal #29, HIGHERPlan/systhetiq-advisor #17.
//
// Regel: Jeder Eintrag im Wurzelverzeichnis steht in OEFFENTLICH oder INTERN. Ein unbekannter
// Eintrag bricht den Build ab — neue Seiten werden bewusst freigegeben, nichts rutscht durch.
// Keine Dependencies, pures Node.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/** Öffentliche Seiten und Assets (Dateien oder ganze Ordner). */
export const OEFFENTLICH = ['index.html', 'danke.html', 'agb.html', 'datenschutz.html', 'impressum.html', 'favicon.ico', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png'];

/** Repo-Interna: werden nie ausgeliefert. Punktdateien/-ordner sind immer intern. */
export const INTERN = ['README.md', 'netlify.toml', 'netlify', 'scripts', 'node_modules', 'dist'];

/** Erlaubte Endungen in dist/ — zweite Sicherung gegen .md, .mjs, .toml, .py usw. */
const ENDUNGEN = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.txt', '.xml', '.ico', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif', '.pdf', '.woff2', '.woff', '.mp3', '.mp4', '.webm']);
/** Netlify-Steuerdateien ohne Endung, die im Ausgabeordner liegen müssen, damit sie wirken. */
const STEUERDATEIEN = new Set(['_redirects', '_headers']);

function fail(msg) {
  console.error(`build-public FEHLER: ${msg}`);
  process.exit(1);
}

const unbekannt = fs.readdirSync(ROOT).filter(n => !n.startsWith('.') && !OEFFENTLICH.includes(n) && !INTERN.includes(n));
if (unbekannt.length) fail(`unbekannte Einträge im Repo-Wurzelverzeichnis: ${unbekannt.join(', ')} — in scripts/build-public.mjs als OEFFENTLICH oder INTERN eintragen`);

const fehlt = OEFFENTLICH.filter(n => !fs.existsSync(path.join(ROOT, n)));
if (fehlt.length) fail(`öffentliche Einträge fehlen: ${fehlt.join(', ')}`);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);
for (const n of OEFFENTLICH) {
  fs.cpSync(path.join(ROOT, n), path.join(DIST, n), { recursive: true, filter: src => !path.basename(src).startsWith('.') });
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files); else files.push(p);
  }
  return files;
}
const dateien = walk(DIST);
const falsch = dateien.filter(f => !ENDUNGEN.has(path.extname(f).toLowerCase()) && !(STEUERDATEIEN.has(path.basename(f)) && path.dirname(f) === DIST));
if (falsch.length) fail(`nicht erlaubte Dateien in dist/: ${falsch.map(f => path.relative(DIST, f)).join(', ')}`);

console.log(`build-public: ${dateien.length} Dateien nach dist/ kopiert`);
