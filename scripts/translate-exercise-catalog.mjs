import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Build-time only: translate public catalog text, then ship the results locally.
// No user records are sent and the running app never calls this endpoint.
const free = JSON.parse(await fs.readFile('src/data/free-exercises.json', 'utf8'));
const flow = JSON.parse(await fs.readFile('src/data/animated-exercises.json', 'utf8'));
const smart = JSON.parse(await fs.readFile('src/data/smartworkout-exercises.json', 'utf8'));
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const names = new Set(free.map((row) => normalize(row.name)));
const rows = [
  ...smart.map((row) => ({
    id:
      'sw_' +
      row.path
        .split('/')
        .slice(-2)
        .join('-')
        .replace(/[^a-z0-9-]/g, ''),
    name: row.name,
    instructions: row.instructions.join('\n'),
  })),
  ...free.map((row) => ({
    id: 'fe_' + row.id,
    name: row.name,
    instructions: row.instructions.join('\n'),
  })),
  ...flow
    .filter((row) => !names.has(normalize(row.name)))
    .map((row) => ({
      id: 'fl_' + row.id,
      name: row.name,
      instructions: row.instructions.join('\n'),
    })),
];
const file = 'src/data/exercise-translations-he.json';
let result = {};
try {
  result = JSON.parse(await fs.readFile(file, 'utf8'));
} catch {}
const hash = (row) =>
  createHash('sha256')
    .update(row.name + '\n' + row.instructions)
    .digest('hex');
const missing = rows.filter((row) => result[row.id]?.sourceHash !== hash(row));
const fields = missing.flatMap((row) => [
  { row, key: 'nameHe', text: row.name },
  { row, key: 'instructionsHe', text: row.instructions },
]);
const batches = [];
let batch = [],
  size = 0;
for (const field of fields) {
  if (size + field.text.length + 20 > 4200 && batch.length) {
    batches.push(batch);
    batch = [];
    size = 0;
  }
  batch.push(field);
  size += field.text.length + 20;
}
if (batch.length) batches.push(batch);
const overrides = {
  fe_Adductor: 'קירוב ירך',
  fe_Abductor: 'הרחקת ירך',
  fe_Preacher_Curl: 'כפיפת מרפקים בכיסא כומר עם מוט',
  fe_Machine_Preacher_Curls: 'כפיפת מרפקים במכונת כומר',
  fe_Cable_Preacher_Curl: 'כפיפת מרפקים בכיסא כומר בכבל',
  fe_One_Arm_Dumbbell_Preacher_Curl: 'כפיפת מרפק בכיסא כומר עם משקולת יד',
  fe_Two_Arm_Dumbbell_Preacher_Curl: 'כפיפת מרפקים בכיסא כומר עם משקולות יד',
  fl_0070: 'כפיפת מרפקים בכיסא כומר עם מוט',
};
function terminology(value) {
  return value
    .replace(/ספסל מטיף|ספסל המטיף|ספסל ההטפה/g, 'כיסא כומר')
    .replace(/תלתלי מטיף|תלתל מטיף/g, 'כפיפת מרפקים בכיסא כומר')
    .replace(/תלתלי דו.?ראשי|תלתלי שרירי הזרוע/g, 'כפיפת מרפקים')
    .replace(/תלתלים|תלתלי|תלתל/g, 'כפיפת מרפקים');
}
async function translate(text) {
  const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'iw', dt: 't', q: text });
  const response = await fetch('https://translate.googleapis.com/translate_a/single?' + params, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Translation endpoint HTTP ' + response.status);
  const data = await response.json();
  return data[0].map((part) => part[0] || '').join('');
}
let cursor = 0,
  done = 0;
let writes = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(result, null, 2) + '\n';
  writes = writes.then(async () => {
    await fs.writeFile(file + '.tmp', snapshot);
    await fs.rename(file + '.tmp', file);
  });
  return writes;
}
async function worker() {
  while (cursor < batches.length) {
    const fields = batches[cursor++];
    const translated = await translate(
      fields.map((field, index) => `[[${index}]]\n${field.text}`).join('\n'),
    );
    const markers = [...translated.matchAll(/\[\[\s*(\d+)\s*\]\]/g)];
    if (markers.length !== fields.length)
      throw new Error('Translation record boundary mismatch; no output committed for batch');
    for (let index = 0; index < markers.length; index++) {
      const field = fields[Number(markers[index][1])];
      let value = translated
        .slice(
          markers[index].index + markers[index][0].length,
          markers[index + 1]?.index ?? translated.length,
        )
        .trim();
      if (field.key === 'nameHe' && overrides[field.row.id]) value = overrides[field.row.id];
      if (!/[\u0590-\u05ff]/.test(value))
        value = await translate('Fitness exercise: ' + field.text);
      if (!/[\u0590-\u05ff]/.test(value))
        throw new Error('Untranslated ' + field.row.id + ' ' + field.key);
      result[field.row.id] ||= {};
      result[field.row.id][field.key] =
        field.key === 'nameHe' && overrides[field.row.id]
          ? overrides[field.row.id]
          : terminology(value);
      if (result[field.row.id].nameHe && result[field.row.id].instructionsHe)
        result[field.row.id].sourceHash = hash(field.row);
    }
    // A single writer in the JS event loop; temporary files are never imported by the app.
    await save();
    done++;
    if (done % 20 === 0 || done === batches.length)
      console.log(
        `${done}/${batches.length} batches; ${Object.keys(result).length}/${rows.length} exercises translated`,
      );
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
await Promise.all([worker(), worker()]);
console.log('Bundled Hebrew translations for ' + rows.length + ' exercises.');
