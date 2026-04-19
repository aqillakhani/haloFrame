// Ad-hoc verification: SOLO_PROMPT_OVERRIDES for classic_memorial must fire
// only when haveSubjectContext is false. Multi-subject (group + selected
// subject) path must keep the original selective-color prompt.
import { combineTemplatePrompts } from '../src/services/templateCombiner.js';
import { LAUNCH_TEMPLATES } from '@haloframe/shared';

const classic = LAUNCH_TEMPLATES.find((t) => t.id === 'classic_memorial');
if (!classic) {
  console.error('classic_memorial template missing from shared constants');
  process.exit(1);
}

const soloPrompt = combineTemplatePrompts({
  templates: [classic],
  subjectDescription: 'the person',
  intensity: 'gentle',
  haveSubjectContext: false,
});

const groupPrompt = combineTemplatePrompts({
  templates: [classic],
  subjectDescription: 'the person on the left',
  intensity: 'gentle',
  haveSubjectContext: true,
});

const OVERRIDE_SIGNAL = 'Convert this entire photo';
const ORIGINAL_SIGNAL = 'convert ONLY';

const soloUsesOverride = soloPrompt.includes(OVERRIDE_SIGNAL);
const groupUsesOriginal = groupPrompt.toLowerCase().includes(ORIGINAL_SIGNAL.toLowerCase());

console.log('--- single-subject (haveSubjectContext=false) ---');
console.log('uses whole-image override:', soloUsesOverride);
console.log(soloPrompt.slice(0, 200) + '...');
console.log();
console.log('--- multi-subject (haveSubjectContext=true) ---');
console.log('uses original selective prompt:', groupUsesOriginal);
console.log(groupPrompt.slice(0, 200) + '...');
console.log();

if (!soloUsesOverride) {
  console.error('FAIL: solo case did not receive the whole-image override');
  process.exit(1);
}
if (!groupUsesOriginal) {
  console.error('FAIL: group case lost the original selective prompt');
  process.exit(1);
}
console.log('OK: both paths behave as expected.');
