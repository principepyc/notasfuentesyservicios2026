#!/usr/bin/env node
/**
 * Generador cifrado del catálogo OPAC — Fuentes y Servicios de Información (ISFyCD FEB)
 *
 * Cifra cada registro estudiantil de forma individual usando Web Crypto API
 * (PBKDF2-SHA256 + AES-256-GCM) para que ningún DNI, nombre o nota quede
 * expuesto en texto plano en el repositorio público de GitHub Pages.
 *
 * Uso:
 *   node scripts/build-catalog.mjs --demo
 *   node scripts/build-catalog.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { webcrypto, randomInt } from 'node:crypto';

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const PRIVATE_DIR = path.join(ROOT_DIR, 'private-data');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const PBKDF2_ITERATIONS = 150_000;
const COMMISSIONS = [1, 2, 3, 4, 5, 6];

/**
 * Normaliza el DNI quitando espacios, puntos y guiones.
 */
function normalizeDni(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[\s.\-]/g, '')
    .toUpperCase();
}

/**
 * Normaliza la calificación numérica del 1 al 10.
 */
/**
 * Normaliza la calificación numérica del 1 al 10, o devuelve null si aún está pendiente.
 */
function parseNota(raw) {
  const str = String(raw ?? '').trim();
  if (!str || /^(pendiente|en\s*revisi[oó]n|sin\s*nota|-|—)$/i.test(str)) {
    return null;
  }
  const match = str.match(/^(\d+(?:[.,]\d+)?)(?:\s*\([^)]*\))?$/);
  const cleaned = (match ? match[1] : str).replace(',', '.');
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 1 || num > 10) {
    throw new Error(`Nota fuera de rango (1 a 10): "${raw}"`);
  }
  return Math.round(num * 100) / 100;
}

/**
 * Normaliza el número de comisión (1 a 6).
 */
function parseComision(raw) {
  const match = String(raw ?? '').match(/[1-6]/);
  if (!match) {
    throw new Error(`Comisión inválida (esperado 1 a 6): "${raw}"`);
  }
  return Number(match[0]);
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

/**
 * Mezcla un arreglo de forma criptográficamente uniforme (Fisher-Yates).
 */
function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Rellena el JSON UTF-8 con espacios finales a un tamaño fijo mínimo
 * para evitar filtrar la longitud del nombre por tamaño del texto cifrado.
 */
function padJsonBytes(payload) {
  const raw = encoder.encode(JSON.stringify(payload));
  const targetLen = Math.max(192, Math.ceil(raw.length / 64) * 64);
  if (raw.length === targetLen) return raw;
  const padded = new Uint8Array(targetLen);
  padded.fill(0x20); // ASCII space
  padded.set(raw, 0);
  return padded;
}

/**
 * Cifra un registro individual para una comisión dada.
 */
async function encryptStudentRecord(comision, saltBytes, student) {
  const dniNorm = normalizeDni(student.dni);
  if (dniNorm.length < 6) {
    throw new Error(
      `DNI inválido para ${student.apellido}, ${student.nombre}: "${student.dni}"`
    );
  }

  const secretMaterial = encoder.encode(`c${comision}:${dniNorm}`);
  const baseKey = await subtle.importKey(
    'raw',
    secretMaterial,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    512
  );

  const derivedBytes = new Uint8Array(derivedBits);
  const tokenSeed = derivedBytes.slice(0, 32);
  const aesKeyBytes = derivedBytes.slice(32, 64);

  const tokenHash = new Uint8Array(await subtle.digest('SHA-256', tokenSeed));
  const lookupToken = bytesToHex(tokenHash);

  const aesKey = await subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = padJsonBytes({
    n: student.nombre.trim(),
    a: student.apellido.trim(),
    g: parseNota(student.nota),
  });

  const aad = encoder.encode(`isfycd-fys-2026-c${comision}`);
  const ciphertext = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      aesKey,
      plaintext
    )
  );

  return {
    t: lookupToken,
    i: bytesToBase64(iv),
    d: bytesToBase64(ciphertext),
  };
}

/**
 * Parser CSV tolerante a BOM UTF-8, comas, puntos y coma o tabuladores, y comillas.
 */
function parseCsvText(rawText) {
  const text = rawText.replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  const lines = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  // Detecta el separador dominante en la primera línea fuera de comillas.
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((cell) => cell !== '')) {
    lines.push(currentRow);
  }

  if (lines.length < 2) return [];

  const normalizeHeader = (h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const headers = lines[0].map(normalizeHeader);
  return lines.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = cols[idx] ?? '';
    });
    return obj;
  });
}

function mapRawRow(row, defaultComision = null) {
  const findField = (candidates) => {
    for (const c of candidates) {
      if (row[c] !== undefined && String(row[c]).trim() !== '') {
        return String(row[c]).trim();
      }
    }
    return '';
  };

  const nombre = findField(['nombre', 'nombres', 'name', 'firstname']);
  const apellido = findField(['apellido', 'apellidos', 'surname', 'lastname']);
  const dni = findField(['dni', 'documento', 'nrodocumento', 'numdocumento', 'id']);
  const nota = findField(['nota', 'notafinal', 'calificacion', 'calificacionfinal', 'grade']);
  const comisionRaw = findField(['comision', 'com', 'sala', 'commission']);

  const comision = comisionRaw ? parseComision(comisionRaw) : defaultComision;
  if (!comision) {
    throw new Error(`Falta indicar la comisión en fila: ${JSON.stringify(row)}`);
  }
  if (!nombre || !apellido || !dni) {
    throw new Error(
      `Fila incompleta en comisión ${comision}: ${JSON.stringify(row)}`
    );
  }

  return { comision, nombre, apellido, dni, nota: parseNota(nota) };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Carga registros reales desde `private-data/`.
 * Soporta `comision-1.csv`..`6.csv` (o `.json`) y/o `estudiantes.csv`/`notas.csv`/`.json`.
 */
async function loadRealRecords() {
  const byComision = new Map(COMMISSIONS.map((c) => [c, []]));

  if (!(await fileExists(PRIVATE_DIR))) {
    throw new Error(
      `No existe la carpeta private-data/. Creala o ejecutá con --demo para generar datos de prueba.`
    );
  }

  let loadedAnyFile = false;

  for (const c of COMMISSIONS) {
    const csvPath = path.join(PRIVATE_DIR, `comision-${c}.csv`);
    const jsonPath = path.join(PRIVATE_DIR, `comision-${c}.json`);

    if (await fileExists(csvPath)) {
      loadedAnyFile = true;
      const rows = parseCsvText(await fs.readFile(csvPath, 'utf8'));
      for (const row of rows) {
        const mapped = mapRawRow(row, c);
        byComision.get(mapped.comision).push(mapped);
      }
    } else if (await fileExists(jsonPath)) {
      loadedAnyFile = true;
      const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed.estudiantes ?? [];
      for (const row of list) {
        const mapped = mapRawRow(row, c);
        byComision.get(mapped.comision).push(mapped);
      }
    }
  }

  const combinedCandidates = [
    'estudiantes.csv',
    'notas.csv',
    'estudiantes.json',
    'notas.json',
  ];

  for (const fileName of combinedCandidates) {
    const fullPath = path.join(PRIVATE_DIR, fileName);
    if (!(await fileExists(fullPath))) continue;
    loadedAnyFile = true;

    if (fileName.endsWith('.csv')) {
      const rows = parseCsvText(await fs.readFile(fullPath, 'utf8'));
      for (const row of rows) {
        const mapped = mapRawRow(row);
        byComision.get(mapped.comision).push(mapped);
      }
    } else {
      const parsed = JSON.parse(await fs.readFile(fullPath, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed.estudiantes ?? [];
      for (const row of list) {
        const mapped = mapRawRow(row);
        byComision.get(mapped.comision).push(mapped);
      }
    }
  }

  if (!loadedAnyFile) {
    throw new Error(
      `No se encontraron archivos en private-data/ (esperaba comision-1.csv..6.csv o estudiantes.csv).`
    );
  }

  return byComision;
}

/**
 * Genera datos ficticios de prueba (solo para --demo).
 */
function generateDemoRecords() {
  const samples = {
    1: [
      { nombre: 'Lucía Belén', apellido: 'Fernández', dni: '11111111', nota: 9 },
      { nombre: 'Mateo Ignacio', apellido: 'Sánchez', dni: '11111112', nota: 7 },
      { nombre: 'Sofía Valentina', apellido: 'Peralta', dni: '11111113', nota: 10 },
    ],
    2: [
      { nombre: 'Julián Andrés', apellido: 'Gómez', dni: '22222221', nota: 8 },
      { nombre: 'Camila Rocío', apellido: 'Vega', dni: '22222222', nota: 6 },
      { nombre: 'Tomás Ezequiel', apellido: 'Navarro', dni: '22222223', nota: 9 },
    ],
    3: [
      { nombre: 'Valentina Paz', apellido: 'Quiroga', dni: '33333331', nota: 10 },
      { nombre: 'Martín Nicolás', apellido: 'Herrera', dni: '33333332', nota: 8 },
      { nombre: 'Agustina Sol', apellido: 'Acosta', dni: '33333333', nota: 7 },
    ],
    4: [
      { nombre: 'Santiago Gabriel', apellido: 'Molina', dni: '44444441', nota: 8 },
      { nombre: 'Florencia Mailén', apellido: 'Ríos', dni: '44444442', nota: 9 },
      { nombre: 'Franco Nahuel', apellido: 'Benítez', dni: '44444443', nota: 5 },
    ],
    5: [
      { nombre: 'Abril Micaela', apellido: 'Castro', dni: '55555551', nota: 9 },
      { nombre: 'Lautaro Iván', apellido: 'Romero', dni: '55555552', nota: 7 },
      { nombre: 'Paula Guadalupe', apellido: 'Silva', dni: '55555553', nota: 10 },
    ],
    6: [
      { nombre: 'Joaquín Emanuel', apellido: 'Medina', dni: '66666661', nota: 8 },
      { nombre: 'Milagros Celeste', apellido: 'Cabrera', dni: '66666662', nota: 10 },
      { nombre: 'Bruno Sebastián', apellido: 'Paz', dni: '66666663', nota: 6 },
    ],
  };

  return new Map(COMMISSIONS.map((c) => [c, samples[c]]));
}

async function buildCommissionBundle(comision, students, isDemo) {
  const seenDnis = new Set();
  for (const s of students) {
    const dniNorm = normalizeDni(s.dni);
    if (seenDnis.has(dniNorm)) {
      throw new Error(
        `DNI duplicado en Comisión ${comision}: "${dniNorm}" (${s.apellido}, ${s.nombre})`
      );
    }
    seenDnis.add(dniNorm);
  }

  const saltBytes = webcrypto.getRandomValues(new Uint8Array(16));
  const encryptedRecords = [];

  for (const s of students) {
    encryptedRecords.push(await encryptStudentRecord(comision, saltBytes, s));
  }

  const bundle = {
    version: 1,
    comision,
    isDemo,
    salt: bytesToBase64(saltBytes),
    iterations: PBKDF2_ITERATIONS,
    updatedAt: new Date().toISOString().slice(0, 10),
    count: encryptedRecords.length,
    records: shuffleArray(encryptedRecords),
  };

  if (isDemo) {
    bundle.demoHints = students.map((s) => ({
      dni: normalizeDni(s.dni),
      label: `${s.apellido}, ${s.nombre}`,
    }));
  }

  const outputJs = [
    '// Archivo generado automáticamente por scripts/build-catalog.mjs',
    '// Registros cifrados individualmente con PBKDF2-SHA256 + AES-256-GCM.',
    'window.OPAC_CATALOGO = window.OPAC_CATALOGO || {};',
    `window.OPAC_CATALOGO[${JSON.stringify(String(comision))}] = ${JSON.stringify(bundle)};`,
    '',
  ].join('\n');

  await fs.writeFile(path.join(DATA_DIR, `comision-${comision}.js`), outputJs, 'utf8');
  return bundle.count;
}

async function updateCacheBusterInHtml() {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (!(await fileExists(indexPath))) return;
  const version = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  const html = await fs.readFile(indexPath, 'utf8');
  const updated = html.replace(
    /(src="data\/comision-[1-6]\.js)(?:\?v=[^"]*)?(")/g,
    `$1?v=${version}$2`
  );
  if (updated !== html) {
    await fs.writeFile(indexPath, updated, 'utf8');
  }
}

async function main() {
  const isDemo = process.argv.includes('--demo');
  await fs.mkdir(DATA_DIR, { recursive: true });

  const byComision = isDemo ? generateDemoRecords() : await loadRealRecords();

  let total = 0;
  for (const comision of COMMISSIONS) {
    const list = byComision.get(comision) || [];
    const count = await buildCommissionBundle(comision, list, isDemo);
    total += count;
    console.log(
      `[Comisión ${comision}] ${count} registro(s) cifrado(s) -> data/comision-${comision}.js`
    );
  }

  await updateCacheBusterInHtml();

  console.log(
    `\nListo (${isDemo ? 'MODO DEMO' : 'DATOS REALES'}). Total: ${total} estudiante(s) procesado(s).`
  );
}

main().catch((err) => {
  console.error('\nError al construir el catálogo:', err.message);
  process.exit(1);
});

