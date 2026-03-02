const express = require('express');
const path = require('path');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const { initDb, db } = require('./db');
const config = require('./config');
const TaskQueue = require('./services/taskQueue');
const RainforestProvider = require('./providers/rainforestProvider');

if (!config.rainforestApiKey) {
  throw new Error('Missing RAINFOREST_API_KEY. Set this in your environment (.env) before starting the Props Tool server.');
}

initDb();
const app = express();
const upload = multer();
const queue = new TaskQueue(config.concurrencyLimit);

const auditStmt = db.prepare(`INSERT INTO provider_audit_log (provider,type,project_id,prop_id,asin,success,latency_ms,credits_used,error_code)
VALUES (@provider,@type,@projectId,@propId,@asin,@success,@latencyMs,@creditsUsed,@errorCode)`);
const logAudit = async (entry) => auditStmt.run({ projectId: null, propId: null, asin: null, ...entry });

const provider = new RainforestProvider(queue, logAudit);

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

const stmts = {
  createProject: db.prepare('INSERT INTO projects (name, notes, treatment_doc_url) VALUES (?, ?, ?)'),
  listProjects: db.prepare('SELECT * FROM projects ORDER BY id DESC'),
  getProject: db.prepare('SELECT * FROM projects WHERE id = ?'),
  insertProp: db.prepare(`INSERT INTO props (project_id,prop_name,description,quantity,priority,scene_or_reference,treatment_doc_url,tags_json)
    VALUES (@project_id,@prop_name,@description,@quantity,@priority,@scene_or_reference,@treatment_doc_url,@tags_json)`),
  listProps: db.prepare('SELECT * FROM props WHERE project_id = ? ORDER BY id ASC'),
  getProp: db.prepare('SELECT * FROM props WHERE id = ? AND project_id = ?'),
  updatePropQuery: db.prepare('UPDATE props SET search_query_override = ?, notes = COALESCE(?, notes) WHERE id = ? AND project_id = ?'),
  clearOptions: db.prepare('DELETE FROM prop_options WHERE prop_id = ?'),
  insertOption: db.prepare(`INSERT INTO prop_options (project_id,prop_id,provider,asin,title,url,image_url,price_amount,price_currency,prime_eligible,delivery_expected_date_iso,delivery_message,rating_stars,rating_count,sold_by,fulfilled_by_amazon,raw_json)
VALUES (@project_id,@prop_id,@provider,@asin,@title,@url,@image_url,@price_amount,@price_currency,@prime_eligible,@delivery_expected_date_iso,@delivery_message,@rating_stars,@rating_count,@sold_by,@fulfilled_by_amazon,@raw_json)`),
  listOptions: db.prepare('SELECT * FROM prop_options WHERE prop_id = ? ORDER BY price_amount ASC'),
  setStatus: db.prepare('UPDATE props SET status = ? WHERE id = ?'),
  selectOption: db.prepare('UPDATE props SET selected_option_id = ? WHERE id = ? AND project_id = ?'),
  selectedRows: db.prepare(`SELECT p.id AS prop_id,p.prop_name,p.quantity,p.priority,o.* FROM props p
    JOIN prop_options o ON p.selected_option_id = o.id
    WHERE p.project_id = ? ORDER BY p.id ASC`),
  cacheGet: db.prepare(`SELECT * FROM provider_cache WHERE project_id = ? AND prop_id = ? AND provider = ? AND query_hash = ? AND datetime(created_at) >= datetime('now', ?) ORDER BY id DESC LIMIT 1`),
  cacheSet: db.prepare('INSERT INTO provider_cache (project_id,prop_id,provider,query_hash,response_json) VALUES (?,?,?,?,?)'),
};

function buildQuery(prop) {
  const tags = JSON.parse(prop.tags_json || '[]').join(' ');
  return [prop.prop_name, prop.description, tags].filter(Boolean).join(' ').trim();
}

function normalizePropRow(row) {
  return { ...row, tags: JSON.parse(row.tags_json || '[]') };
}

app.get('/api/config', (req, res) => res.json({ provider: provider.name, amazonDomain: config.amazonDomain }));

app.get('/api/health/startup', async (req, res) => {
  const diagnostics = await provider.getReadinessDiagnostics({
    runLiveCheck: req.query.live === '1',
  });

  const body = {
    ok: diagnostics.ready,
    provider: diagnostics.provider,
    diagnostics: diagnostics.checks,
    guidance: diagnostics.ready
      ? 'Provider is configured and ready for searches.'
      : 'Fix failing checks and restart the server.',
  };

  res.status(diagnostics.ready ? 200 : 503).json(body);
});

app.get('/api/projects', (req, res) => res.json(stmts.listProjects.all()));
app.post('/api/projects', (req, res) => {
  const { name, notes, treatmentDocUrl } = req.body;
  const result = stmts.createProject.run(name, notes || null, treatmentDocUrl || null);
  res.json(stmts.getProject.get(result.lastInsertRowid));
});

app.get('/api/projects/:projectId/props', (req, res) => {
  const rows = stmts.listProps.all(Number(req.params.projectId)).map(normalizePropRow);
  for (const row of rows) row.options = stmts.listOptions.all(row.id);
  res.json(rows);
});

app.post('/api/projects/:projectId/props/import-csv', upload.single('file'), (req, res) => {
  const projectId = Number(req.params.projectId);
  const csv = req.file?.buffer?.toString('utf8') || '';
  const parsed = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  const tx = db.transaction((records) => {
    for (const r of records) {
      stmts.insertProp.run({
        project_id: projectId,
        prop_name: r.prop_name,
        description: r.description || null,
        quantity: Number(r.quantity || 1),
        priority: r.priority === 'nice-to-have' ? 'nice-to-have' : 'must-have',
        scene_or_reference: r.scene_or_reference || null,
        treatment_doc_url: r.treatment_doc_url || null,
        tags_json: JSON.stringify((r.tags || '').split('|').map((x) => x.trim()).filter(Boolean)),
      });
    }
  });
  tx(parsed);
  res.json({ imported: parsed.length });
});

app.post('/api/projects/:projectId/props/:propId/search', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const propId = Number(req.params.propId);
  const prop = stmts.getProp.get(propId, projectId);
  if (!prop) return res.status(404).json({ error: 'Prop not found' });

  if (req.body.searchQueryOverride !== undefined || req.body.notes !== undefined) {
    stmts.updatePropQuery.run(req.body.searchQueryOverride || null, req.body.notes || null, propId, projectId);
  }
  const freshProp = stmts.getProp.get(propId, projectId);
  const query = freshProp.search_query_override || buildQuery(freshProp);
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  const ttl = `-${config.cacheTtlHours} hours`;
  const cache = stmts.cacheGet.get(projectId, propId, provider.name, hash, ttl);
  let options;
  if (cache) {
    options = JSON.parse(cache.response_json);
  } else {
    options = await provider.findOptions({ ...freshProp, tags: JSON.parse(freshProp.tags_json || '[]') }, query, { projectId, propId });
    stmts.cacheSet.run(projectId, propId, provider.name, hash, JSON.stringify(options));
  }

  const tx = db.transaction(() => {
    stmts.clearOptions.run(propId);
    for (const o of options) {
      stmts.insertOption.run({
        project_id: projectId,
        prop_id: propId,
        provider: o.provider,
        asin: o.asin,
        title: o.title,
        url: o.url,
        image_url: o.imageUrl,
        price_amount: o.price.amount,
        price_currency: o.price.currency,
        prime_eligible: o.primeEligible ? 1 : 0,
        delivery_expected_date_iso: o.delivery.expectedDateISO,
        delivery_message: o.delivery.message,
        rating_stars: o.rating?.stars || null,
        rating_count: o.rating?.count || null,
        sold_by: o.merchant?.soldBy || null,
        fulfilled_by_amazon: o.merchant?.fulfilledByAmazon ? 1 : 0,
        raw_json: JSON.stringify(o.raw || {}),
      });
    }
    stmts.setStatus.run(options.length === 3 ? 'ready' : 'no_prime_next_day_results', propId);
  });
  tx();

  res.json({ optionsCount: options.length, status: options.length === 3 ? 'ready' : 'No Prime next day results found', options: stmts.listOptions.all(propId) });
});

app.post('/api/projects/:projectId/search-all', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const props = stmts.listProps.all(projectId);
  const out = [];
  for (const p of props) {
    try {
      const response = await fetch(`http://localhost:${config.port}/api/projects/${projectId}/props/${p.id}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await response.json();
      out.push({ propId: p.id, ok: response.ok, ...json });
    } catch (err) {
      out.push({ propId: p.id, ok: false, error: err.message });
    }
  }
  res.json({ total: out.length, results: out });
});

app.post('/api/projects/:projectId/props/:propId/select-option', (req, res) => {
  stmts.selectOption.run(Number(req.body.optionId), Number(req.params.propId), Number(req.params.projectId));
  res.json({ ok: true });
});

app.get('/api/projects/:projectId/purchasing-list', (req, res) => {
  const rows = stmts.selectedRows.all(Number(req.params.projectId));
  const data = rows.map((r) => ({ ...r, line_total: Number((r.quantity * r.price_amount).toFixed(2)) }));
  const total = data.reduce((sum, row) => sum + row.line_total, 0);
  res.json({ items: data, total: Number(total.toFixed(2)) });
});

app.get('/api/projects/:projectId/purchasing-list.csv', (req, res) => {
  const rows = stmts.selectedRows.all(Number(req.params.projectId));
  const header = 'prop_name,quantity,unit_price,total,delivery_date,url\n';
  const body = rows.map((r) => {
    const total = (r.quantity * r.price_amount).toFixed(2);
    return `"${r.prop_name.replaceAll('"', '""')}",${r.quantity},${r.price_amount},${total},${r.delivery_expected_date_iso},${r.url}`;
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.send(header + body);
});

app.listen(config.port, () => {
  console.log(`Props Tool running on http://localhost:${config.port}`);
});
