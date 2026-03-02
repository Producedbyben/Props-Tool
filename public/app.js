let state = { projectId: null, props: [], activeProp: null };

async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.text();
}

async function boot() {
  const cfg = await api('/api/config');
  document.getElementById('providerLabel').textContent = `Provider: ${cfg.provider} (${cfg.amazonDomain})`;
}

async function refreshProps() {
  state.props = await api(`/api/projects/${state.projectId}/props`);
  const grid = document.getElementById('propGrid');
  grid.innerHTML = '';
  for (const prop of state.props) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<h3>${prop.prop_name}</h3><p>${prop.description || ''}</p><small>Status: ${prop.status}</small>`;
    const options = document.createElement('div');
    options.className = 'options';
    for (const opt of prop.options) {
      const tile = document.createElement('div');
      tile.className = 'option';
      tile.innerHTML = `<img src="${opt.image_url || 'https://via.placeholder.com/120?text=No+Image'}"/><div>£${opt.price_amount}</div><div>${opt.delivery_message || ''}</div><a href="${opt.url}" target="_blank">Amazon</a>`;
      tile.onclick = async () => {
        await api(`/api/projects/${state.projectId}/props/${prop.id}/select-option`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId: opt.id }) });
        refreshPurchasing();
        refreshProps();
      };
      if (prop.selected_option_id === opt.id) tile.classList.add('selected');
      options.appendChild(tile);
    }
    card.appendChild(options);
    const open = document.createElement('button');
    open.textContent = 'Details';
    open.onclick = () => openDialog(prop);
    card.appendChild(open);
    grid.appendChild(card);
  }
  refreshPurchasing();
}

function openDialog(prop) {
  state.activeProp = prop;
  document.getElementById('dialogTitle').textContent = prop.prop_name;
  document.getElementById('dialogMeta').textContent = `${prop.priority} • Qty ${prop.quantity} • ${prop.scene_or_reference || ''}`;
  document.getElementById('queryOverride').value = prop.search_query_override || '';
  document.getElementById('propNotes').value = prop.notes || '';
  document.getElementById('propDialog').showModal();
}

async function refreshPurchasing() {
  const panel = document.getElementById('purchasingPanel');
  if (!state.projectId) return;
  const data = await api(`/api/projects/${state.projectId}/purchasing-list`);
  panel.hidden = false;
  const text = data.items.map((i) => `${i.prop_name} x${i.quantity} - £${i.price_amount} = £${i.line_total} (${i.delivery_expected_date_iso}) ${i.url}`).join('\n');
  document.getElementById('purchaseText').textContent = `${text}\n\nTOTAL £${data.total}`;
  document.getElementById('downloadCsvLink').href = `/api/projects/${state.projectId}/purchasing-list.csv`;
}

document.getElementById('projectForm').onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const project = await api('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  state.projectId = project.id;
  document.getElementById('workspace').hidden = false;
  refreshProps();
};

document.getElementById('importCsvBtn').onclick = async () => {
  const file = document.getElementById('csvFile').files[0];
  if (!file || !state.projectId) return;
  const fd = new FormData();
  fd.append('file', file);
  await api(`/api/projects/${state.projectId}/props/import-csv`, { method: 'POST', body: fd });
  refreshProps();
};

document.getElementById('searchAllBtn').onclick = async () => {
  const progress = document.getElementById('progress');
  progress.textContent = 'Searching all props...';
  const out = await api(`/api/projects/${state.projectId}/search-all`, { method: 'POST' });
  progress.textContent = `Finished ${out.total} props`;
  refreshProps();
};

document.getElementById('rerunBtn').onclick = async (e) => {
  e.preventDefault();
  const prop = state.activeProp;
  await api(`/api/projects/${state.projectId}/props/${prop.id}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchQueryOverride: document.getElementById('queryOverride').value, notes: document.getElementById('propNotes').value }),
  });
  document.getElementById('propDialog').close();
  refreshProps();
};

document.getElementById('copyPurchaseBtn').onclick = async () => {
  await navigator.clipboard.writeText(document.getElementById('purchaseText').textContent);
};

boot();
