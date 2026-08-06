// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 JD Santos
// @ts-nocheck: build-time placeholders are replaced before this script runs.

const STORAGE_KEY = __STORAGE_KEY__;
const THEME_KEY = `${STORAGE_KEY}:theme`;
const DOWNLOAD_NAME = __DOWNLOAD_NAME__;
const CONSOLE_TITLE = __CONSOLE_TITLE__;
const REVIEW_META = __REVIEW_META__;
const ACTION_SPECS = __ACTION_SPECS__;
const ARTIFACT_IDENTITY = __ARTIFACT_IDENTITY__;
const RISK_ORDER = { high: 3, medium: 2, low: 1, none: 0 };
const cardIndex = new Map(
  [...document.querySelectorAll('.card')].map(card => [card.dataset.id, card]),
);
const documentBlockIndex = new Map(
  [...document.querySelectorAll('.document-block[data-id]')]
    .map(block => [block.dataset.id, block]),
);
let storageAvailable = false;
let storageCompatibilityMessage = '';
let activeMobileCard = null;
let mobileTrayOpen = false;
let mobileRaf = 0;

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function actionSpec(queue, actionId) {
  return ACTION_SPECS[`${queue}.${actionId}`]
    || ACTION_SPECS[`_global.${actionId}`]
    || {};
}

function normalizeNotes(entry) {
  const notes = entry?.notes || {};
  return {
    item: String(notes.item ?? entry?.note ?? ''),
    actions: { ...(notes.actions || {}) },
    sections: { ...(notes.sections || {}) },
  };
}

function normalizeDecision(entry) {
  if (!entry || typeof entry !== 'object') return null;
  let actions = [];
  if (Array.isArray(entry.actions)) {
    actions = entry.actions
      .map(action => typeof action === 'string'
        ? { id: action, label: action }
        : { id: action?.id, label: action?.label || action?.id })
      .filter(action => action.id);
  } else if (entry.action) {
    actions = [{ id: entry.action, label: entry.label || entry.action }];
  }
  return { ...entry, actions, notes: normalizeNotes(entry) };
}

function currentDecision(id, value) {
  const entry = normalizeDecision(value);
  if (!entry) return null;
  const card = cardIndex.get(id);
  if (card) {
    const controls = new Map(
      controlsForCard(card).map(control => [control.dataset.action, control]),
    );
    const actions = entry.actions
      .filter(action => controls.has(action.id))
      .map(action => ({
        id: action.id,
        label: controls.get(action.id).dataset.label || action.id,
      }));
    return {
      ...entry,
      id,
      queue: card.dataset.queue,
      actions,
      action: actions.length === 1 ? actions[0].id : null,
      label: actions.length === 1 ? actions[0].label : null,
    };
  }
  const block = documentBlockIndex.get(id);
  if (!block) return null;
  return {
    ...entry,
    id,
    queue: block.dataset.queue,
    actions: [],
    action: null,
    label: null,
  };
}

function loadDecisions() {
  try {
    const probe = '__review_console_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageAvailable = true;
  } catch (_) {
    storageAvailable = false;
    return {};
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (_) {
    storageCompatibilityMessage = 'Unreadable saved decisions were ignored.';
    return {};
  }
  if (stored?.schema_version !== ARTIFACT_IDENTITY.schema_version
      || stored?.artifact_fingerprint !== ARTIFACT_IDENTITY.artifact_fingerprint
      || !stored?.decisions
      || typeof stored.decisions !== 'object'
      || Array.isArray(stored.decisions)) {
    storageCompatibilityMessage =
      'Saved decisions belonged to an older or different review and were ignored.';
    return {};
  }
  return Object.fromEntries(
    Object.entries(stored.decisions)
      .map(([id, entry]) => [id, currentDecision(id, entry)])
      .filter(([, entry]) => entry),
  );
}

let decisions = loadDecisions();
const totalCards = document.querySelectorAll('.card').length;

function updateStorageStatus() {
  const el = document.getElementById('storageStatus');
  const notice = document.getElementById('stateNotice');
  if (storageCompatibilityMessage) {
    el.textContent = 'Incompatible saved state ignored';
    notice.textContent = storageCompatibilityMessage;
    notice.hidden = false;
  } else {
    el.textContent = storageAvailable
      ? 'Saved in this browser'
      : 'Session only; download before closing';
    notice.hidden = true;
  }
  el.classList.toggle(
    'storage-warning',
    !storageAvailable || Boolean(storageCompatibilityMessage),
  );
}

function persist() {
  if (storageAvailable) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schema_version: ARTIFACT_IDENTITY.schema_version,
        artifact_fingerprint: ARTIFACT_IDENTITY.artifact_fingerprint,
        decisions,
      }));
      storageCompatibilityMessage = '';
    } catch (_) {
      storageAvailable = false;
    }
    updateStorageStatus();
  }
  updateProgress();
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.reviewToastTimer);
  window.reviewToastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function decisionColumn(card) {
  return document.querySelector(
    `.decision-column[data-owner-key="${CSS.escape(card.dataset.ownerKey)}"]`,
  );
}

function controlsForCard(card) {
  return [...(decisionColumn(card)?.querySelectorAll('.action-input') || [])];
}

function textareasForCard(card) {
  return [
    ...card.querySelectorAll('textarea[data-note-target]'),
    ...(decisionColumn(card)?.querySelectorAll('textarea[data-note-target]') || []),
  ];
}

function cardForControl(control) {
  const direct = control.closest('.card');
  if (direct) return direct;
  const owner = control.closest('.decision-column')?.dataset.ownerId;
  return owner ? cardIndex.get(owner) : null;
}

function cardRaw(card) {
  const raw = card.querySelector('.raw-item');
  return raw ? JSON.parse(raw.textContent) : null;
}

function selectedActions(card) {
  return controlsForCard(card)
    .filter(input => input.checked)
    .map(input => ({
      id: input.dataset.action,
      label: input.dataset.label || input.dataset.action,
    }));
}

function readNotes(card) {
  const notes = { item: '', actions: {}, sections: {} };
  textareasForCard(card).forEach(textarea => {
    const target = textarea.dataset.noteTarget || 'item';
    const value = textarea.value;
    if (target === 'item') notes.item = value;
    else if (target.startsWith('action:')) {
      notes.actions[target.slice(7)] = value;
    } else if (target.startsWith('section:')) {
      notes.sections[target.slice(8)] = value;
    }
  });
  return notes;
}

function hasNotes(notes) {
  return Boolean(
    notes.item.trim()
    || Object.values(notes.actions).some(value => String(value).trim())
    || Object.values(notes.sections).some(value => String(value).trim()),
  );
}

function selectedIds(entry) {
  return (entry?.actions || []).map(action => action.id);
}

function conflictPairs(entry) {
  const ids = new Set(selectedIds(entry));
  const pairs = new Set();
  for (const id of ids) {
    const spec = actionSpec(entry.queue, id);
    for (const other of spec.conflicts_with || []) {
      if (ids.has(other)) pairs.add([id, other].sort().join('|'));
    }
  }
  return [...pairs];
}

function updateAnnotationCounts(card, notes) {
  const column = decisionColumn(card);
  const scopes = [card, column].filter(Boolean);
  scopes.forEach(scope => {
    scope.querySelectorAll('[data-count-target]').forEach(el => {
      const target = el.dataset.countTarget;
      let value = '';
      if (target === 'item') value = notes.item;
      else if (target.startsWith('action:')) value = notes.actions[target.slice(7)] || '';
      else if (target.startsWith('section:')) value = notes.sections[target.slice(8)] || '';
      el.textContent = String(value).trim() ? '1' : '';
    });
  });
}

function applyDecisionState(card, entry) {
  const actions = entry?.actions || [];
  const notes = entry?.notes || { item: '', actions: {}, sections: {} };
  const conflicts = entry ? conflictPairs(entry) : [];
  card.classList.toggle('done', actions.length > 0);
  card.classList.toggle('has-conflict', conflicts.length > 0);
  const state = card.querySelector('.decision-state');
  if (conflicts.length) state.textContent = 'Resolve conflicting actions';
  else if (actions.length === 1) state.textContent = actions[0].label;
  else if (actions.length > 1) state.textContent = `${actions.length} actions selected`;
  else state.textContent = 'Unresolved';

  const ids = new Set(actions.map(action => action.id));
  controlsForCard(card).forEach(input => {
    input.checked = ids.has(input.dataset.action);
    input.closest('.action-option')?.classList.toggle('selected', input.checked);
  });

  const conflict = decisionColumn(card)?.querySelector('.card-conflict');
  if (conflict) {
    conflict.hidden = conflicts.length === 0;
    conflict.textContent = conflicts.length
      ? 'These choices conflict. Remove one before export.'
      : '';
  }
  updateAnnotationCounts(card, notes);
  updateMobileTray(card);
}

function fillExistingNotes(card, notes) {
  textareasForCard(card).forEach(textarea => {
    const target = textarea.dataset.noteTarget || 'item';
    if (target === 'item') textarea.value = notes.item || '';
    else if (target.startsWith('action:')) {
      textarea.value = notes.actions[target.slice(7)] || '';
    } else if (target.startsWith('section:')) {
      textarea.value = notes.sections[target.slice(8)] || '';
    }
  });
}

function applyExisting() {
  cardIndex.forEach(card => {
    const entry = decisions[card.dataset.id];
    if (!entry) return;
    fillExistingNotes(card, entry.notes);
    applyDecisionState(card, entry);
  });
}

function documentBlockRaw(block) {
  const raw = block.querySelector('.block-raw');
  return raw ? JSON.parse(raw.textContent) : null;
}

function updateDocumentAnnotationState(block, value) {
  const count = block.querySelector('[data-document-count]');
  if (count) count.textContent = String(value || '').trim() ? '1' : '';
}

function applyExistingDocumentAnnotations() {
  documentBlockIndex.forEach(block => {
    const entry = decisions[block.dataset.id];
    const value = entry?.notes?.item || entry?.note || '';
    const textarea = block.querySelector('textarea[data-document-note]');
    if (textarea) textarea.value = value;
    updateDocumentAnnotationState(block, value);
  });
}

function syncDocumentAnnotation(block) {
  const id = block.dataset.id;
  const textarea = block.querySelector('textarea[data-document-note]');
  const value = textarea?.value || '';
  if (!value.trim()) {
    delete decisions[id];
    updateDocumentAnnotationState(block, '');
    persist();
    return;
  }
  const now = new Date().toISOString();
  decisions[id] = {
    id,
    queue: block.dataset.queue,
    actions: [],
    action: null,
    label: null,
    note: value,
    notes: { item: value, actions: {}, sections: {} },
    item: documentBlockRaw(block),
    decided_at: null,
    updated_at: now,
  };
  updateDocumentAnnotationState(block, value);
  persist();
}

function syncDecision(card) {
  const id = card.dataset.id;
  const previous = decisions[id] || {};
  const actions = selectedActions(card);
  const notes = readNotes(card);
  if (!actions.length && !hasNotes(notes)) {
    delete decisions[id];
    applyDecisionState(card, null);
    persist();
    return;
  }
  const now = new Date().toISOString();
  decisions[id] = {
    ...previous,
    id,
    queue: card.dataset.queue,
    actions,
    action: actions.length === 1 ? actions[0].id : null,
    label: actions.length === 1 ? actions[0].label : null,
    note: notes.item,
    notes,
    item: cardRaw(card),
    decided_at: previous.decided_at || (actions.length ? now : null),
    updated_at: now,
  };
  applyDecisionState(card, decisions[id]);
  persist();
}

function handleActionChange(input) {
  const card = cardForControl(input);
  if (!card) return;
  const controls = controlsForCard(card);
  if (input.checked) {
    const single = card.dataset.selectionMode === 'single';
    const exclusive = input.dataset.exclusive === 'true';
    if (single || exclusive) {
      controls.forEach(other => { if (other !== input) other.checked = false; });
    } else {
      controls.forEach(other => {
        if (other !== input && other.dataset.exclusive === 'true') other.checked = false;
      });
    }
  }
  syncDecision(card);
  applyFilters();
}

document.querySelectorAll('.action-input').forEach(input => {
  input.addEventListener('change', () => handleActionChange(input));
});

document.querySelectorAll('textarea[data-note-target]').forEach(textarea => {
  textarea.addEventListener('input', () => {
    const card = cardForControl(textarea);
    if (card) syncDecision(card);
  });
});

document.querySelectorAll('textarea[data-document-note]').forEach(textarea => {
  textarea.addEventListener('input', () => {
    const block = textarea.closest('.document-block');
    if (block) syncDocumentAnnotation(block);
  });
});

document.querySelectorAll('.annotation-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) panel.querySelector('textarea')?.focus();
  });
});

function actionNote(entry, actionId) {
  return entry.notes?.actions?.[actionId] || entry.notes?.item || '';
}

function reviewSummary() {
  const entries = Object.values(decisions);
  const decided = entries.filter(entry => selectedIds(entry).length > 0).length;
  const undecided = Math.max(0, totalCards - decided);
  const byAction = {};
  let highRisk = 0;
  let irreversible = 0;
  let missingRequiredNotes = 0;
  let conflicts = 0;
  let annotationCount = 0;

  entries.forEach(entry => {
    if (hasNotes(entry.notes || normalizeNotes(entry))) annotationCount += 1;
    if (conflictPairs(entry).length) conflicts += 1;
    for (const action of entry.actions || []) {
      const spec = actionSpec(entry.queue, action.id);
      const label = action.label || spec.label || action.id;
      byAction[label] = (byAction[label] || 0) + 1;
      if (RISK_ORDER[spec.risk || 'none'] >= RISK_ORDER.high) highRisk += 1;
      if (spec.reversible === false) irreversible += 1;
      if ((spec.requires_note || spec.reversible === false)
          && !String(actionNote(entry, action.id)).trim()) {
        missingRequiredNotes += 1;
      }
    }
  });

  const incomplete = undecided > 0;
  const warnings = [];
  if (incomplete) warnings.push(`${undecided} item(s) still unresolved`);
  if (highRisk) warnings.push(`${highRisk} high-risk action(s)`);
  if (missingRequiredNotes) {
    warnings.push(`${missingRequiredNotes} required rationale note(s) missing`);
  }
  if (conflicts) warnings.push(`${conflicts} item(s) contain conflicting actions`);
  return {
    decided,
    undecided,
    total: totalCards,
    incomplete,
    byAction: Object.entries(byAction).sort((a, b) => b[1] - a[1]),
    highRisk,
    irreversible,
    missingRequiredNotes,
    conflicts,
    annotationCount,
    warnings,
  };
}

function updateProgress() {
  const summary = reviewSummary();
  document.getElementById('progressLabel').innerHTML =
    `<strong>${summary.decided} of ${summary.total}</strong> items resolved`;
  document.getElementById('progressPercent').textContent = summary.total
    ? `${Math.round((summary.decided / summary.total) * 100)}%`
    : '100%';
  document.getElementById('progressFill').style.transform = summary.total
    ? `scaleX(${summary.decided / summary.total})`
    : 'scaleX(1)';

  document.querySelectorAll('[data-queue-progress]').forEach(el => {
    const queue = el.dataset.queueProgress;
    const cards = [...document.querySelectorAll(`.card[data-queue="${CSS.escape(queue)}"]`)];
    el.textContent = `${cards.filter(card => card.classList.contains('done')).length}/${cards.length}`;
  });

  const warning = document.getElementById('summaryWarning');
  const activeWarnings = summary.highRisk
    || summary.conflicts
    || summary.missingRequiredNotes;
  warning.hidden = !activeWarnings;
  if (activeWarnings) {
    warning.innerHTML = `<strong>Review check:</strong> ${escapeHTML(summary.warnings
      .filter(message => !message.includes('unresolved')).join('; '))}.`;
  }
}

function summaryRow(label, value, state = '') {
  return `<div class="summary-row ${state}"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`;
}

function openSummary() {
  const summary = reviewSummary();
  const body = document.getElementById('summaryBody');
  const actionList = summary.byAction.length
    ? `<ul class="summary-list">${summary.byAction.map(([label, count]) =>
        `<li><span>${escapeHTML(label)}</span><b>${count}</b></li>`).join('')}</ul>`
    : '<p class="field-hint">No actions selected yet.</p>';
  const warning = summary.warnings.length
    ? `<div class="summary-banner"><strong>Before export:</strong> ${escapeHTML(summary.warnings.join('; '))}.</div>`
    : '<div class="empty"><strong>Review complete.</strong> The decision file is ready to export.</div>';
  body.innerHTML = `
    ${warning}
    <dl class="summary-rows">
      ${summaryRow('Resolved', `${summary.decided} of ${summary.total}`, summary.incomplete ? '' : 'good')}
      ${summaryRow('Unresolved', summary.undecided, summary.undecided ? 'warning' : 'good')}
      ${summaryRow('High-risk actions', summary.highRisk, summary.highRisk ? 'bad' : '')}
      ${summaryRow('Conflicts', summary.conflicts, summary.conflicts ? 'bad' : '')}
      ${summaryRow('Missing rationale', summary.missingRequiredNotes, summary.missingRequiredNotes ? 'bad' : '')}
      ${summaryRow('Items with notes', summary.annotationCount)}
    </dl>
    <h3>Selected actions</h3>
    ${actionList}
    <div class="summary-actions">
      <button type="button" class="button-primary" onclick="exportDecisions('download', true)">Download decisions</button>
      <button type="button" onclick="exportDecisions('copy', true)">Copy decisions</button>
      <button type="button" ${summary.incomplete ? '' : 'disabled'} onclick="jumpToUnresolved()">Go to first unresolved item</button>
    </div>`;
  const panel = document.getElementById('summaryPanel');
  const trigger = document.getElementById('summaryTrigger');
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  panel.querySelector('.summary-close').focus();
}

function closeSummary(returnFocus = false) {
  document.getElementById('summaryPanel').hidden = true;
  const trigger = document.getElementById('summaryTrigger');
  trigger.setAttribute('aria-expanded', 'false');
  if (returnFocus) trigger.focus();
}

function jumpToUnresolved() {
  closeSummary(false);
  const card = [...document.querySelectorAll('.card:not(.done)')]
    .find(candidate => !candidate.hidden && !candidate.closest('.queue').hidden);
  if (!card) {
    toast('No visible unresolved items');
    return;
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  controlsForCard(card)[0]?.focus({ preventScroll: true });
}

function canonicalDecision(entry) {
  const actions = (entry.actions || []).map(action => ({
    id: action.id,
    label: action.label || action.id,
  }));
  return {
    ...entry,
    actions,
    action: actions.length === 1 ? actions[0].id : null,
    label: actions.length === 1 ? actions[0].label : null,
    note: entry.notes?.item || entry.note || '',
  };
}

function decisionPayload() {
  const summary = reviewSummary();
  const entries = Object.values(decisions).map(canonicalDecision);
  return {
    ...REVIEW_META,
    ...ARTIFACT_IDENTITY,
    console_title: CONSOLE_TITLE,
    exported_at: new Date().toISOString(),
    complete: !summary.incomplete,
    valid: summary.conflicts === 0 && summary.missingRequiredNotes === 0,
    warnings: summary.warnings,
    decisions: entries.filter(entry => entry.actions.length > 0),
    annotations: entries
      .filter(entry => entry.actions.length === 0 && hasNotes(entry.notes))
      .map(entry => ({
        id: entry.id,
        queue: entry.queue,
        notes: entry.notes,
        item: entry.item,
        updated_at: entry.updated_at,
      })),
  };
}

function showExportPreview(text, message) {
  const box = document.getElementById('exportBox');
  box.value = text;
  box.style.display = 'block';
  box.focus();
  box.select();
  toast(message);
}

function exportDecisions(mode, fromSummary = false) {
  const summary = reviewSummary();
  const needsGate = summary.warnings.length > 0 && !fromSummary;
  if (needsGate) {
    openSummary();
    return;
  }
  const text = JSON.stringify(decisionPayload(), null, 2);
  if (mode === 'preview') {
    showExportPreview(text, 'Decisions opened below as JSON');
    return;
  }
  if (mode === 'copy') {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast('Decisions copied as JSON'))
        .catch(() => showExportPreview(text, 'Clipboard unavailable; copy the JSON below'));
    } else {
      showExportPreview(text, 'Clipboard unavailable; copy the JSON below');
    }
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${DOWNLOAD_NAME}${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('Decisions downloaded as JSON');
}

function clearDecisions() {
  if (!confirm('Clear all decisions and notes saved in this browser?')) return;
  decisions = {};
  cardIndex.forEach(card => {
    controlsForCard(card).forEach(input => { input.checked = false; });
    textareasForCard(card).forEach(textarea => { textarea.value = ''; });
    applyDecisionState(card, null);
  });
  documentBlockIndex.forEach(block => {
    const textarea = block.querySelector('textarea[data-document-note]');
    if (textarea) textarea.value = '';
    updateDocumentAnnotationState(block, '');
  });
  persist();
  applyFilters();
  toast('Decisions and notes cleared');
}

const searchInput = document.getElementById('reviewSearch');
const queueFilter = document.getElementById('queueFilter');
const stateFilter = document.getElementById('stateFilter');

function applyFilters() {
  const query = searchInput?.value.trim().toLowerCase() || '';
  const queueId = queueFilter?.value || '';
  const state = stateFilter?.value || 'all';
  let visibleCards = 0;
  document.querySelectorAll('.queue').forEach(queue => {
    let queueVisible = 0;
    queue.querySelectorAll('.card').forEach(card => {
      const queueMatch = !queueId || card.dataset.queue === queueId;
      const decided = card.classList.contains('done');
      const stateMatch = state === 'all'
        || (state === 'decided' ? decided : !decided);
      const searchMatch = !query || (card.dataset.search || '').includes(query);
      card.hidden = !(queueMatch && stateMatch && searchMatch);
      if (!card.hidden) {
        queueVisible += 1;
        visibleCards += 1;
      }
    });
    const hasCards = queue.querySelectorAll('.card').length > 0;
    queue.hidden = (queueId && queue.id !== queueId) || (hasCards && queueVisible === 0);
  });
  const filterStatus = document.getElementById('filterStatus');
  if (filterStatus) filterStatus.textContent = `${visibleCards} item(s) shown`;
  scheduleMobileCardUpdate();
}

function moveToUnresolved(direction) {
  const cards = [...document.querySelectorAll('.card:not(.done)')]
    .filter(card => !card.hidden && !card.closest('.queue').hidden);
  if (!cards.length) {
    toast('No visible unresolved items');
    return;
  }
  const focused = document.activeElement?.closest?.('.card');
  const mobileOwner = document.activeElement?.closest?.('.decision-column')?.dataset.ownerId;
  const current = focused || (mobileOwner ? cardIndex.get(mobileOwner) : activeMobileCard);
  let index = cards.indexOf(current);
  index = index < 0
    ? (direction > 0 ? 0 : cards.length - 1)
    : (index + direction + cards.length) % cards.length;
  cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  setActiveMobileCard(cards[index]);
  controlsForCard(cards[index])[0]?.focus({ preventScroll: true });
}

function initializeQueueFilter() {
  if (!queueFilter) return;
  document.querySelectorAll('.queue').forEach(queue => {
    const option = document.createElement('option');
    option.value = queue.id;
    option.textContent = queue.querySelector('h2')?.textContent || queue.id;
    queueFilter.appendChild(option);
  });
}

function setTheme(value) {
  const theme = ['light', 'dark'].includes(value) ? value : 'system';
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  document.getElementById('themeSelect').value = theme;
  if (storageAvailable) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* no-op */ }
  }
}

function initializeTheme() {
  let theme = 'system';
  try { theme = localStorage.getItem(THEME_KEY) || 'system'; } catch (_) { /* no-op */ }
  setTheme(theme);
}

function restoreMobileColumn() {
  if (!activeMobileCard) return;
  const column = decisionColumn(activeMobileCard);
  if (column && column.parentElement?.id === 'mobileTrayBody') {
    activeMobileCard.appendChild(column);
  }
}

function updateMobileTray(card) {
  if (!card || card !== activeMobileCard) return;
  const entry = decisions[card.dataset.id];
  const count = entry?.actions?.length || 0;
  document.getElementById('mobileTrayState').textContent = count
    ? `${count} selected`
    : 'Unresolved';
}

function setActiveMobileCard(card) {
  if (!window.matchMedia('(max-width: 680px)').matches || !card || card.hidden) return;
  if (activeMobileCard === card) {
    updateMobileTray(card);
    return;
  }
  restoreMobileColumn();
  activeMobileCard = card;
  const column = decisionColumn(card);
  if (column) document.getElementById('mobileTrayBody').appendChild(column);
  document.getElementById('mobileTrayItem').textContent =
    card.querySelector('.card-title')?.textContent || 'Review item';
  updateMobileTray(card);
}

function nearestVisibleCard() {
  const cards = [...document.querySelectorAll('.card')]
    .filter(card => !card.hidden && !card.closest('.queue').hidden);
  if (!cards.length) return null;
  const targetY = window.innerHeight * 0.42;
  return cards.reduce((nearest, card) => {
    const rect = card.getBoundingClientRect();
    const distance = Math.abs((rect.top + Math.min(rect.height, window.innerHeight) / 2) - targetY);
    return !nearest || distance < nearest.distance ? { card, distance } : nearest;
  }, null)?.card;
}

function scheduleMobileCardUpdate() {
  if (!window.matchMedia('(max-width: 680px)').matches) return;
  cancelAnimationFrame(mobileRaf);
  mobileRaf = requestAnimationFrame(() => setActiveMobileCard(nearestVisibleCard()));
}

function toggleMobileTray() {
  mobileTrayOpen = !mobileTrayOpen;
  document.getElementById('mobileTrayBody').hidden = !mobileTrayOpen;
  const button = document.getElementById('mobileTrayToggle');
  button.setAttribute('aria-expanded', String(mobileTrayOpen));
  button.textContent = mobileTrayOpen ? 'Close actions' : 'Actions';
}

function handleViewportChange() {
  if (!window.matchMedia('(max-width: 1120px)').matches) closeContentsDrawer();
  if (window.matchMedia('(max-width: 680px)').matches) {
    setActiveMobileCard(nearestVisibleCard());
  } else {
    restoreMobileColumn();
    activeMobileCard = null;
    mobileTrayOpen = false;
    document.getElementById('mobileTrayBody').hidden = true;
    document.getElementById('mobileTrayToggle').setAttribute('aria-expanded', 'false');
    document.getElementById('mobileTrayToggle').textContent = 'Actions';
  }
}

searchInput?.addEventListener('input', applyFilters);
queueFilter?.addEventListener('change', applyFilters);
stateFilter?.addEventListener('change', applyFilters);
document.getElementById('prevUndecided')?.addEventListener('click', () => moveToUnresolved(-1));
document.getElementById('nextUndecided')?.addEventListener('click', () => moveToUnresolved(1));
document.getElementById('mobilePrevious').addEventListener('click', () => moveToUnresolved(-1));
document.getElementById('mobileNext').addEventListener('click', () => moveToUnresolved(1));
document.getElementById('mobileTrayToggle').addEventListener('click', toggleMobileTray);
document.getElementById('themeSelect').addEventListener('change', event => setTheme(event.target.value));
const aboutReview = document.getElementById('aboutReview');
const aboutTrigger = document.getElementById('aboutTrigger');
const tocLauncher = document.getElementById('tocLauncher');
const tocDrawer = document.getElementById('tocDrawer');
const tocDrawerClose = document.getElementById('tocDrawerClose');
aboutTrigger.addEventListener('click', event => {
  event.stopPropagation();
  const pinned = aboutReview.classList.toggle('pinned');
  aboutTrigger.setAttribute('aria-expanded', String(pinned));
});
document.addEventListener('click', event => {
  if (!aboutReview.contains(event.target)) {
    aboutReview.classList.remove('pinned');
    aboutTrigger.setAttribute('aria-expanded', 'false');
  }
  if (tocDrawer && !tocDrawer.hidden
    && !tocDrawer.contains(event.target)
    && !tocLauncher?.contains(event.target)) {
    closeContentsDrawer();
  }
});
const tocLinks = [...document.querySelectorAll('.toc-link')];
const tocTargets = [...new Set(tocLinks.map(link => link.dataset.tocTarget))]
  .map(id => document.getElementById(id))
  .filter(Boolean);
let tocRaf = 0;

function openContentsDrawer() {
  if (!tocDrawer || !tocLauncher) return;
  tocDrawer.hidden = false;
  tocLauncher.setAttribute('aria-expanded', 'true');
  tocDrawerClose?.focus();
}

function closeContentsDrawer(returnFocus = false) {
  if (!tocDrawer || !tocLauncher) return;
  tocDrawer.hidden = true;
  tocLauncher.setAttribute('aria-expanded', 'false');
  if (returnFocus) tocLauncher.focus();
}

function toggleContentsDrawer() {
  if (tocDrawer?.hidden) openContentsDrawer();
  else closeContentsDrawer();
}

tocLauncher?.addEventListener('click', toggleContentsDrawer);
tocDrawerClose?.addEventListener('click', () => closeContentsDrawer(true));

function updateDocumentToc() {
  if (!tocTargets.length) return;
  const headerOffset = (document.querySelector('.app-header')?.getBoundingClientRect().height || 0) + 28;
  let active = tocTargets[0];
  tocTargets.forEach(target => {
    if (target.getBoundingClientRect().top <= headerOffset) active = target;
  });
  tocLinks.forEach(link => {
    if (link.dataset.tocTarget === active.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function scheduleDocumentTocUpdate() {
  cancelAnimationFrame(tocRaf);
  tocRaf = requestAnimationFrame(updateDocumentToc);
}

tocLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (tocDrawer?.contains(link)) closeContentsDrawer();
    const target = document.getElementById(link.dataset.tocTarget);
    setTimeout(() => target?.focus({ preventScroll: true }), 0);
  });
});

window.addEventListener('scroll', () => {
  scheduleMobileCardUpdate();
  scheduleDocumentTocUpdate();
}, { passive: true });
window.addEventListener('resize', () => {
  handleViewportChange();
  scheduleDocumentTocUpdate();
});

document.addEventListener('keydown', event => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.key === 'Escape' && !document.getElementById('summaryPanel').hidden) {
    closeSummary(true);
  }
  if (event.key === 'Escape' && aboutReview.classList.contains('pinned')) {
    aboutReview.classList.remove('pinned');
    aboutTrigger.setAttribute('aria-expanded', 'false');
    aboutTrigger.focus();
  }
  if (event.key === 'Escape' && tocDrawer && !tocDrawer.hidden) {
    closeContentsDrawer(true);
  }
  if (event.key === '/' && !editing && searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
  if (!editing && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    moveToUnresolved(1);
  }
  if (!editing && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    moveToUnresolved(-1);
  }
});

initializeQueueFilter();
initializeTheme();
applyExisting();
applyExistingDocumentAnnotations();
updateStorageStatus();
updateProgress();
applyFilters();
handleViewportChange();
updateDocumentToc();
