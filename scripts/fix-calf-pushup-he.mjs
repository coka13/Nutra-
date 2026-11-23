import fs from 'node:fs/promises';

// Terminology: calf -> תאומים, push-up -> שכיבות סמיכה. Idempotent.
const file = 'src/data/exercise-translations-he.json';
const rows = JSON.parse(await fs.readFile(file, 'utf8'));
const sources = new Map([
  ...JSON.parse(await fs.readFile('src/data/free-exercises.json', 'utf8')).map((r) => ['fe_' + r.id, r.name]),
  ...JSON.parse(await fs.readFile('src/data/animated-exercises.json', 'utf8')).map((r) => ['fl_' + r.id, r.name]),
  ...JSON.parse(await fs.readFile('src/data/smartworkout-exercises.json', 'utf8')).map((r) => [
    'sw_' + r.path.split('/').slice(-2).join('-').replace(/[^a-z0-9-]/g, ''),
    r.name,
  ]),
]);
const H = '(?![\\u0590-\\u05ff])';
const calfName = new RegExp('(^|[^\\u0590-\\u05ff])([הבל]?)(?:עגלים|עגל|שוקיים|שוק)' + H + '(?! הצידיים)', 'g');
const calfText = new RegExp('(^|[^\\u0590-\\u05ff])([הב]?)(?:עגלים|עגל)' + H, 'g');
const mods = {
  'incline': 'בשיפוע חיובי', 'decline': 'בשיפוע שלילי', 'wide': 'רחבות', 'wide hand': 'באחיזה רחבה',
  'close grip': 'באחיזה צרה', 'close-grip': 'באחיזה צרה', 'diamond': 'יהלום', 'knee': 'על הברכיים',
  'kneeling': 'על הברכיים', 'clap': 'עם מחיאת כף', 'archer': 'קשת', 'plyometric': 'פליומטריות',
  'plyo': 'פליומטריות', 'wall': 'על הקיר', 'deep': 'עמוקות', 'weighted': 'עם משקל', 'pike': 'פייק',
  'handstand': 'בעמידת ידיים', 'one-arm': 'ביד אחת', 'single-arm': 'ביד אחת', 'negative': 'שליליות',
  'superman': 'סופרמן', 'planche': 'פלאנץ׳', 'cobra': 'קוברה', 'scapula': 'שכמות', 'finger': 'על האצבעות',
  'knuckle': 'על פרקי האצבעות', 'ring': 'בטבעות', 'jack': 'ג׳ק', 'wrist': 'על שורש כף היד',
  'inchworm': 'עם הליכת זחל', 'suspended': 'בתלייה', 'triceps': 'לשריר התלת־ראשי', 'cross arms': 'בהצלבת ידיים',
  'hand-release': 'עם שחרור ידיים', 'reverse': 'הפוכות', 'medium': 'בינוני', 'side': 'לצד',
};
const manual = {
  fe_Incline_Push_Up_Close_Grip: '',
  'fe_Incline_Push-Up_Close-Grip': 'שכיבות סמיכה בשיפוע באחיזה צרה',
  'fe_Incline_Push-Up_Depth_Jump': 'שכיבות סמיכה בשיפוע עם קפיצת עומק',
  'fe_Incline_Push-Up_Reverse_Grip': 'שכיבות סמיכה בשיפוע באחיזה הפוכה',
  'fe_Incline_Push-Up_Wide': 'שכיבות סמיכה בשיפוע באחיזה רחבה',
  fe_Push_Up_to_Side_Plank: 'שכיבות סמיכה עם מעבר לפלאנק צידי',
  fl_0975: 'שכיבות סמיכה באחיזה צרה עם רצועה',
  fl_1275: 'שכיבות סמיכה עם ירידה מהירה',
  fl_1772: 'שכיבות סמיכה הפוכות עם הרמת מרפקים',
  fl_1296: 'שכיבות סמיכה פייק על כדור פיזיו',
  fl_0490: 'שכיבות סמיכה בשיפוע באחיזה צרה',
  fl_0494: 'שכיבות סמיכה בשיפוע באחיזה הפוכה',
  fl_3011: 'שכיבות סמיכה לשכמות בשיפוע',
  fl_0545: 'שכיבות סמיכה פליומטריות עם קטלבל',
  fl_1701: 'שכיבות סמיכה באחיזה צרה על כדור כוח',
  fl_1421: 'שכיבות סמיכה על האמות',
  fl_0642: 'שכיבות סמיכה עם בעיטת רגל לצד',
  fl_3662: 'שכיבות סמיכה מפייק לקוברה',
  fl_1307: 'שכיבות סמיכה על כדור בוסו',
  fl_0658: 'שכיבות סמיכה על הקיר (גרסה 2)',
  fl_0660: 'שכיבות סמיכה באחיזה צרה מעל משקולת',
  fl_0661: 'שכיבות סמיכה עם בעיטת רגל פנימה',
  fl_0666: 'שכיבות סמיכה ביד אחת עם הרמה',
  fl_0699: 'שכיבות סמיכה עם נגיעה בכתף',
  fl_0778: 'שכיבות סמיכה בזחילת ספיידרמן',
  fl_1310: 'שכיבות סמיכה עם ירידה ומשקל',
  'sw_chest-deep-push-up-on-parallel-bars': 'שכיבות סמיכה עמוקות על מקבילים',
  'sw_chest-dumbbell-deep-push-up': 'שכיבות סמיכה עמוקות עם משקולות יד',
  'sw_chest-kneeling-wide-push-up': 'שכיבות סמיכה רחבות על הברכיים',
  'sw_chest-resistance-band-push-up': 'שכיבות סמיכה עם רצועת התנגדות',
  'sw_chest-reverse-wrist-push-up': 'שכיבות סמיכה עם כפות ידיים הפוכות',
  'sw_chest-push-up-to-side-plank': 'שכיבות סמיכה עם מעבר לפלאנק צידי',
  'sw_triceps-incline-close-grip-push-up': 'שכיבות סמיכה בשיפוע באחיזה צרה',
  'sw_triceps-reverse-hand-push-up': 'שכיבות סמיכה עם ידיים הפוכות',
};
delete manual.fe_Incline_Push_Up_Close_Grip;
const pushRe = /push[\s-]?ups?/i;
const unresolved = [];
for (const [id, row] of Object.entries(rows)) {
  const en = sources.get(id) || '';
  let name = row.nameHe;
  if (pushRe.test(en)) {
    const rest = en
      .replace(/push[\s-]?ups?/gi, '')
      .replace(/[()]/g, ' ')
      .trim()
      .toLowerCase();
    const key = rest.replace(/\s+/g, ' ');
    if (!key) name = 'שכיבות סמיכה';
    else if (mods[key]) name = 'שכיבות סמיכה ' + mods[key];
    else {
      name = name
        .replace(/פוש[\s-]?אפ|שכיבות סמיכה|שכיבת סמיכה/g, 'שכיבות סמיכה')
        .replace(/\s+/g, ' ');
      if (!/שכיבות סמיכה/.test(name)) unresolved.push([id, en, name]);
    }
  }
  if (/\bcal(f|ves)\b/i.test(en) || /עגל/.test(name))
    name = name.replace(calfName, '$1$2תאומים');
  row.nameHe = manual[id] || name;
  row.instructionsHe = row.instructionsHe.replace(calfText, '$1$2תאומים');
}
await fs.writeFile(file, JSON.stringify(rows, null, 2) + '\n');
console.log('Unresolved push-up names:', JSON.stringify(unresolved, null, 1));
