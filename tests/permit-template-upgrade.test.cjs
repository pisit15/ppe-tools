const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, setup } = require('./permit-helpers.cjs');
const { createDb } = require('./chemical-db-fixture.cjs');
const { PERMIT_SEEDS } = load('src/lib/permit/legacy-catalog.ts');
const { AMT_V2_SEEDS } = load('src/lib/permit/amt-forms.ts');
const { getPermitTemplateUpgrades, upgradePermitForms, templateReplacementSnapshot } = load('src/lib/permit/template-upgrade.ts');
const { event } = load('src/lib/permit/workflow.ts');

function fixtures() {
  const old = PERMIT_SEEDS.filter(template => ['003', '004'].includes(template.source_code))
    .map(template => ({ ...structuredClone(template), id: crypto.randomUUID(), active: false }));
  const templates = AMT_V2_SEEDS.map(template => ({ ...structuredClone(template), id: crypto.randomUUID(), active: true }));
  const data = {
    title: 'FMT ตรวจซ่อม', location: 'อาคารผลิต 1', detail: 'ข้อมูลหน้างานเดิม',
    contractorName: 'FMT', phone: '0000000000', workers: 'ผู้ปฏิบัติงานเดิม',
    startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(),
    fireImpact: 'ไม่มี', project: false, approvers: { area_owner: 'owner', safety: 'safety' },
    attachments: [{ id: 'original', name: 'หลักฐานเดิม.pdf', type: 'application/pdf', data: 'unchanged-original-bytes' }],
    signatures: [], events: [{ id: 'original-event', action: 'create', at: new Date().toISOString() }],
    forms: old.map(template => ({ template, answers: Object.fromEntries(template.config.fields.map(field =>
      [field.id, field.kind === 'check' ? 'yes' : `${field.id}: ${'ข'.repeat(4900)}`],
    )) })),
  };
  return { old, templates, data };
}

test('explicit canonical template upgrades preserve job data and text without inferring safety ticks', () => {
  const { templates, data } = fixtures();
  const original = structuredClone(data);
  const upgrades = getPermitTemplateUpgrades(data, templates);
  assert.equal(upgrades.length, 2);
  const next = upgradePermitForms(data, templates);
  assert.deepEqual(data, original, 'the editor source is not mutated');
  const { forms: ignoredOld, ...oldJob } = original;
  const { forms: ignoredNew, ...newJob } = next;
  assert.deepEqual(newJob, oldJob);
  for (const [index, form] of next.forms.entries()) {
    assert.equal(form.template.id, templates[index].id);
    for (const field of form.template.config.fields) {
      if (['equipment', 'hazards', 'additional', 'access'].includes(field.id)) {
        assert.equal(form.answers[field.id], original.forms[index].answers[field.id]);
      } else assert.equal(form.answers[field.id], '', `${field.id} requires a fresh answer`);
    }
    assert.equal(form.answers.hazard_controls, undefined);
  }
  assert.equal(getPermitTemplateUpgrades(next, templates).length, 0);
  assert.equal(upgradePermitForms(next, templates), next, 'repeating the upgrade is a no-op');
});

test('inactive, foreign, altered or older templates cannot be offered as canonical upgrades', () => {
  const { templates, data } = fixtures();
  for (const change of [
    template => ({ ...template, active: false }),
    template => ({ ...template, company_id: 'aab' }),
    template => ({ ...template, revision: 'OTHER' }),
    template => ({ ...template, version: 1 }),
    template => ({ ...template, config: { ...template.config, sourceSha256: 'tampered' } }),
    template => ({ ...template, config: { ...template.config, fields: template.config.fields.map((field, index) => index ? field : { ...field, label: 'altered' }) } }),
  ]) assert.equal(getPermitTemplateUpgrades(data, templates.map(change)).length, 0);
  const foreign = structuredClone(data);
  foreign.forms.forEach(form => { form.template.company_id = 'aab'; });
  assert.equal(upgradePermitForms(foreign, templates), foreign);
});

test('template replacement archives every old answer without recursive audit events', () => {
  const { data, templates } = fixtures();
  const next = upgradePermitForms(data, templates);
  const snapshot = templateReplacementSnapshot(data, next);
  assert.ok(snapshot);
  assert.equal('events' in snapshot, false);
  assert.deepEqual(snapshot.forms, data.forms);
  assert.equal(snapshot.forms[0].answers.hazard_controls, data.forms[0].answers.hazard_controls);
  assert.deepEqual(snapshot.attachments, data.attachments);
  snapshot.forms[0].answers.hazard_controls = 'changed archive copy';
  assert.notEqual(snapshot.forms[0].answers.hazard_controls, data.forms[0].answers.hazard_controls);
  assert.equal(templateReplacementSnapshot(data, { ...data, forms: [...data.forms].reverse() }), undefined);
  assert.equal(templateReplacementSnapshot(data, { ...data, forms: [...data.forms, { template: templates[0], answers: {} }] }), undefined);
  assert.ok(templateReplacementSnapshot(data, { ...data, forms: data.forms.slice(1) }), 'removing a form also preserves its answers');
});

test('a saved template replacement appends one authoritative snapshot under the database audit guard', async () => {
  const db = await createDb();
  try {
    await setup(db);
    const { data, templates } = fixtures();
    const id = crypto.randomUUID();
    const actor = { key: 'company_users:owner', name: 'ผู้ขออนุญาตจริง' };
    const next = upgradePermitForms(data, templates);
    next.events = [...data.events, { ...event(actor, 'edit', 'เปลี่ยนแม่แบบในร่าง'), document: templateReplacementSnapshot(data, next) }];
    await db.exec('set role service_role');
    await db.query('insert into wp_permits(id,company_id,created_by,data) values($1,$2,$3,$4)', [id, 'amt', actor.key, JSON.stringify(data)]);
    await db.query('update wp_permits set data=$1,version=version+1 where id=$2 and version=1', [JSON.stringify(next), id]);
    const saved = (await db.query('select data,version from wp_permits where id=$1', [id])).rows[0];
    assert.equal(saved.version, 2);
    assert.equal(saved.data.events.length, data.events.length + 1);
    const archive = saved.data.events.at(-1);
    assert.equal(archive.actor, actor.key);
    assert.deepEqual(archive.document.forms, data.forms);
    assert.equal('events' in archive.document, false);
    assert.equal(saved.data.forms[0].answers.hazard_machine, '');
  } finally { await db.close(); }
});
