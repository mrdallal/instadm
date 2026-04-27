/* ── Helpers ──────────────────────────────────────────────────────────────── */

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Tab navigation ──────────────────────────────────────────────────────── */

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('tab-' + item.dataset.tab).classList.add('active');
    if (item.dataset.tab === 'settings') loadSettings();
  });
});

/* ── Stats ───────────────────────────────────────────────────────────────── */

async function loadStats() {
  try {
    const s = await api('GET', '/api/stats');
    document.getElementById('statTotal').textContent = s.total_campaigns;
    document.getElementById('statActive').textContent = s.active_campaigns;
    document.getElementById('statProcessed').textContent = s.processed_comments;
  } catch { /* sidebar stats are non-critical */ }
}

/* ── Settings ────────────────────────────────────────────────────────────── */

async function loadSettings() {
  try {
    const cfg = await api('GET', '/api/config');
    document.getElementById('accessToken').value = cfg.access_token || '';
    document.getElementById('pageId').value = cfg.page_id || '';
    document.getElementById('igAccountId').value = cfg.instagram_account_id || '';
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btnSaveSettings');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await api('POST', '/api/config', {
      access_token: document.getElementById('accessToken').value.trim(),
      page_id: document.getElementById('pageId').value.trim(),
      instagram_account_id: document.getElementById('igAccountId').value.trim(),
    });
    document.getElementById('settingsSaved').style.display = 'inline';
    setTimeout(() => document.getElementById('settingsSaved').style.display = 'none', 3000);
    toast('Settings saved');
  } catch (e) { toast(e.message, 'error'); } finally {
    btn.disabled = false;
    btn.textContent = 'Save Settings';
  }
});

/* ── Campaigns list ──────────────────────────────────────────────────────── */

async function loadCampaigns() {
  const grid = document.getElementById('campaignList');
  const empty = document.getElementById('emptyCampaigns');
  grid.innerHTML = '<div style="color:var(--text-secondary);font-size:.85rem;padding:.5rem 0;">Loading…</div>';
  try {
    const list = await api('GET', '/api/campaigns');
    grid.innerHTML = '';
    if (!list.length) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    list.forEach(c => grid.appendChild(buildCampaignCard(c)));
  } catch (e) {
    grid.innerHTML = '';
    toast(e.message, 'error');
  }
}

function buildCampaignCard(c) {
  const keywords = c.keywords.split(',').map(k => k.trim()).filter(Boolean);
  const div = document.createElement('div');
  div.className = 'campaign-card' + (c.active ? '' : ' inactive');
  div.dataset.id = c.id;

  const thumb = c.post_preview_url
    ? `<img class="campaign-post-thumb" src="${escHtml(c.post_preview_url)}" alt="" />`
    : `<div class="campaign-post-thumb-placeholder">IMG</div>`;

  div.innerHTML = `
    <div class="campaign-card-header">
      <span class="campaign-card-name">${escHtml(c.name)}</span>
      <span class="badge ${c.active ? 'badge-active' : 'badge-inactive'}">${c.active ? 'Active' : 'Paused'}</span>
    </div>
    <div class="campaign-post-row">
      ${thumb}
      <div>
        <div style="font-size:.72rem;color:var(--muted);margin-bottom:.15rem;">Post ID</div>
        <div class="campaign-post-id">${escHtml(c.post_id)}</div>
      </div>
    </div>
    <div class="keywords-wrap">
      ${keywords.map(k => `<span class="kw-pill">${escHtml(k)}</span>`).join('')}
    </div>
    <div class="campaign-messages">
      <div class="msg-row">
        <span class="msg-icon" title="Comment reply">💬</span>
        <span class="msg-text">${escHtml(c.comment_reply)}</span>
      </div>
      <div class="msg-row">
        <span class="msg-icon" title="DM">✉️</span>
        <span class="msg-text">${escHtml(c.dm_message)}</span>
      </div>
    </div>
    <div class="campaign-card-footer">
      <button class="btn-icon" data-action="toggle" title="${c.active ? 'Pause' : 'Activate'}">
        ${c.active ? '⏸ Pause' : '▶ Activate'}
      </button>
      <button class="btn-icon" data-action="edit" title="Edit">✏️ Edit</button>
      <button class="btn-icon danger" data-action="delete" title="Delete">🗑</button>
    </div>`;

  div.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleCampaign(c.id));
  div.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(c));
  div.querySelector('[data-action="delete"]').addEventListener('click', () => openDeleteModal(c.id));

  return div;
}

async function toggleCampaign(id) {
  try {
    await api('PATCH', `/api/campaigns/${id}/toggle`);
    await loadCampaigns();
    await loadStats();
    toast('Campaign updated');
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Campaign modal ──────────────────────────────────────────────────────── */

const campaignModal = document.getElementById('campaignModal');

function openNewModal() {
  document.getElementById('modalTitle').textContent = 'New Campaign';
  document.getElementById('campaignForm').reset();
  document.getElementById('campaignId').value = '';
  document.getElementById('postPreview').style.display = 'none';
  document.getElementById('campaignActive').checked = true;
  campaignModal.style.display = 'flex';
}

function openEditModal(c) {
  document.getElementById('modalTitle').textContent = 'Edit Campaign';
  document.getElementById('campaignId').value = c.id;
  document.getElementById('campaignName').value = c.name;
  document.getElementById('postId').value = c.post_id;
  document.getElementById('keywords').value = c.keywords;
  document.getElementById('commentReply').value = c.comment_reply;
  document.getElementById('dmMessage').value = c.dm_message;
  document.getElementById('campaignActive').checked = c.active;

  const preview = document.getElementById('postPreview');
  if (c.post_preview_url) {
    document.getElementById('postThumb').src = c.post_preview_url;
    document.getElementById('postCaption').textContent = c.post_caption || '';
    preview.style.display = 'flex';
  } else {
    preview.style.display = 'none';
  }

  campaignModal.style.display = 'flex';
}

function closeModal() {
  campaignModal.style.display = 'none';
}

document.getElementById('btnNewCampaign').addEventListener('click', openNewModal);
document.getElementById('btnCloseModal').addEventListener('click', closeModal);
document.getElementById('btnCancelCampaign').addEventListener('click', closeModal);
campaignModal.addEventListener('click', e => { if (e.target === campaignModal) closeModal(); });

/* Post preview fetch */
document.getElementById('btnFetchPost').addEventListener('click', async () => {
  const postId = document.getElementById('postId').value.trim();
  if (!postId) return toast('Enter a Post ID first', 'error');
  const btn = document.getElementById('btnFetchPost');
  btn.textContent = '…';
  btn.disabled = true;
  try {
    const data = await api('GET', `/api/post-preview/${postId}`);
    const preview = document.getElementById('postPreview');
    if (data.preview_url) {
      document.getElementById('postThumb').src = data.preview_url;
    } else {
      document.getElementById('postThumb').src = '';
    }
    document.getElementById('postCaption').textContent = data.caption || '(no caption)';
    preview.style.display = 'flex';
    toast('Post loaded');
  } catch (e) { toast(e.message, 'error'); } finally {
    btn.textContent = 'Preview';
    btn.disabled = false;
  }
});

/* Campaign form submit */
document.getElementById('campaignForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('campaignId').value;
  const payload = {
    name: document.getElementById('campaignName').value.trim(),
    post_id: document.getElementById('postId').value.trim(),
    keywords: document.getElementById('keywords').value.trim(),
    comment_reply: document.getElementById('commentReply').value.trim(),
    dm_message: document.getElementById('dmMessage').value.trim(),
    active: document.getElementById('campaignActive').checked,
  };
  const btn = document.getElementById('btnSaveCampaign');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    if (id) {
      await api('PUT', `/api/campaigns/${id}`, payload);
      toast('Campaign updated');
    } else {
      await api('POST', '/api/campaigns', payload);
      toast('Campaign created');
    }
    closeModal();
    await loadCampaigns();
    await loadStats();
  } catch (e) { toast(e.message, 'error'); } finally {
    btn.disabled = false;
    btn.textContent = 'Save Campaign';
  }
});

/* ── Delete modal ────────────────────────────────────────────────────────── */

const deleteModal = document.getElementById('deleteModal');
let _pendingDeleteId = null;

function openDeleteModal(id) {
  _pendingDeleteId = id;
  deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
  _pendingDeleteId = null;
  deleteModal.style.display = 'none';
}

document.getElementById('btnCloseDelete').addEventListener('click', closeDeleteModal);
document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });

document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  if (!_pendingDeleteId) return;
  try {
    await api('DELETE', `/api/campaigns/${_pendingDeleteId}`);
    toast('Campaign deleted');
    closeDeleteModal();
    await loadCampaigns();
    await loadStats();
  } catch (e) { toast(e.message, 'error'); }
});

/* ── Init ────────────────────────────────────────────────────────────────── */
loadCampaigns();
loadStats();
