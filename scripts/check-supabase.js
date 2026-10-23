require('../app');
const { testSupabaseConnection } = require('../services/supabaseRest');

function keySummary(value, expectedPrefix) {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  return `${key.startsWith(expectedPrefix) ? 'format OK' : 'unexpected format'} (${expectedPrefix}..., length ${key.length})`;
}

(async () => {
  const projectRef = String(process.env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0];
  console.log(`Project: ${projectRef || '(missing)'}`);
  console.log(`Publishable config: ${keySummary(process.env.SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_')}`);
  console.log(`Secret config: ${keySummary(process.env.SUPABASE_SECRET_KEY, 'sb_secret_')}`);

  const pub = await testSupabaseConnection('public');
  const adm = await testSupabaseConnection('admin');
  console.log('Publishable:', pub.ok ? 'OK' : `FAIL - ${pub.error}`);
  console.log('Secret:', adm.ok ? 'OK' : `FAIL - ${adm.error}`);
  process.exit(pub.ok && adm.ok ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
