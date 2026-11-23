import fs from 'node:fs/promises';

// Glutes terminology: שרירי הישבן / ישבן (never גלוט/גלוטה/עכוז). Idempotent.
const file = 'src/data/exercise-translations-he.json';
const rows = JSON.parse(await fs.readFile(file, 'utf8'));
const names = {
  fe_Barbell_Glute_Bridge: 'גשר ישבן עם מוט',
  fe_Butt_Lift_Bridge: 'הרמת ישבן בגשר',
  fe_Floor_Glute_Ham_Raise: 'הרמת ישבן וירך אחורית על הרצפה',
  'fe_Floor_Glute-Ham_Raise': 'הרמת ישבן וירך אחורית על הרצפה',
  fe_Glute_Ham_Raise: 'הרמת ישבן וירך אחורית',
  fe_Glute_Kickback: 'פשיטת ירך לאחור לישבן',
  fe_IT_Band_and_Glute_Stretch: 'מתיחת הרצועה הצידית בירך והישבן',
  fe_Lying_Glute: 'מתיחת ישבן בשכיבה',
  fe_Natural_Glute_Ham_Raise: 'הרמת ישבן וירך אחורית טבעית',
  fe_Seated_Glute: 'מתיחת ישבן בישיבה',
  fe_Single_Leg_Glute_Bridge: 'גשר ישבן ברגל אחת',
  'fe_One-Legged_Cable_Kickback': 'פשיטת ירך לאחור בכבל ברגל אחת',
  fl_1709: 'מתיחת ישבן בשכיבה בסיוע',
  fl_1710: 'מתיחת ישבן ושריר האגס בשכיבה בסיוע',
  fl_3562: 'גשר ישבן עם מוט, שתי רגליים על ספסל',
  fl_3561: 'צעדות בגשר ישבן',
  fl_3523: 'גשר ישבן עם שתי רגליים על ספסל',
  fl_3013: 'גשר ישבן נמוך על הרצפה',
  fl_1424: 'מתיחת ישבן בישיבה',
  fl_0860: 'פשיטת ירך לאחור בכבל',
  sw_legs_placeholder: '',
  'sw_legs-smith-machibe-glute-kickback': 'פשיטת ירך לאחור בסמית משין לישבן',
  'sw_legs-glute-ham-raise-1-2': 'הרמת ישבן וירך אחורית, חצי טווח',
  'sw_legs-smith-kneeling-hip-thrust': 'הרמת אגן בכריעה בסמית משין',
  'sw_legs-glute-bridge-walkout': 'הליכה החוצה מגשר ישבן',
  'sw_gluteus-barbell-hip-thrust': 'הרמת אגן עם מוט',
  'sw_gluteus-glute-cable-kickback': 'פשיטת ירך לאחור בכבל לישבן',
  'sw_gluteus-machine-hip-thrust': 'הרמת אגן במכונה',
  'sw_gluteus-glute-machine-kickback': 'פשיטת ירך לאחור במכונה לישבן',
  'sw_gluteus-dumbbell-single-leg-hip-thrust': 'הרמת אגן ברגל אחת עם משקולת יד',
  'sw_gluteus-glute-bridge': 'גשר ישבן',
  'sw_gluteus-weighted-glute-bridge': 'גשר ישבן עם משקל',
  'sw_gluteus-barbell-glute-bridge': 'גשר ישבן עם מוט',
  'sw_gluteus-hip-thrust-smith-machine': 'הרמת אגן בסמית משין',
  'sw_gluteus-single-leg-hip-thrust': 'הרמת אגן ברגל אחת',
  'sw_gluteus-band-lying-clamshells': 'צדפה בשכיבה עם רצועה',
  'sw_gluteus-dumbbell-hip-thrust': 'הרמת אגן עם משקולת יד',
  'sw_gluteus-glute-bridge-single-leg': 'גשר ישבן ברגל אחת',
  'sw_gluteus-kneeling-resistance-band-glute-kickback': 'פשיטת ירך לאחור בכריעה עם רצועת התנגדות',
  'sw_gluteus-mini-band-glute-bridge': 'גשר ישבן עם מיני רצועה',
  'sw_gluteus-donkey-kick': 'בעיטת חמור לישבן',
  'sw_gluteus-band-standing-balance-glute-kickback': 'פשיטת ירך לאחור בעמידה על רגל אחת עם רצועה',
  'sw_gluteus-hip-thrust': 'הרמת אגן',
  'sw_gluteus-glute-bridge-on-bench': 'גשר ישבן על ספסל',
  'sw_gluteus-side-plank-clamshell': 'צדפה בפלאנק צידי',
  'sw_gluteus-cable-diagonal-kickback': 'פשיטת ירך באלכסון בכבל',
  'sw_gluteus-glutes-roll': 'עיסוי ישבן בגליל',
  'sw_gluteus-single-leg-weighted-glute-bridge': 'גשר ישבן ברגל אחת עם משקל',
  'sw_gluteus-clamshell': 'צדפה',
  'sw_gluteus-mini-band-hip-thrust': 'הרמת אגן עם מיני רצועה',
  'sw_gluteus-fire-hydrant-kick': 'בעיטת ברז כיבוי אש לישבן',
  'sw_gluteus-kneeling-hip-thrust': 'הרמת אגן בכריעה',
  'sw_gluteus-glute-bridge-march': 'צעדות בגשר ישבן',
};
delete names.sw_legs_placeholder;
let changed = 0;
for (const [id, row] of Object.entries(rows)) {
  if (names[id] && row.nameHe !== names[id]) {
    row.nameHe = names[id];
    changed++;
  }
  // Instructions: unify glute wording.
  row.instructionsHe = row.instructionsHe
    .replace(/גלוטאוס מקסימוס|גלוטאוס/g, 'שריר הישבן')
    .replace(/(^|[^\u0590-\u05ff])([הבלו]?)גלוטים(?![\u0590-\u05ff])/g, '$1$2ישבן')
    .replace(/(^|[^\u0590-\u05ff])([הבלו]?)גלוטה(?![\u0590-\u05ff])/g, '$1$2ישבן')
    .replace(/(^|[^\u0590-\u05ff])([הבלו]?)גלוט(?![\u0590-\u05ff])/g, '$1$2ישבן')
    .replace(/עכוז/g, 'ישבן');
}
await fs.writeFile(file, JSON.stringify(rows, null, 2) + '\n');
console.log('Updated glute names:', changed);
