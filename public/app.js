let state = {
  projectId: null,
  props: [],
  activeProp: null,
  loadingProps: false,
  selectingOptionFor: null,
};

async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.text();
}

function getStatusClass(status = '') {
  const value = status.toLowerCase();
  if (value.includes('complete') || value.includes('selected')) return 'done';
  if (value.includes('error') || value.includes('fail')) return 'error';
  return '';
}

function renderSkeletonCards() {
  const grid = document.getElementById('propGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 4; i += 1) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    grid.appendChild(skeleton);
  }
}

function renderProps() {
  const grid = document.getElementById('propGrid');
  grid.innerHTML = '';

  if (!state.props.length) {
    grid.innerHTML = '<p>No props yet. Import a CSV or create a project search.</p>';
    return;
  }

  for (const prop of state.props) {
    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;

    const badgeClass = getStatusClass(prop.status);
    card.innerHTML = `
      <header class="card-header">
        <h3>${prop.prop_name}</h3>
        <span class="badge ${badgeClass}">${prop.status || 'new'}</span>
      </header>
      <p>${prop.description || 'No description provided yet.'}</p>
      <div class="chips">
        <span class="chip">Priority: ${prop.priority || 'n/a'}</span>
        <span class="chip">Qty: ${prop.quantity || 1}</span>
        <span class="chip">Scene: ${prop.scene_or_reference || 'n/a'}</span>
      </div>
    `;

    const options = document.createElement('div');
    options.className = 'options';

    for (const opt of prop.options || []) {
      const tile = document.createElement('article');
      tile.className = 'option';
      tile.tabIndex = 0;
      tile.role = 'button';
      tile.setAttribute('aria-label', `Select option for ${prop.prop_name}`);
      tile.innerHTML = `
        <img src="${opt.image_url || 'https://via.placeholder.com/120?text=No+Image'}" alt="${prop.prop_name} option" />
        <strong>£${opt.price_amount ?? '?'}</strong>
        <small>${opt.delivery_message || 'No delivery info'}</small>
        <a href="${opt.url}" target="_blank" rel="noopener noreferrer">Open listing</a>
      `;

      if (prop.selected_option_id === opt.id) tile.classList.add('selected');
      if (state.selectingOptionFor === `${prop.id}:${opt.id}`) tile.classList.add('is-loading');

      const selectOption = async () => {
        const searchError = document.getElementById('searchError');
        searchError.hidden = true;
        state.selectingOptionFor = `${prop.id}:${opt.id}`;
        renderProps();
        try {
          await api(`/api/projects/${state.projectId}/props/${prop.id}/select-option`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optionId: opt.id }),
          });
          await refreshPurchasing();
          await refreshProps();
        } catch (err) {
          searchError.hidden = false;
          searchError.textContent = `Couldn't select option: ${err.message}`;
        } finally {
          state.selectingOptionFor = null;
          renderProps();
        }
      };

      tile.onclick = selectOption;
      tile.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectOption();
        }
      };
      options.appendChild(tile);
    }

    card.appendChild(options);

    const actions = document.createElement('div');
    actions.className = 'actions-row';
    const open = document.createElement('button');
    open.className = 'btn';
    open.textContent = 'Details';
    open.onclick = () => openDialog(prop);
    actions.appendChild(open);
    card.appendChild(actions);
    grid.appendChild(card);
  }
}

async function boot() {
  const cfg = await api('/api/config');
  document.getElementById('providerLabel').textContent = `Provider: ${cfg.provider} (${cfg.amazonDomain})`;
}

async function refreshProps() {
  if (!state.projectId) return;

  state.loadingProps = true;
  renderSkeletonCards();
  try {
    state.props = await api(`/api/projects/${state.projectId}/props`);
    renderProps();
  } catch (err) {
    const grid = document.getElementById('propGrid');
    grid.innerHTML = `<p class="error-message">Unable to load props: ${err.message}</p>`;
  } finally {
    state.loadingProps = false;
  }
  await refreshPurchasing();
}

function openDialog(prop) {
  state.activeProp = prop;
  document.getElementById('dialogTitle').textContent = prop.prop_name;
  document.getElementById('dialogMeta').textContent = `${prop.priority || 'n/a'} • Qty ${prop.quantity || 1} • ${prop.scene_or_reference || ''}`;
  document.getElementById('queryOverride').value = prop.search_query_override || '';
  document.getElementById('propNotes').value = prop.notes || '';
  document.getElementById('dialogError').hidden = true;
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
  const project = await api('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  state.projectId = project.id;
  document.getElementById('workspace').hidden = false;
  await refreshProps();
};

document.getElementById('importCsvBtn').onclick = async () => {
  const file = document.getElementById('csvFile').files[0];
  if (!file || !state.projectId) return;
  const fd = new FormData();
  fd.append('file', file);
  await api(`/api/projects/${state.projectId}/props/import-csv`, { method: 'POST', body: fd });
  await refreshProps();
};

document.getElementById('searchAllBtn').onclick = async () => {
  const progress = document.getElementById('progress');
  const searchError = document.getElementById('searchError');
  searchError.hidden = true;
  progress.textContent = 'Searching all props…';

  try {
    const out = await api(`/api/projects/${state.projectId}/search-all`, { method: 'POST' });
    progress.textContent = `Finished ${out.total} props`;
    await refreshProps();
  } catch (err) {
    progress.textContent = '';
    searchError.hidden = false;
    searchError.textContent = `Search failed: ${err.message}`;
  }
};

document.getElementById('rerunBtn').onclick = async (e) => {
  e.preventDefault();
  const dialogError = document.getElementById('dialogError');
  dialogError.hidden = true;
  const prop = state.activeProp;

  try {
    await api(`/api/projects/${state.projectId}/props/${prop.id}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchQueryOverride: document.getElementById('queryOverride').value,
        notes: document.getElementById('propNotes').value,
      }),
    });
    document.getElementById('propDialog').close();
    await refreshProps();
  } catch (err) {
    dialogError.hidden = false;
    dialogError.textContent = `Unable to re-run search: ${err.message}`;
  }
};

document.getElementById('copyPurchaseBtn').onclick = async () => {
  await navigator.clipboard.writeText(document.getElementById('purchaseText').textContent);
};

boot();
