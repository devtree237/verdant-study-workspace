import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [sourceDir, ocrDir = '.local/practice-ocr', outputDir = 'public/practice-library', ...requested] = process.argv.slice(2);
if (!sourceDir) throw new Error('Usage: node scripts/extract-practice-library.mjs <PDF directory> [OCR directory] [output directory] [subject ...]');

// These ranges were read from the scanned chapter headers. Page numbers refer
// to the supplied PDF, which is sometimes different from the printed footer.
const physics = [
  ['General Physics', 1, 6, 11], ['Kinematics', 7, 10, 11], ['Laws of Motion', 17, 21, 11],
  ['Work, Power and Energy', 22, 25, 11], ['System of Particles and Rotational Motion', 26, 41, 11],
  ['Gravitation', 42, 45, 11], ['Properties of Matter', 46, 55, 11], ['Heat and Thermodynamics', 56, 71, 11],
  ['Oscillations', 72, 77, 11], ['Wave Motion', 78, 86, 11], ['Electric Charges and Field', 87, 92, 12],
  ['Electrostatic Potential and Capacitance', 93, 101, 12], ['Current Electricity', 102, 110, 12],
  ['Magnetics', 111, 120, 12], ['Electromagnetic Induction, Alternating Current and Electromagnetic Waves', 131, 141, 12],
  ['Optics', 142, 161, 12],
];
const chemistry = [
  ['Some Basic Concepts of Chemistry', 8, 10, 11], ['Atomic Structure', 11, 15, 11],
  ['Periodic Classification and Periodic Properties', 16, 16, 11], ['Chemical Bonding', 17, 22, 11],
  ['States of Matter', 23, 24, 11], ['Thermodynamics and Thermochemistry', 25, 28, 11],
  ['Chemical and Ionic Equilibrium', 29, 34, 11], ['s-Block Elements', 35, 35, 11],
  ['p-Block Elements I', 36, 38, 11], ['Organic Chemistry: Some Basic Principles and Techniques', 39, 43, 11],
  ['Hydrocarbons', 44, 48, 11], ['Benzene and Alkyl Benzene', 49, 51, 11],
  ['The Solid State', 52, 53, 12], ['Solutions and Colligative Properties', 54, 55, 12],
  ['Redox Reactions and Electrochemistry', 56, 59, 12], ['Chemical Kinetics', 60, 62, 12],
  ['Nuclear Chemistry', 63, 63, 12], ['Surface Chemistry', 64, 64, 12],
  ['Extraction of Metals', 65, 67, 12], ['p-Block Elements II', 68, 71, 12],
  ['Transition and Inner-Transition Elements', 72, 73, 12], ['Coordination Compounds', 74, 76, 12],
  ['Alkyl Halides', 77, 80, 12], ['Aryl Halides and Phenols', 81, 83, 12],
  ['Alcohols and Ethers', 84, 85, 12], ['Aldehydes and Ketones', 86, 88, 12],
  ['Carboxylic Acids and Their Derivatives', 89, 91, 12], ['Aliphatic Compounds Containing Nitrogen', 92, 92, 12],
  ['Aromatic Compounds Containing Nitrogen', 93, 95, 12], ['Biomolecules', 96, 97, 12],
  ['Polymers and Chemistry in Everyday Life', 98, 99, 12], ['Qualitative Analysis of Inorganic Salts', 100, 103, 12],
];

// Directly checked against the printed key on each chapter's final page.
const verifiedChoices = {
  'physics-1': {1: 'a', 2: 'c', 3: 'a', 6: 'bd', 7: 'acd', 11: 'd', 12: 'a', 14: 'c', 15: 'b', 16: 'bd', 17: 'acd', 18: 'ac', 19: 'bc', 20: 'abc', 21: 'ad', 22: 'abc', 27: 'a', 28: 'c', 29: 'd', 30: 'c', 31: 'b', 36: 'a', 37: 'a', 38: 'a', 39: 'c', 40: 'ac', 41: 'b', 42: 'd', 44: 'b', 45: 'c', 47: 'c', 48: 'b', 49: 'b', 50: 'b', 51: 'd', 52: 'd', 53: 'bc'},
  'chemistry-8': {1: 'a', 2: 'd', 3: 'd', 4: 'b', 5: 'a', 6: 'd', 7: 'a', 32: 'a', 33: 'a', 34: 'a', 35: 'c', 36: 'bc'},
  'chemistry-16': {1: 'abcd', 2: 'b', 3: 'b', 4: 'b', 5: 'd', 6: 'd', 7: 'b', 8: 'd', 9: 'a', 10: 'c', 11: 'a', 12: 'a', 13: 'b', 14: 'c', 15: 'c', 16: 'd', 17: 'b', 18: 'cd', 19: 'abc', 20: 'ab', 21: 'b', 22: 'b', 23: 'c', 24: 'c'},
  'chemistry-64': {1: 'b', 2: 'c', 3: 'a', 4: 'ad', 5: 'ac', 6: 'ad', 7: 'abd', 8: 'a', 9: 'c', 10: 'a', 11: 'd', 12: 'bc', 13: 'ac', 14: 'b', 15: 'b', 16: 'bcd'},
};

// The printed markers on these questions were obscured by the scan or
// omitted by the OCR engine. Bounds were checked against the original pages.
const checkedRegions = {
  'physics-1': [
    [1, 'single', [[1,.060,.381,.481,.504]], 'a', 2017],
    [2, 'single', [[1,.062,.507,.483,.710]], 'c', 2017],
    [8, 'self', [[1,.509,.558,.939,.907]], 'A → p, q; B → r, s; C → r, s; D → r, s', 2007],
  ],
  'physics-17': [
    [1, 'single', [[17,.025,.405,.466,.506]], undefined, 2023],
    [2, 'single', [[17,.028,.509,.469,.720]], undefined, 2012],
  ],
  'physics-46': [
    [1, 'single', [[46,.068,.382,.516,.465]], undefined, 2013],
  ],
  'chemistry-8': [
    [47, 'self', [[10,.512,.077,.977,.178]], undefined, 1995],
    [48, 'self', [[10,.512,.182,.976,.252]], undefined, 1994],
    [49, 'self', [[10,.512,.260,.977,.367]], undefined, 1991],
    [50, 'self', [[10,.512,.373,.977,.428]], undefined, 1990],
    [51, 'self', [[10,.512,.436,.977,.504]], undefined, 1980],
    [52, 'self', [[10,.512,.507,.977,.603]], undefined, 1979],
    [53, 'self', [[10,.512,.609,.977,.670]], undefined, 1979],
  ],
  'chemistry-98': [
    [1, 'single', [[98,.042,.539,.342,.696]], 'a', 2016],
    [2, 'single', [[98,.042,.699,.342,.867]], 'd', 2009],
    [5, 'single', [[98,.362,.425,.692,.681]], 'd', 2011],
    [6, 'self', [[98,.362,.710,.683,.954]], 'A → p, s; B → q, r; C → p, r; D → s', 2007],
    [10, 'single', [[99,.048,.133,.535,.177],[99,.575,.025,.990,.180]], 'b'],
  ],
};

const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const wordRight = word => word.x + word.w;
const wordBottom = word => word.y + word.h;
const bounds = words => ({
  x: Math.min(...words.map(word => word.x)),
  y: Math.min(...words.map(word => word.y)),
  right: Math.max(...words.map(wordRight)),
  bottom: Math.max(...words.map(wordBottom)),
});
const clean = text => text.replace(/\s+/g, ' ').trim();
const questionNumber = text => {
  const match = /^([1-9IlO]\d{0,2}|[1-9Il][IlO]\d?|[1-9]\d[IlO])[.)](?:$|[^\d./%])/.exec(text);
  return match ? Number(match[1].replace(/[Il]/g, '1').replace(/O/g, '0')) : undefined;
};
const solutionHeading = /\b(?:answer\s*key|answ[er]+\s*k[ef]y)\b/i;
const sectionType = text => {
  if (/^single\s+correct$/i.test(text)) return 'single';
  if (/^multiple\s+correct$/i.test(text)) return 'multiple';
  if (/^(?:numerical|integer)/i.test(text)) return 'numeric';
  if (/^(?:subjective|true\s*[/:]\s*false|fill\s+in\s+the\s+blanks|match\s+the\s+column|assertion|comprehension\s+based)/i.test(text)) return 'self';
  return null;
};

function normalize(page, rotation) {
  const { width, height } = page;
  const lines = page.lines.filter(line => line.words.length).map(line => {
    const words = line.words.map(word => ({ s: word.s, x: word.x / width, y: word.y / height, w: word.w / width, h: word.h / height }));
    return { s: line.s, words, ...bounds(words) };
  });
  return { number: Number(page.name.match(/\d+$/)?.[0]), lines, rotation };
}

function readingScore(page) {
  return page.lines.reduce((score, line) => {
    if (/telegram|scanned with/i.test(line.s)) return score;
    const typical = line.s.match(/\b(?:the|and|for|with|which|then|following|value|correct|answer|molar|number|when|is|was|are|in|of)\b/gi)?.length ?? 0;
    return score + 5 * typical + line.words.filter(word => /^[a-z]{3,}$/i.test(word.s)).length;
  }, 0);
}

async function readPages(id) {
  const pages = new Map();
  for (const rotation of [0, 90, 180, 270]) {
    const filename = path.join(ocrDir, `${id}${rotation ? `-${rotation}` : ''}.json`);
    if (!existsSync(filename)) continue;
    for (const raw of await readJson(filename)) {
      const page = normalize(raw, rotation);
      const saved = pages.get(page.number);
      if (!saved || readingScore(page) > readingScore(saved) * 1.12) pages.set(page.number, page);
    }
  }
  const enhanced = path.join(ocrDir, `${id}-contrast.json`);
  if (existsSync(enhanced)) {
    for (const raw of await readJson(enhanced)) {
      const extra = normalize(raw, 0);
      const original = pages.get(extra.number);
      if (!original || original.rotation) continue;
      const markers = extra.lines.flatMap(line => line.words.slice(0, 2)).filter(word => questionNumber(word.s));
      for (const word of markers) {
        const near = original.lines.find(line => Math.abs(line.y - word.y) < .005 && line.x >= word.x - .006 && line.x < word.x + .042 && line.words.length >= 2);
        if (near && questionNumber(near.words[0].s)) continue;
        original.lines.push({ s: word.s, words: [word], ...bounds([word]) });
      }
    }
  }
  return pages;
}

function region(page, x, y, right, bottom) {
  const round = value => Math.round(value * 100000) / 100000;
  x = Math.max(0, x);
  y = Math.max(0, y);
  right = Math.min(1, right);
  bottom = Math.min(1, bottom);
  return { page: page.number, x: round(x), y: round(y), width: round(right - x), height: round(bottom - y), ...(page.rotation && { rotation: page.rotation }) };
}

function pageColumns(page, { firstPage, answerKey, id }) {
  const chapterHeading = firstPage ? page.lines.find(line => /^JEE[-‐– ]?Advanced\s*$/i.test(line.s)) : undefined;
  const start = chapterHeading && id === 'physics' ? chapterHeading.bottom + .005 : .017;
  const end = id === 'physics' && answerKey ? Math.min(.97, answerKey.y - .01) : .981;
  if (end <= start) return [];
  const inRange = page.lines.filter(line => line.y >= start && line.y < end && !/telegram|scanned with|partial correct, real time response/i.test(line.s));
  const words = inRange.flatMap(line => line.words);
  const nearCenter = inRange.filter(line => questionNumber(line.words[0].s) && line.x > .43 && line.x < .62).map(line => line.x).sort((a, b) => a - b);
  const anchor = nearCenter.length ? nearCenter[Math.floor(nearCenter.length / 2)] - .012 : .505;
  let split = anchor;
  let cost = Infinity;
  for (let x = Math.max(.38, anchor - .037); x <= Math.min(.62, anchor + .025); x += .002) {
    const intersections = words.filter(word => word.x < x + .003 && wordRight(word) > x - .003).length;
    const candidate = intersections + Math.abs(x - anchor) * 22;
    if (candidate < cost) { cost = candidate; split = x; }
  }

  const occupied = x => words.filter(word => word.x < x + .002 && wordRight(word) > x - .002).length;
  const cuts = id === 'physics' ? [split] : [];
  if (id === 'chemistry') {
    const valleys = [];
    for (let x = .20; x <= .82; x += .005) {
      const nearest = Math.min(occupied(x - .023), occupied(x + .023));
      if (nearest >= 5 && occupied(x) < nearest * .36) valleys.push({ x, score: nearest - occupied(x) * 2 });
    }
    valleys.sort((a, b) => b.score - a.score);
    for (const valley of valleys) {
      if (cuts.every(cut => Math.abs(cut - valley.x) > .205)) cuts.push(valley.x);
      if (cuts.length === 2) break;
    }
    if (!cuts.length) cuts.push(split);
  }
  const edges = [0, ...cuts.sort((a, b) => a - b), 1];
  return edges.slice(0, -1).map((left, index) => {
    const right = edges[index + 1];
    const localStart = chapterHeading && chapterHeading.x > left - .18 && chapterHeading.right < right + .27
      ? Math.max(start, chapterHeading.bottom + .004) : start;
    const localEnd = answerKey && id === 'chemistry' && right > answerKey.x - .22 && left < answerKey.right + .30
      ? Math.min(end, answerKey.y - .008) : end;
    if (localEnd <= localStart) return null;
    const lines = inRange.flatMap(line => {
      const words = line.words.filter(word => word.x >= left && word.x < right);
      const box = words.length && bounds(words);
      return box && box.y >= localStart && box.y < localEnd ? [{ words, s: clean(words.map(word => word.s).join(' ')), ...box }] : [];
    }).sort((a, b) => a.y - b.y || a.x - b.x);
    const aligned = lines.filter(line => questionNumber(line.words[0].s) && line.x < left + .17).map(line => line.x).sort((a, b) => a - b);
    const margin = aligned.length ? aligned[Math.floor(aligned.length * .38)] : left + .05;
    const limit = Math.max(left, margin - .03);
    return { page, lines, left: limit, right: right - .003, start: localStart, end: localEnd, margin };
  }).filter(Boolean);
}

function stableMarkers(columns) {
  const markers = columns.flatMap((column, columnIndex) => column.lines.flatMap(line => {
    const first = line.words.slice(0, 2).find(word => questionNumber(word.s) && word.x >= column.margin - .065 && word.x <= column.margin + .033);
    if (!first) return [];
    const number = questionNumber(first.s);
    if (first.h < .0044 || first.h > .016 || (line.s.length > first.s.length && /^\d[.,]\d/.test(line.s.slice(first.s.length + 1)))) return [];
    return [{ line, number, columnIndex, value: 2 + (line.words.length > 2 ? 1 : 0) + Math.max(0, 1 - Math.abs(line.x - column.margin) * 45) }];
  }));
  // Reject diagram numbers and numbered sub-parts by following the strongest
  // increasing sequence across columns, with near-consecutive numbers favored.
  const best = markers.map((marker, index) => ({ score: marker.value - Math.min(70, marker.number - 1) * 1.6, previous: -1, index }));
  for (let i = 0; i < markers.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const step = markers[i].number - markers[j].number;
      if (step < 1 || step > 20 || markers[i].columnIndex - markers[j].columnIndex > 4) continue;
      const score = best[j].score + markers[i].value + (step === 1 ? 3.4 : -1.9 * (step - 1));
      if (score > best[i].score) best[i] = { score, previous: j, index: i };
    }
  }
  let current = best.reduce((winner, item) => item.score > winner.score ? item : winner, { score: -Infinity, index: -1 });
  const selected = [];
  while (current?.index >= 0) {
    selected.push(markers[current.index]);
    current = best[current.previous];
  }
  return selected.reverse();
}

function wordRows(words) {
  const sorted = [...words].sort((a, b) => a.y + a.h * .65 - (b.y + b.h * .65));
  const rows = [];
  for (const word of sorted) {
    const baseline = word.y + word.h * .65;
    const row = rows.at(-1);
    if (!row || baseline - row.baseline > .0041) rows.push({ baseline, words: [word] });
    else row.words.push(word);
  }
  return rows.map(row => row.words.sort((a, b) => a.x - b.x));
}

function readKey(page, heading) {
  if (!page || !heading) return new Map();
  const words = page.lines.filter(line => line.y >= heading.bottom - .004 && !/telegram|scanned with/i.test(line.s)).flatMap(line => line.words).filter(word => word.y < .957);
  const keys = new Map();
  for (const row of wordRows(words)) {
    for (let index = 0; index < row.length; index++) {
      const word = row[index];
      const start = /^(\d{1,3})\.(.*)$/.exec(word.s);
      if (!start || /^[\d./%]/.test(start[2])) continue;
      const number = Number(start[1]);
      const next = row.slice(index + 1, index + 6).findIndex(part => /^(\d{1,3})\.(?:$|[([])/.test(part.s));
      const following = row.slice(index + 1, next < 0 ? index + 6 : index + 1 + next).filter(part => part.x - wordRight(word) < .09);
      const text = clean([start[2], ...following.map(part => part.s)].join(' '));
      const choice = /^(\([a-d](?:\s*[,;]\s*[a-d])*\))(?=$|\s|[•|])/.exec(text.toLowerCase());
      const numeric = /^\[\s*([−+-]?\d+(?:\.\d+)?)\s*\](?=$|\s|[•|])/.exec(text);
      if (!choice && !numeric) continue;
      const end = following.find(part => /[)\]]$/.test(part.s)) ?? word;
      const crop = region(page, word.x - .006, Math.min(word.y, end.y) - .004, Math.max(wordRight(word), wordRight(end)) + .007, Math.max(wordBottom(word), wordBottom(end)) + .004);
      const parsed = choice ? { answers: [...choice[0].matchAll(/[a-d]/g)].map(letter => letter[0].charCodeAt(0) - 97), answerText: choice[0] } : { numericAnswer: Number(numeric[1].replace('−', '-')), answerText: numeric[0] };
      const current = keys.get(number);
      if (current && current.answerText !== parsed.answerText) keys.set(number, null);
      else if (current !== null) keys.set(number, { ...parsed, crop });
    }
  }
  return keys;
}

function buildChapter(id, chapter, pages, filename) {
  const [title, start, end, level, configuredKey] = chapter;
  const chapterId = `${id}-${start}`;
  const chapterPages = Array.from({ length: end - start + 1 }, (_, index) => pages.get(start + index)).filter(Boolean);
  const keyPage = chapterPages.find(page => page.number === configuredKey) ?? chapterPages.findLast(page => page.lines.some(line => solutionHeading.test(line.s)));
  const keyHeading = keyPage?.lines.find(line => solutionHeading.test(line.s));
  const keys = readKey(keyPage, keyHeading);
  const fallbackKey = keyHeading && region(keyPage, .025, keyHeading.y - .008, .99, .983);
  const columns = chapterPages.flatMap(page => pageColumns(page, { firstPage: page.number === start, answerKey: page === keyPage ? keyHeading : undefined, id }));
  const markers = stableMarkers(columns);
  const questions = [];
  let kind = 'self';
  let sectionThrough = 0;
  let sectionTop = 0;
  for (let index = 0; index < markers.length; index++) {
    const marker = markers[index];
    const next = markers[index + 1];
    const first = columns[marker.columnIndex];
    while (sectionThrough <= marker.columnIndex) {
      const column = columns[sectionThrough];
      for (const line of column.lines) {
        if (line.y < sectionTop || (column === first && line.y >= marker.line.y)) continue;
        kind = sectionType(line.s) ?? kind;
      }
      if (column === first) { sectionTop = marker.line.y; break; }
      sectionThrough++;
      sectionTop = 0;
    }

    const regions = [];
    const questionLines = [];
    // A question can start near the foot of one column and continue at the
    // next column's head. Only attach the continuation before a new question.
    const lastIndex = next?.columnIndex === marker.columnIndex + 1 && next.number === marker.number + 1 ? next.columnIndex : marker.columnIndex;
    for (let columnIndex = marker.columnIndex; columnIndex <= lastIndex; columnIndex++) {
      const column = columns[columnIndex];
      const startsHere = columnIndex === marker.columnIndex;
      const top = startsHere ? marker.line.y - .004 : Math.max(column.start, column.lines[0]?.y - .008 || column.start);
      const nextTop = next?.columnIndex === columnIndex ? next.line.y - .003 : column.end;
      const divider = column.lines.find(line => line.y > top + .018 && line.y < nextTop && (sectionType(line.s) || /^Paragraph\s*\(\s*Q/i.test(line.s)));
      const bottom = divider ? divider.y - .003 : nextTop;
      const visible = column.lines.filter(line => line.y >= top && line.y < bottom);
      if (!visible.length || bottom - top < .012 || (!startsHere && divider && visible.length < 2)) continue;
      const left = Math.min(column.left, marker.line.x - .012);
      const clippedLeft = startsHere ? left : column.left;
      const isKeyPage = column.page === keyPage;
      const contentBottom = Math.max(...visible.map(line => line.bottom));
      const croppedBottom = isKeyPage || !next ? Math.min(bottom, Math.max(top + .04, contentBottom + .08)) : bottom;
      regions.push(region(column.page, clippedLeft, top, column.right, croppedBottom));
      questionLines.push(...visible.map(line => line.s));
    }
    if (!regions.length) continue;
    const text = clean(questionLines.join(' '));
    if (text.replace(/^\d+[.)]/, '').trim().length < 6) continue;
    const year = [...text.matchAll(/(?:JEE|Adv[.])[^\d]{0,10}(19[789]\d|20[012]\d)/gi)].at(-1)?.[1];
    const choiceLabels = new Set([...text.matchAll(/\(([a-d])\)/gi)].map(match => match[1].toLowerCase()));
    const verified = verifiedChoices[chapterId]?.[marker.number];
    const key = keys.get(marker.number);
    const printed = verified ? { answers: [...verified].map(letter => letter.charCodeAt(0) - 97), answerText: `(${[...verified].join(', ')})`, crop: key?.crop } : key;
    const choiceFormat = kind === 'single' || kind === 'multiple' || choiceLabels.size >= 3 || Boolean(verified);
    const identified = choiceFormat && printed?.answers && (choiceLabels.size >= 3 || kind === 'single' || kind === 'multiple' || verified) && !(kind === 'single' && printed.answers.length > 1 && !verified);
    const numeric = kind === 'numeric' && Number.isFinite(printed?.numericAnswer);
    const answerRegions = printed?.crop ? [printed.crop] : fallbackKey ? [fallbackKey] : undefined;
    questions.push({
      id: `${chapterId}-${marker.number}`, number: marker.number, label: String(marker.number), page: first.page.number,
      prompt: text.replace(/^\d+[.)]\s*/, ''), regions,
      kind: choiceFormat ? (kind === 'multiple' || printed?.answers?.length > 1 ? 'multiple' : 'single') : kind === 'numeric' ? 'numeric' : 'self',
      ...(choiceFormat && { optionCount: 4 }),
      ...(identified && { answers: printed.answers }),
      ...(numeric && { numericAnswer: printed.numericAnswer }),
      ...(printed && { answerText: printed.answerText }),
      ...(answerRegions && { answerRegions }),
      ...(year && { year: Number(year) }),
    });
  }
  for (const [number, kind, crops, answer, year] of checkedRegions[chapterId] ?? []) {
    const regions = crops.map(([page, x, y, right, bottom]) => region(pages.get(page), x, y, right, bottom));
    const text = crops.flatMap(([page, x, y, right, bottom]) => pages.get(page).lines
      .filter(line => line.x >= x && line.right <= right + .035 && line.y >= y && line.bottom <= bottom + .005)
      .sort((a, b) => a.y - b.y || a.x - b.x).map(line => line.s));
    const key = keys.get(number);
    const answers = kind === 'single' && answer ? [answer.charCodeAt(0) - 97] : kind === 'single' && key?.answers?.length === 1 ? key.answers : undefined;
    const corrected = { id: `${chapterId}-${number}`, number, label: String(number), page: regions[0].page, kind,
      prompt: clean(text.join(' ')).replace(/^\d+[.)]\s*/, '') || `Printed question ${number}`, regions,
      ...(kind === 'single' && { optionCount: 4 }), ...(answers && { answers }),
      ...(answer && { answerText: kind === 'single' ? `(${answer})` : answer }),
      ...(fallbackKey && { answerRegions: [key?.crop ?? fallbackKey] }), ...(year && { year }),
    };
    const existing = questions.findIndex(question => question.number === number);
    if (existing >= 0) questions[existing] = corrected;
    else questions.push(corrected);
  }
  questions.sort((a, b) => a.number - b.number);
  const sourceRegions = chapterPages.map(page => region(page, 0, 0, 1, 1));
  return { id: chapterId, title, subject: id === 'physics' ? 'Physics' : 'Chemistry', level: `Class ${level}`, source: filename, bookId: id, startPage: start, endPage: end, sourceRegions, count: questions.length, questions };
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

const available = await readdir(sourceDir);
const books = [];
const chapters = [];
await mkdir(outputDir, { recursive: true });
for (const id of requested.length ? requested : ['mathematics', 'physics', 'chemistry']) {
  const filename = available.find(file => new RegExp(`^PW 46 YEARS ${id} JEE adv.*\\.pdf$`, 'i').test(file));
  if (!filename) throw new Error(`Missing ${id} PDF in ${sourceDir}.`);
  const source = path.join(sourceDir, filename);
  const pages = await readPages(id);
  const subject = id[0].toUpperCase() + id.slice(1);
  const book = { id, filename, subject, bytes: (await stat(source)).size, sha256: await sha256(source), pageCount: Math.max(0, ...pages.keys()) };
  const customPath = id === 'mathematics' ? '.local/practice-mathematics.json' : path.join(ocrDir, `${id}-chapters.json`);
  const ranges = id === 'physics' ? physics : id === 'chemistry' ? chemistry : [];
  const bySubject = existsSync(customPath) ? await readJson(customPath) : ranges.map(chapter => buildChapter(id, chapter, pages, filename));
  const normalized = Array.isArray(bySubject) ? bySubject : bySubject.chapters;
  books.push({ ...book, pageCount: book.pageCount || bySubject.books?.find(source => source.id === id)?.pageCount || 0 });
  chapters.push(...normalized.map(chapter => {
    if (chapter.sourceRegions?.length || !chapter.questions.length) return chapter;
    const questionPages = chapter.questions.flatMap(question => [question.page, ...(question.regions ?? []).map(region => region.page), ...(question.answerRegions ?? []).map(region => region.page)]).filter(Number.isFinite);
    const startPage = chapter.startPage ?? Math.min(...questionPages);
    const endPage = chapter.endPage ?? Math.max(...questionPages);
    return { ...chapter, startPage, endPage, sourceRegions: Array.from({ length: endPage - startPage + 1 }, (_, index) => ({ page: startPage + index, x: 0, y: 0, width: 1, height: 1 })) };
  }));
  console.log(`${subject}: ${normalized.length} chapters, ${normalized.reduce((total, chapter) => total + chapter.questions.length, 0)} questions, ${normalized.reduce((total, chapter) => total + chapter.questions.filter(question => question.answers || question.numericAnswer !== undefined).length, 0)} matched for scoring.`);
}
await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify({ version: 1, books, chapters })}\n`);
