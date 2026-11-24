/* BinCard Pro - To-Do module (add-on).
   Loaded from index.html after the main script. It adds the To-Do sidebar menu,
   the To-Do page, and the Pending / Overdue / Done today cards on the dashboard. */
(function () {
  'use strict';
  if (typeof db === 'undefined' || typeof go !== 'function' || typeof render !== 'function') return;

  /* ---------- styles ---------- */
  const st = document.createElement('style');
  st.textContent = '.td-list{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}'
    + '.td-card{display:flex;flex-direction:column}.td-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}'
    + '.td-title{font-size:16px;line-height:1.3}.td-meta{color:var(--mut);font-size:13px;margin:6px 0;line-height:1.55}'
    + '.td-det{margin:6px 0 2px;white-space:pre-wrap;font-size:14.5px}.td-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}'
    + '.td-acts .btn{padding:8px 14px;font-size:14px}.td-over{color:var(--err);font-weight:700}'
    + '.td-done{background:#eef7f1;border-radius:12px;padding:8px 12px;margin-top:8px;font-size:13.5px}'
    + '.td-ev{border-left:3px solid var(--line);padding:2px 0 2px 12px;margin:0 0 14px}.td-ev small{color:var(--mut)}'
    + '.td-ev img{display:block;max-width:100%;max-height:280px;border-radius:12px;margin-top:8px;background:#eef2ee}'
    + '.d-k[data-tdgo]{cursor:pointer}';
  document.head.appendChild(st);

  /* ---------- helpers ---------- */
  let tFilter = 'pending';
  const todayStr = () => ymd(new Date());
  const dueLbl = d => d ? fmtD(d + 'T12:00:00+06:00') : '';
  const isOver = t => t.status === 'pending' && t.due_date && t.due_date < todayStr();
  const EV_LBL = { created: 'Created', edited: 'Edited', completed: 'Completed', reopened: 'Reopened', cancelled: 'Cancelled' };

  async function todoBadge() {
    try {
      const { data } = await db.rpc('todo_counts');
      const b = document.getElementById('tabTodo');
      if (b) b.dataset.n = data && Number(data.pending) > 0 ? String(data.pending) : '';
    } catch (e) { /* badge is optional */ }
  }

  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const attempt = (side, q) => {
          const s = Math.min(1, side / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(b => {
            if (!b) return rej(new Error('Could not process the photo.'));
            if (b.size > 200 * 1024 && q > 0.5) return attempt(side * 0.8, q - 0.1);
            res(b);
          }, 'image/jpeg', q);
        };
        attempt(1280, 0.7);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read the photo.')); };
      img.src = url;
    });
  }

  function infoDlg(title, html) {
    const d = document.createElement('dialog');
    d.innerHTML = '<h3>' + esc(title) + '</h3><div>' + html + '</div><div class="row"><button type="button" class="btn light" data-x>Close</button></div>';
    document.body.appendChild(d);
    d.querySelector('[data-x]').onclick = () => d.close();
    d.onclose = () => d.remove();
    d.showModal();
    return d;
  }

  /* ---------- dialogs ---------- */
  async function taskDialog(t) {
    const [w, p] = await Promise.all([
      db.from('warehouses').select('id,name,is_active').order('name'),
      db.rpc('todo_people')
    ]);
    const whs = (w.data || []).filter(x => x.is_active || (t && x.id === t.warehouse_id));
    const people = p.data || [];
    const body = '<label>Task title</label><input type="text" data-title maxlength="150" autocomplete="off">'
      + '<label>Details (optional)</label><textarea data-det rows="3" maxlength="1000"></textarea>'
      + '<div class="two"><div><label>Priority</label><select data-pr><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>'
      + '<div><label>Last date</label><input type="date" data-due></div></div>'
      + '<label>Warehouse (optional)</label><select data-wh><option value="">Any warehouse</option>' + whs.map(x => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('') + '</select>'
      + '<label>Assign to</label><select data-as><option value="">Anyone can do it</option>' + people.map(x => '<option value="' + x.id + '">' + esc(x.name) + ' (' + esc(x.role) + ')</option>').join('') + '</select>'
      + '<div class="hint">If you assign the task to one person, only that person (and you) can mark it done.</div>';
    return formDlg(t ? 'Edit task' : 'New task', body, t ? 'Save changes' : 'Create task', api => {
      if (t) {
        api.q('[data-title]').value = t.title || ''; api.q('[data-det]').value = t.details || '';
        api.q('[data-pr]').value = t.priority || 'normal'; api.q('[data-due]').value = t.due_date || '';
        api.q('[data-wh]').value = t.warehouse_id || ''; api.q('[data-as]').value = t.assigned_to || '';
      }
      api.run(async () => {
        const title = api.q('[data-title]').value.trim();
        if (!title) return 'Enter the task title.';
        const args = {
          p_title: title, p_details: api.q('[data-det]').value.trim() || null, p_priority: api.q('[data-pr]').value,
          p_due: api.q('[data-due]').value || null, p_warehouse: api.q('[data-wh]').value || null, p_assigned: api.q('[data-as]').value || null
        };
        const { error } = t ? await db.rpc('todo_update', Object.assign({ p_id: t.id }, args)) : await db.rpc('todo_create', args);
        return error ? (error.message || 'Could not save the task.') : '';
      });
    });
  }

  function completeDialog(t) {
    const body = '<div class="hint" style="margin:0 0 10px">Take a clear photo of the finished work as proof. The photo is private. Only a master or admin can see it.</div>'
      + '<label>Photo (required)</label><input type="file" accept="image/*" capture="environment" data-f>'
      + '<img data-pv alt="" style="display:none;max-width:100%;max-height:220px;border-radius:12px;margin-top:8px">'
      + '<label>Note (optional)</label><textarea data-n rows="2" maxlength="300"></textarea>';
    return formDlg('Mark done: ' + t.title, body, 'Submit as done', api => {
      const f = api.q('[data-f]'), pv = api.q('[data-pv]');
      f.onchange = () => {
        const file = f.files && f.files[0];
        if (file) { pv.src = URL.createObjectURL(file); pv.style.display = 'block'; } else pv.style.display = 'none';
      };
      api.run(async () => {
        const file = f.files && f.files[0];
        if (!file) return 'Take or choose a photo first.';
        let blob;
        try { blob = await shrink(file); } catch (e) { return e.message; }
        const path = me.id + '/' + t.id + '-' + Date.now() + '.jpg';
        const up = await db.storage.from('todo-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) return 'Could not upload the photo. Check your connection and try again.';
        const { error } = await db.rpc('todo_complete', { p_id: t.id, p_note: api.q('[data-n]').value.trim() || null, p_photo: path });
        return error ? (error.message || 'Could not save.') : '';
      });
    });
  }

  function reopenDialog(t) {
    const body = '<div class="hint" style="margin:0 0 10px"><b>' + esc(t.title) + '</b><br>The task goes back to Pending. The old completion and photo stay in the history.</div>'
      + '<label>Reason for reopening (required)</label><textarea data-n rows="3" maxlength="300" placeholder="For example: shelf is still not clean"></textarea>';
    return formDlg('Reopen task', body, 'Reopen task', api => {
      api.run(async () => {
        const n = api.q('[data-n]').value.trim();
        if (n.length < 3) return 'Enter the reason.';
        const { error } = await db.rpc('todo_reopen', { p_id: t.id, p_note: n });
        return error ? (error.message || 'Could not reopen the task.') : '';
      });
    });
  }

  async function historyDialog(t) {
    const { data, error } = await db.rpc('todo_events', { p_task: t.id });
    if (error) return toast(error.message || 'Could not load the history.');
    const list = data || [];
    const html = list.length ? list.map(ev => '<div class="td-ev"><b>' + esc(EV_LBL[ev.event] || ev.event) + '</b><br><small>' + esc(ev.by_name || '') + ' &middot; ' + esc(fmtD(ev.event_at)) + ' ' + esc(fmtT(ev.event_at)) + '</small>'
      + (ev.note ? '<div>' + esc(ev.note) + '</div>' : '')
      + (ev.photo_path ? '<img data-ph="' + esc(ev.photo_path) + '" alt="Photo proof">' : (ev.has_photo ? '<div><small>Photo submitted</small></div>' : '')) + '</div>').join('')
      : '<div class="empty">No history yet.</div>';
    const d = infoDlg(t.title, html);
    d.querySelectorAll('img[data-ph]').forEach(async img => {
      try {
        const { data: s } = await db.storage.from('todo-photos').createSignedUrl(img.dataset.ph, 900);
        if (s && s.signedUrl) img.src = s.signedUrl; else img.alt = 'Photo not available';
      } catch (e) { img.alt = 'Photo not available'; }
    });
  }

  /* ---------- page ---------- */
  async function renderTodo(el) {
    const { data, error } = await db.rpc('todo_list');
    if (error) throw error;
    const all = data || [];
    const admin = isAdmin();
    const cnt = { pending: 0, done: 0, cancelled: 0 };
    all.forEach(t => { cnt[t.status] = (cnt[t.status] || 0) + 1; });
    const over = all.filter(isOver).length;
    if (!admin && tFilter === 'cancelled') tFilter = 'pending';
    const rank = t => (isOver(t) ? 0 : 1) * 2 + (t.priority === 'urgent' ? 0 : 1);
    const list = all.filter(t => t.status === tFilter).sort((a, b) => {
      if (tFilter === 'pending') {
        const r = rank(a) - rank(b); if (r) return r;
        const da = a.due_date || '9999-12-31', db2 = b.due_date || '9999-12-31';
        if (da !== db2) return da < db2 ? -1 : 1;
        return String(b.created_at).localeCompare(String(a.created_at));
      }
      return String(b.completed_at || b.created_at).localeCompare(String(a.completed_at || a.created_at));
    });
    const segs = [['pending', 'Pending'], ['done', 'Done']].concat(admin ? [['cancelled', 'Cancelled']] : []);
    const card = t => {
      const urgent = t.priority === 'urgent', ov = isOver(t);
      const meta = [t.due_date ? '<span class="' + (ov ? 'td-over' : '') + '">' + (ov ? 'Overdue: ' : 'Last date: ') + esc(dueLbl(t.due_date)) + '</span>' : '',
        t.warehouse_name ? esc(t.warehouse_name) : '',
        'For: ' + esc(t.assigned_name || 'Anyone'),
        admin && t.created_name ? 'Added by ' + esc(t.created_name) : ''].filter(Boolean).join(' &middot; ');
      let acts = '';
      if (t.status === 'pending') {
        acts += '<button class="btn" data-act="done" data-id="' + t.id + '">Mark done</button>';
        if (admin) acts += '<button class="btn light" data-act="edit" data-id="' + t.id + '">Edit</button><button class="btn ghost" data-act="cancel" data-id="' + t.id + '" style="color:var(--err)">Cancel task</button>';
      } else if (t.status === 'done' && admin) {
        acts += '<button class="btn light" data-act="reopen" data-id="' + t.id + '">Reopen</button>';
      }
      acts += '<button class="btn ghost" data-act="hist" data-id="' + t.id + '" style="color:var(--pri)">History' + (admin && t.has_photo ? ' and photo' : '') + '</button>';
      return '<div class="d-panel td-card"><div class="td-top"><b class="td-title">' + esc(t.title) + '</b>' + (urgent ? '<span class="d-tag bad">Urgent</span>' : '') + '</div>'
        + '<div class="td-meta">' + (meta || 'No last date') + '</div>'
        + (t.details ? '<div class="td-det">' + esc(t.details) + '</div>' : '')
        + (t.status === 'done' ? '<div class="td-done"><b>Done by ' + esc(t.completed_name || '') + '</b> &middot; ' + esc(fmtD(t.completed_at)) + ' ' + esc(fmtT(t.completed_at)) + (t.completion_note ? '<br>' + esc(t.completion_note) : '') + '</div>' : '')
        + (t.reopened_count > 0 ? '<div class="td-meta">Reopened ' + t.reopened_count + ' time(s)</div>' : '')
        + '<div class="td-acts">' + acts + '</div></div>';
    };
    el.innerHTML = '<div id="tdRoot"><div class="d-eye">UOLL &middot; Tasks</div><h2 class="d-hi">To-Do</h2>'
      + '<p class="d-subt">' + (admin ? 'Give work to your team and check the photo proof when it is done.' : 'Your pending work. Finish a task, then take a photo as proof.') + '</p>'
      + '<div class="d-act"><span class="d-seg">' + segs.map(s => '<button data-f="' + s[0] + '" class="' + (tFilter === s[0] ? 'on' : '') + '">' + s[1] + ' (' + (cnt[s[0]] || 0) + ')</button>').join('') + '</span>'
      + (admin ? '<button class="btn" id="tdNew">New task</button>' : '') + '</div>'
      + (over ? '<div class="sumc" style="border-left-color:var(--err);margin-bottom:12px"><b>' + over + ' overdue task(s)</b><span>Past the last date</span></div>' : '')
      + (list.length ? '<div class="td-list">' + list.map(card).join('') + '</div>' : '<div class="empty">' + (tFilter === 'pending' ? 'No pending tasks. Everything is done.' : 'Nothing to show here.') + '</div>') + '</div>';
    const root = document.getElementById('tdRoot');
    root.onclick = async e => {
      const f = e.target.closest('[data-f]');
      if (f) { tFilter = f.dataset.f; return render(); }
      if (e.target.closest('#tdNew')) { if (await taskDialog(null)) { toast('Task created.'); render(); } return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const t = all.find(x => x.id === b.dataset.id); if (!t) return;
      const a = b.dataset.act;
      if (a === 'done') { if (await completeDialog(t)) { toast('Task marked done.'); render(); } }
      else if (a === 'edit') { if (await taskDialog(t)) { toast('Task updated.'); render(); } }
      else if (a === 'reopen') { if (await reopenDialog(t)) { toast('Task reopened.'); render(); } }
      else if (a === 'hist') historyDialog(t);
      else if (a === 'cancel') {
        if (!confirm('Cancel the task "' + t.title + '"?')) return;
        const { error: er } = await db.rpc('todo_cancel', { p_id: t.id });
        if (er) toast(er.message || 'Could not cancel the task.'); else { toast('Task cancelled.'); render(); }
      }
    };
  }

  /* ---------- hook into the existing app ---------- */
  if (Array.isArray(ROOTS) && !ROOTS.includes('todo')) ROOTS.push('todo');

  const _viewTitle = viewTitle;
  viewTitle = function (v) { return v && v.t === 'todo' ? 'To-Do' : _viewTitle(v); };

  const _go = go;
  go = function (v, isBack) {
    _go(v, isBack);
    document.querySelectorAll('.tabs > button').forEach(b => {
      if (b.dataset.tab === 'todo') b.classList.toggle('on', v.t === 'todo');
      else if (v.t === 'todo') b.classList.remove('on');
    });
  };

  const _render = render;
  render = async function () {
    if (view.t === 'todo') {
      const el = $('#view');
      el.style.maxWidth = '';
      el.innerHTML = '<div class="spin" role="status" aria-label="Loading"></div>';
      try { await renderTodo(el); }
      catch (err) { el.innerHTML = '<div class="empty">Could not load the tasks. Run the To-Do SQL in Supabase first, then try again.</div>'; }
    } else {
      await _render();
    }
    todoBadge();
  };

  const _dash = renderDashboard;
  renderDashboard = async function (el) {
    await _dash(el);
    try {
      const { data } = await db.rpc('todo_counts');
      const grid = el.querySelector('.d-grid');
      if (!data || !grid) return;
      const c = (label, ic, val, cap, cls, go2) => kcard(label, ic, val, cap, { cls: cls, attr: 'data-tdgo="' + go2 + '"' });
      grid.insertAdjacentHTML('beforeend',
        c('Pending tasks', 'list', n0(data.pending), 'Waiting to be done', Number(data.pending) ? 'warn' : '', 'pending')
        + c('Overdue tasks', 'alert', n0(data.overdue), 'Past the last date', Number(data.overdue) ? 'bad' : '', 'pending')
        + c('Done today', 'check', n0(data.done_today), 'Tasks completed today', '', 'done'));
      grid.querySelectorAll('[data-tdgo]').forEach(b => b.onclick = () => { tFilter = b.dataset.tdgo; go({ t: 'todo' }); });
    } catch (e) { /* dashboard still works without the To-Do cards */ }
  };

  const nav = document.querySelector('.tabs');
  const after = nav && nav.querySelector('button[data-tab="dash"]');
  if (nav && after && !document.getElementById('tabTodo')) {
    const b = document.createElement('button');
    b.dataset.tab = 'todo'; b.id = 'tabTodo';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9l2 2 3-3M8 16h8"/></svg><span class="lb">To-Do</span>';
    b.onclick = () => go({ t: 'todo' });
    after.after(b);
  }
})();
