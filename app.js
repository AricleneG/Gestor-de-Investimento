/* MeusInvest — MVP de controlo de investimentos (dados guardados no navegador) */
(() => {
  'use strict';

  /* ---------- Configuração dos sectores ---------- */
  const SECTORS = {
    imobiliario: {
      label: 'Imobiliário', icon: 'bi-house-door', color: '#b45309',
      entities: ['Terreno', 'Apartamento', 'Moradia', 'Loja / Escritório', 'Construção'],
      detalhe: 'Localização', prazo: { label: 'Prazo (meses)', required: false },
    },
    cripto: {
      label: 'Criptomoedas', icon: 'bi-currency-bitcoin', color: '#f59e0b',
      entities: ['Bitcoin', 'Ethereum', 'USDT', 'BNB', 'Solana'],
      detalhe: 'Plataforma / Carteira',
    },
    bolsa: {
      label: 'Bolsa de Valores', icon: 'bi-bar-chart-line', color: '#2563eb',
      entities: ['NAS100', 'S&P 500', 'Apple', 'Tesla', 'BODIVA'],
      detalhe: 'Corretora / Plataforma',
    },
    deposito: {
      label: 'Depósito a Prazo', icon: 'bi-bank', color: '#0f766e',
      entities: ['BFA', 'BAI', 'BIC', 'Standard Bank', 'Banco Sol', 'Atlântico', 'BPC'],
      detalhe: null, prazo: { label: 'Prazo do depósito (meses)', required: true }, taxa: true,
    },
    mobiliario: {
      label: 'Inv. Mobiliário (Táxi)', icon: 'bi-car-front', color: '#7c3aed',
      entities: ['Yango', 'Heetch', 'Bolt', 'Táxi privado'],
      detalhe: 'Viatura / Matrícula', prazo: { label: 'Duração do contrato (meses)', required: false },
    },
  };

  const CURRENCY_LOCALE = { AOA: 'pt-AO', USD: 'en-US', EUR: 'pt-PT' };
  const KEY = 'meusinvest.v1';
  const KEY_CUR = 'meusinvest.currency';

  /* ---------- Estado ---------- */
  let items = load();
  let movements = loadMovements();
  const BANKS = ['BAI', 'BFA', 'BPC', 'Banco Millennium Atlântico'];
  const RATE_KEY = 'meusinvest.bankRates.v1';
  let bankRates = loadRates();
  let currency = localStorage.getItem(KEY_CUR) || 'AOA';
  let sort = { by: 'data', dir: 'desc' };
  let currentView = 'dashboard';
  let deleteId = null;
  const charts = {};

  /* ---------- Utilitários ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(d) ? d : []; }
    catch { return []; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(items)); }
  function loadMovements() { try { const d = JSON.parse(localStorage.getItem('meusinvest.movements.v1')); return Array.isArray(d) ? d : []; } catch { return []; } }
  function saveMovements() { localStorage.setItem('meusinvest.movements.v1', JSON.stringify(movements)); }
  function loadRates() { try { const d = JSON.parse(localStorage.getItem(RATE_KEY)); return d && typeof d === 'object' ? d : {}; } catch { return {}; } }

  const fmtMoney = (n) => {
    try { return new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: 'currency', currency, maximumFractionDigits: 2 }).format(n); }
    catch { return n.toFixed(2) + ' ' + currency; }
  };
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => toISO(new Date());
  const fmtDate = (s) => parseDate(s).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  const monthKey = (s) => s.slice(0, 7);
  const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' }); };
  function addMonths(dateStr, months) {
    const d = parseDate(dateStr);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Number(months));
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISO(d);
  }
  const maturity = (it) => (it.prazo ? addMonths(it.data, it.prazo) : null);
  const daysUntil = (s) => Math.round((parseDate(s) - parseDate(today())) / 86400000);
  const sum = (arr) => arr.reduce((a, b) => a + b.valor, 0);

  function toast(msg) {
    $('#toastBody').textContent = msg;
    bootstrap.Toast.getOrCreateInstance($('#toast'), { delay: 2800 }).show();
  }

  function last12Months() {
    const out = []; const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }

  /* ---------- Navegação ---------- */
  function showView(v) {
    currentView = v;
    $$('.view').forEach((el) => el.classList.toggle('d-none', el.id !== 'view-' + v));
    $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    window.scrollTo({ top: 0 });
    render();
  }

  /* ---------- Renderização ---------- */
  function render() {
    $('#currencySelect').value = currency;
    $('#currencyTag').textContent = { AOA: 'Kz', USD: 'US$', EUR: '€' }[currency];
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'lista') renderList();
    if (currentView === 'mapa') renderMap();
    if (currentView === 'controlo') renderControl();
  }

  function sectorBadge(key) {
    const s = SECTORS[key];
    return `<span class="badge badge-sector" style="background:${s.color}"><i class="bi ${s.icon} me-1"></i>${esc(s.label)}</span>`;
  }

  function itemRow(it) {
    const s = SECTORS[it.sector];
    return `<div class="item-row">
      <div class="sector-dot" style="background:${s.color}"><i class="bi ${s.icon}"></i></div>
      <div class="item-main"><div class="name">${esc(it.entidade)}</div><div class="meta">${esc(s.label)} · ${fmtDate(it.data)}</div></div>
      <div class="fw-semibold text-nowrap">${fmtMoney(it.valor)}</div>
    </div>`;
  }

  function renderDashboard() {
    const total = sum(items);
    const thisMonth = sum(items.filter((i) => monthKey(i.data) === monthKey(today())));
    const bySector = groupSum(items, 'sector');
    const top = Object.entries(bySector).sort((a, b) => b[1] - a[1])[0];
    const kpis = [
      { icon: 'bi-wallet2', label: 'Total investido', value: fmtMoney(total) },
      { icon: 'bi-calendar-month', label: 'Este mês', value: fmtMoney(thisMonth) },
      { icon: 'bi-collection', label: 'Registos', value: items.length },
      { icon: 'bi-trophy', label: 'Maior sector', value: top ? `${SECTORS[top[0]].label} (${Math.round((top[1] / total) * 100)}%)` : '—' },
    ];
    $('#kpis').innerHTML = kpis.map((k) => `
      <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body kpi">
        <div class="kpi-icon"><i class="bi ${k.icon}"></i></div>
        <div><div class="kpi-label">${k.label}</div><div class="kpi-value">${esc(k.value)}</div></div>
      </div></div></div>`).join('');

    // Gráfico por sector
    const keys = Object.keys(bySector).filter((k) => bySector[k] > 0);
    toggleChart('chartSector', keys.length > 0);
    if (keys.length) {
      drawChart('chartSector', 'doughnut', {
        labels: keys.map((k) => SECTORS[k].label),
        datasets: [{ data: keys.map((k) => bySector[k]), backgroundColor: keys.map((k) => SECTORS[k].color), borderWidth: 2 }],
      }, { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtMoney(c.parsed)}` } } }, cutout: '62%' });
    }

    // Gráfico por mês
    const months = last12Months();
    const byMonth = groupSum(items, null, monthKey);
    toggleChart('chartMonth', items.length > 0);
    if (items.length) {
      drawChart('chartMonth', 'bar', {
        labels: months.map(monthLabel),
        datasets: [{ label: 'Investido', data: months.map((m) => byMonth[m] || 0), backgroundColor: '#0f766e', borderRadius: 6 }],
      }, { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmtMoney(c.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => compact(v) } } } });
    }

    // Recentes
    const recent = [...items].sort((a, b) => b.data.localeCompare(a.data) || b.criado - a.criado).slice(0, 5);
    $('#recentList').innerHTML = recent.length ? recent.map(itemRow).join('') : '<div class="empty-state">Ainda não registou investimentos.</div>';

    // Vencimentos
    const mats = items.map((i) => ({ i, m: maturity(i) })).filter((x) => x.m && daysUntil(x.m) >= 0)
      .sort((a, b) => a.m.localeCompare(b.m)).slice(0, 5);
    $('#maturityList').innerHTML = mats.length ? mats.map(({ i, m }) => {
      const d = daysUntil(m);
      const cls = d <= 30 ? 'text-bg-danger' : d <= 90 ? 'text-bg-warning' : 'text-bg-secondary';
      return `<div class="item-row">
        <div class="sector-dot" style="background:${SECTORS[i.sector].color}"><i class="bi ${SECTORS[i.sector].icon}"></i></div>
        <div class="item-main"><div class="name">${esc(i.entidade)}</div><div class="meta">Vence em ${fmtDate(m)} · ${fmtMoney(i.valor)}</div></div>
        <span class="badge ${cls}">${d === 0 ? 'Hoje' : d + ' d'}</span></div>`;
    }).join('') : '<div class="empty-state">Sem vencimentos futuros.<br><small>Registe investimentos com prazo para os acompanhar aqui.</small></div>';
  }

  function compact(v) { return new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 }).format(v); }

  function groupSum(arr, field, fn) {
    const out = {};
    arr.forEach((i) => { const k = fn ? fn(i.data) : i[field]; out[k] = (out[k] || 0) + i.valor; });
    return out;
  }

  function toggleChart(id, hasData) {
    $('#' + id).parentElement.classList.toggle('d-none', !hasData);
    $('#' + id + 'Empty').classList.toggle('d-none', hasData);
  }
  function drawChart(id, type, data, options) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($('#' + id), { type, data, options: { responsive: true, maintainAspectRatio: false, ...options } });
  }

  /* ---------- Lista ---------- */
  function filtered() {
    const q = $('#fSearch').value.trim().toLowerCase();
    const s = $('#fSector').value, from = $('#fFrom').value, to = $('#fTo').value;
    let out = items.filter((i) =>
      (!s || i.sector === s) && (!from || i.data >= from) && (!to || i.data <= to) &&
      (!q || (i.entidade + ' ' + (i.nota || '') + ' ' + (i.detalhe || '')).toLowerCase().includes(q)));
    const dir = sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      if (sort.by === 'valor') return (a.valor - b.valor) * dir;
      if (sort.by === 'entidade') return a.entidade.localeCompare(b.entidade, 'pt') * dir;
      return (a.data.localeCompare(b.data) || a.criado - b.criado) * dir;
    });
    return out;
  }

  function detailsText(it) {
    const parts = [];
    if (it.detalhe) parts.push(esc(it.detalhe));
    if (it.prazo) parts.push(`${it.prazo} meses (vence ${fmtDate(maturity(it))})`);
    if (it.taxa) parts.push(`${it.taxa}% a.a.`);
    if (it.nota) parts.push(`<em>${esc(it.nota)}</em>`);
    return parts.join(' · ') || '<span class="text-secondary">—</span>';
  }

  function renderList() {
    const list = filtered();
    $('#listSummary').textContent = `${list.length} registo(s) · ${fmtMoney(sum(list))}`;
    $('#listEmpty').classList.toggle('d-none', list.length > 0);
    $('.card:has(#tableBody)').classList.toggle('d-none', list.length === 0);

    const actions = (id) => `<button class="btn btn-sm btn-outline-secondary" data-edit="${id}" aria-label="Editar"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-danger" data-del="${id}" aria-label="Eliminar"><i class="bi bi-trash"></i></button>`;

    $('#tableBody').innerHTML = list.map((i) => `<tr>
      <td class="text-nowrap">${fmtDate(i.data)}</td>
      <td>${sectorBadge(i.sector)}</td>
      <td class="fw-semibold">${esc(i.entidade)}</td>
      <td class="small">${detailsText(i)}</td>
      <td class="text-end fw-semibold text-nowrap">${fmtMoney(i.valor)}</td>
      <td class="text-end text-nowrap">${actions(i.id)}</td></tr>`).join('');

    $('#cardList').innerHTML = list.map((i) => `<div class="mobile-card">
      <div class="d-flex justify-content-between gap-2">
        <div class="fw-semibold">${esc(i.entidade)}</div><div class="fw-semibold text-nowrap">${fmtMoney(i.valor)}</div></div>
      <div class="d-flex justify-content-between align-items-center my-1">${sectorBadge(i.sector)}<small class="text-secondary">${fmtDate(i.data)}</small></div>
      <div class="small text-secondary mb-2">${detailsText(i)}</div>
      <div class="text-end">${actions(i.id)}</div></div>`).join('');
  }

  /* ---------- Mapa ---------- */
  function renderMap() {
    const total = sum(items);
    const keys = Object.keys(SECTORS);
    $('#mapSectors').innerHTML = keys.map((k) => {
      const s = SECTORS[k];
      const arr = items.filter((i) => i.sector === k);
      const t = sum(arr);
      const pct = total ? (t / total) * 100 : 0;
      const ents = Object.entries(groupSum(arr, 'entidade')).sort((a, b) => b[1] - a[1]);
      const dates = arr.map((i) => i.data).sort();
      return `<div class="col-md-6 col-xl-4"><div class="card h-100 map-card"><div class="card-body">
        <div class="d-flex align-items-center gap-2 mb-2">
          <div class="sector-dot" style="background:${s.color}"><i class="bi ${s.icon}"></i></div>
          <div class="flex-grow-1"><div class="fw-semibold">${esc(s.label)}</div>
            <div class="small text-secondary">${arr.length} registo(s)${dates.length ? ` · desde ${fmtDate(dates[0])}` : ''}</div></div>
          <div class="text-end"><div class="fw-bold">${fmtMoney(t)}</div><div class="small text-secondary">${pct.toFixed(1)}%</div></div>
        </div>
        <div class="progress mb-3"><div class="progress-bar" style="width:${pct}%;background:${s.color}"></div></div>
        ${ents.length ? ents.map(([n, v]) => `<div class="entity-line"><span>${esc(n)}</span><span class="fw-semibold">${fmtMoney(v)}</span></div>
          <div class="entity-bar"><span style="width:${t ? (v / t) * 100 : 0}%;background:${s.color}"></span></div>`).join('')
          : '<div class="small text-secondary">Sem investimentos neste sector.</div>'}
      </div></div></div>`;
    }).join('');

    // Matriz sector x mês
    const months = last12Months();
    const cell = (v) => (v ? `<td class="text-end">${fmtMoney(v)}</td>` : '<td class="text-end zero">—</td>');
    let head = `<thead><tr><th>Sector</th>${months.map((m) => `<th class="text-end">${monthLabel(m)}</th>`).join('')}<th class="text-end">Total</th></tr></thead>`;
    let body = '<tbody>' + keys.map((k) => {
      const arr = items.filter((i) => i.sector === k);
      const bm = groupSum(arr, null, monthKey);
      return `<tr><th><span class="badge badge-sector" style="background:${SECTORS[k].color}">${esc(SECTORS[k].label)}</span></th>${months.map((m) => cell(bm[m])).join('')}<td class="text-end fw-bold">${fmtMoney(sum(arr))}</td></tr>`;
    }).join('') + '</tbody>';
    const bmAll = groupSum(items, null, monthKey);
    const foot = `<tfoot><tr><th>Total</th>${months.map((m) => `<td class="text-end">${bmAll[m] ? fmtMoney(bmAll[m]) : '—'}</td>`).join('')}<td class="text-end">${fmtMoney(total)}</td></tr></tfoot>`;
    $('#matrix').innerHTML = head + body + foot;
  }

  /* ---------- Bancos, comparação e movimentos ---------- */
  function renderControl() {
    $('#movementDate').value ||= today();
    const amount = Math.max(0, Number($('#compareAmount').value) || 0);
    const months = Math.max(1, Number($('#compareMonths').value) || 1);
    const rows = BANKS.map((bank) => {
      const rate = bankRates[bank] || {};
      const valid = rate.value !== '' && rate.value != null && Number.isFinite(Number(rate.value)) && Number(rate.value) >= 0;
      const interest = valid ? amount * (Number(rate.value) / 100) * (months / 12) : null;
      return `<tr><td class="fw-semibold">${esc(bank)}</td>
        <td style="min-width:125px"><input class="form-control form-control-sm bank-rate" data-bank="${esc(bank)}" type="number" min="0" max="1000" step="0.01" placeholder="Inserir taxa" value="${valid ? esc(rate.value) : ''}"></td>
        <td style="min-width:145px"><input class="form-control form-control-sm bank-date" data-bank="${esc(bank)}" type="date" value="${esc(rate.date || '')}"></td>
        <td class="text-end text-nowrap">${interest === null ? '—' : fmtMoney(interest)}</td>
        <td class="text-end text-nowrap fw-semibold">${interest === null ? '—' : fmtMoney(amount + interest)}</td></tr>`;
    }).join('');
    $('#bankCompareBody').innerHTML = rows;
    const ranked = BANKS.map((b) => ({ bank: b, rate: bankRates[b] })).filter(x => x.rate && x.rate.value !== '' && Number.isFinite(Number(x.rate.value))).sort((a,b) => Number(b.rate.value)-Number(a.rate.value));
    $('#compareNote').textContent = ranked.length ? `Maior taxa registada: ${ranked[0].bank} (${Number(ranked[0].rate.value).toLocaleString('pt-PT')}% ao ano). Confirme as condições directamente com o banco.` : 'Preencha as taxas para comparar os bancos.';
    const sorted = [...movements].sort((a,b) => b.date.localeCompare(a.date) || b.created-a.created);
    $('#movementSummary').textContent = `${movements.length} movimento(s)`;
    $('#movementEmpty').classList.toggle('d-none', sorted.length > 0);
    $('#movementBody').innerHTML = sorted.map(m => `<tr><td class="text-nowrap">${fmtDate(m.date)}</td><td>${esc(m.type)}</td><td>${esc(m.from)}</td><td>${esc([m.to,m.note].filter(Boolean).join(' · ') || '—')}</td><td class="text-end text-nowrap fw-semibold">${fmtMoney(m.value)}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger" data-movement-delete="${m.id}" aria-label="Eliminar movimento"><i class="bi bi-trash"></i></button></td></tr>`).join('');
  }

  function saveBankRates() {
    $$('.bank-rate').forEach(input => {
      const bank = input.dataset.bank;
      bankRates[bank] = bankRates[bank] || {};
      bankRates[bank].value = input.value;
    });
    $$('.bank-date').forEach(input => {
      const bank = input.dataset.bank;
      bankRates[bank] = bankRates[bank] || {};
      bankRates[bank].date = input.value;
    });
    localStorage.setItem(RATE_KEY, JSON.stringify(bankRates));
  }

  /* ---------- Formulário ---------- */
  const modal = () => bootstrap.Modal.getOrCreateInstance($('#modalInvest'));

  function buildSectorPicker() {
    $('#sectorPicker').innerHTML = Object.entries(SECTORS).map(([k, s]) =>
      `<button type="button" class="sector-opt" data-sector="${k}" style="--c:${s.color}"><i class="bi ${s.icon}"></i>${esc(s.label)}</button>`).join('');
    $('#fSector').innerHTML = '<option value="">Todos os sectores</option>' +
      Object.entries(SECTORS).map(([k, s]) => `<option value="${k}">${esc(s.label)}</option>`).join('');
  }

  function selectSector(k, keepValues) {
    $('#fSectorForm').value = k || '';
    $('#sectorErr').classList.add('d-none');
    $$('.sector-opt').forEach((b) => b.classList.toggle('selected', b.dataset.sector === k));
    const s = SECTORS[k];
    if (!s) return;
    // Entidades sugeridas: as do sector + as já usadas pelo utilizador
    const used = items.filter((i) => i.sector === k).map((i) => i.entidade);
    const names = [...new Set([...used, ...s.entities])];
    $('#entityList').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
    $('#fEntidade').placeholder = 'Ex.: ' + s.entities.slice(0, 3).join(', ');

    const hasDetalhe = !!s.detalhe, hasPrazo = !!s.prazo, hasTaxa = !!s.taxa;
    $('#grpDetalhe').classList.toggle('d-none', !hasDetalhe);
    $('#grpPrazo').classList.toggle('d-none', !hasPrazo);
    $('#grpTaxa').classList.toggle('d-none', !hasTaxa);
    $('#extraBox').classList.toggle('d-none', !(hasDetalhe || hasPrazo || hasTaxa));
    if (hasDetalhe) $('#lblDetalhe').textContent = s.detalhe + ' (opcional)';
    if (hasPrazo) $('#lblPrazo').textContent = s.prazo.label + (s.prazo.required ? '' : ' (opcional)');
    $('#fPrazo').required = !!(hasPrazo && s.prazo.required);
    $('#extraTitle').textContent = s.prazo?.required ? 'Este sector exige o prazo do investimento' : 'Informação adicional';
    if (!keepValues) { $('#fDetalhe').value = ''; $('#fPrazo').value = ''; $('#fTaxa').value = ''; }
    updateMaturityHint();
  }

  function updateMaturityHint() {
    const prazo = Number($('#fPrazo').value), data = $('#fData').value;
    const box = $('#venceInfo');
    const show = prazo > 0 && data && !$('#grpPrazo').classList.contains('d-none');
    box.classList.toggle('d-none', !show);
    if (show) {
      let txt = `Data de vencimento: <strong>${fmtDate(addMonths(data, prazo))}</strong>`;
      const v = Number($('#fValor').value), t = Number($('#fTaxa').value);
      if (v > 0 && t > 0 && !$('#grpTaxa').classList.contains('d-none')) {
        const juro = v * (t / 100) * (prazo / 12);
        txt += ` · Juro estimado (simples): <strong>${fmtMoney(juro)}</strong>`;
      }
      $('#venceText').innerHTML = txt;
    }
  }

  function openForm(id) {
    const form = $('#formInvest');
    form.classList.remove('was-validated');
    form.reset();
    const it = id ? items.find((i) => i.id === id) : null;
    $('#modalTitle').textContent = it ? 'Editar investimento' : 'Novo investimento';
    $('#fId').value = it ? it.id : '';
    $('#fData').max = today();
    $('#fData').value = it ? it.data : today();
    selectSector(it ? it.sector : '', !!it);
    if (!it) { $('#extraBox').classList.add('d-none'); $('#entityList').innerHTML = ''; $('#fEntidade').placeholder = 'Escolha um sector primeiro'; }
    if (it) {
      $('#fEntidade').value = it.entidade;
      $('#fValor').value = it.valor;
      $('#fDetalhe').value = it.detalhe || '';
      $('#fPrazo').value = it.prazo || '';
      $('#fTaxa').value = it.taxa || '';
      $('#fNota').value = it.nota || '';
      updateMaturityHint();
    }
    modal().show();
  }

  function submitForm(e) {
    e.preventDefault();
    const form = e.target;
    const sector = $('#fSectorForm').value;
    $('#sectorErr').classList.toggle('d-none', !!sector);
    form.classList.add('was-validated');
    const data = $('#fData').value;
    const dateOk = data && data <= today();
    $('#fData').setCustomValidity(dateOk ? '' : 'inválida');
    if (!sector || !form.checkValidity()) return;

    const valor = Math.round(Number($('#fValor').value) * 100) / 100;
    const prev = items.find((i) => i.id === $('#fId').value);
    const s = SECTORS[sector];
    const rec = {
      id: prev ? prev.id : uid(),
      criado: prev ? prev.criado : Date.now(),
      sector, entidade: $('#fEntidade').value.trim(), valor, data,
      detalhe: s.detalhe ? $('#fDetalhe').value.trim() : '',
      prazo: s.prazo && $('#fPrazo').value ? Number($('#fPrazo').value) : null,
      taxa: s.taxa && $('#fTaxa').value ? Number($('#fTaxa').value) : null,
      nota: $('#fNota').value.trim(),
    };
    items = prev ? items.map((i) => (i.id === prev.id ? rec : i)) : [...items, rec];
    save();
    modal().hide();
    render();
    toast(prev ? 'Investimento actualizado.' : 'Investimento registado.');
  }

  /* ---------- Exportar / Importar ---------- */
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    if (!items.length) return toast('Não há dados para exportar.');
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Data', 'Sector', 'Entidade', 'Valor', 'Detalhe', 'Prazo (meses)', 'Vencimento', 'Taxa anual %', 'Nota']];
    [...items].sort((a, b) => a.data.localeCompare(b.data)).forEach((i) =>
      rows.push([i.data, SECTORS[i.sector].label, i.entidade, i.valor, i.detalhe, i.prazo || '', i.prazo ? maturity(i) : '', i.taxa || '', i.nota]));
    download(`investimentos-${today()}.csv`, '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\n'), 'text/csv;charset=utf-8');
  }

  function restore(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        const list = Array.isArray(d) ? d : d.items;
        const valid = list.filter((i) => SECTORS[i.sector] && i.entidade && Number(i.valor) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(i.data))
          .map((i) => ({ ...i, id: i.id || uid(), criado: i.criado || Date.now(), valor: Number(i.valor) }));
        if (!valid.length) throw new Error('vazio');
        if (!confirm(`Restaurar ${valid.length} registo(s)? Os dados actuais serão substituídos.`)) return;
        items = valid; movements = Array.isArray(d.movements) ? d.movements : []; bankRates = d.bankRates && typeof d.bankRates === 'object' ? d.bankRates : {}; save(); saveMovements(); localStorage.setItem(RATE_KEY, JSON.stringify(bankRates)); render(); toast('Cópia restaurada.');
      } catch { toast('Ficheiro inválido.'); }
    };
    r.readAsText(file);
  }

  function loadDemo() {
    if (items.length && !confirm('Isto substitui os dados actuais por dados de exemplo. Continuar?')) return;
    const now = new Date();
    const d = (monthsAgo, day) => toISO(new Date(now.getFullYear(), now.getMonth() - monthsAgo, day));
    const mk = (sector, entidade, valor, data, extra = {}) => ({ id: uid(), criado: Date.now(), sector, entidade, valor, data, detalhe: '', prazo: null, taxa: null, nota: '', ...extra });
    items = [
      mk('imobiliario', 'Terreno', 4500000, d(10, 5), { detalhe: 'Cabinda' }),
      mk('imobiliario', 'Apartamento', 3200000, d(4, 12), { detalhe: 'Talatona', prazo: 24 }),
      mk('cripto', 'Bitcoin', 350000, d(8, 3)),
      mk('cripto', 'Bitcoin', 200000, d(2, 20)),
      mk('cripto', 'Ethereum', 150000, d(5, 9)),
      mk('bolsa', 'NAS100', 600000, d(6, 14), { detalhe: 'XTB' }),
      mk('bolsa', 'NAS100', 400000, d(1, 8), { detalhe: 'XTB' }),
      mk('deposito', 'BFA', 2000000, d(3, 2), { prazo: 12, taxa: 14 }),
      mk('deposito', 'BAI', 1500000, d(7, 18), { prazo: 6, taxa: 12 }),
      mk('mobiliario', 'Yango', 5800000, d(9, 25), { detalhe: 'Toyota Corolla · LD-12-34-AB', prazo: 36 }),
      mk('mobiliario', 'Yango', 1000000, d(0, 1), { detalhe: 'Manutenção da viatura' }),
    ];
    save(); render(); toast('Dados de exemplo carregados.');
  }

  /* ---------- Eventos ---------- */
  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-view-go]');
      if (!t) return;
      if (t.dataset.view) return showView(t.dataset.view);
      if (t.dataset.viewGo) return showView(t.dataset.viewGo);
      if (t.dataset.action === 'new') return openForm();
      if (t.dataset.edit) return openForm(t.dataset.edit);
      if (t.dataset.del) {
        const it = items.find((i) => i.id === t.dataset.del);
        deleteId = it.id;
        $('#deleteText').textContent = `${it.entidade} · ${fmtMoney(it.valor)} · ${fmtDate(it.data)}`;
        return bootstrap.Modal.getOrCreateInstance($('#modalDelete')).show();
      }
      if (t.dataset.sector) return selectSector(t.dataset.sector, false);
      if (t.closest('th[data-sort]') === null && t.dataset.sort) return;
    });

    $$('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const by = th.dataset.sort;
      sort = { by, dir: sort.by === by && sort.dir === 'desc' ? 'asc' : 'desc' };
      renderList();
    }));

    $('#btnConfirmDelete').addEventListener('click', () => {
      items = items.filter((i) => i.id !== deleteId); save();
      bootstrap.Modal.getInstance($('#modalDelete')).hide();
      render(); toast('Investimento eliminado.');
    });

    $('#formInvest').addEventListener('submit', submitForm);
    ['fPrazo', 'fData', 'fValor', 'fTaxa'].forEach((id) => $('#' + id).addEventListener('input', updateMaturityHint));

    ['fSearch', 'fSector', 'fFrom', 'fTo'].forEach((id) => $('#' + id).addEventListener('input', renderList));
    $('#fReset').addEventListener('click', () => { ['fSearch', 'fSector', 'fFrom', 'fTo'].forEach((id) => ($('#' + id).value = '')); renderList(); });

    $('#compareAmount').addEventListener('input', () => { saveBankRates(); renderControl(); });
    $('#compareMonths').addEventListener('input', () => { saveBankRates(); renderControl(); });
    $('#bankCompareBody').addEventListener('change', (e) => { if (e.target.matches('.bank-rate, .bank-date')) { saveBankRates(); renderControl(); } });
    $('#movementForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const type = $('#movementType').value, value = Number($('#movementValue').value), from = $('#movementFrom').value.trim(), to = $('#movementTo').value.trim(), date = $('#movementDate').value;
      if (!(value > 0) || !from || !date || date > today()) return toast('Verifique o valor, a origem e a data do movimento.');
      movements.push({ id: uid(), created: Date.now(), type, value, from, to, date, note: $('#movementNote').value.trim() });
      saveMovements(); e.target.reset(); $('#movementDate').value = today(); renderControl(); toast('Movimento guardado.');
    });
    $('#movementBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-movement-delete]'); if (!btn) return;
      if (confirm('Eliminar este movimento?')) { movements = movements.filter(m => m.id !== btn.dataset.movementDelete); saveMovements(); renderControl(); toast('Movimento eliminado.'); }
    });
    $('#currencySelect').addEventListener('change', (e) => { currency = e.target.value; localStorage.setItem(KEY_CUR, currency); render(); });
    $('#btnExportCsv').addEventListener('click', exportCsv);
    $('#btnBackup').addEventListener('click', () => download(`meusinvest-copia-${today()}.json`, JSON.stringify({ versao: 2, items, movements, bankRates }, null, 2), 'application/json'));
    $('#fileRestore').addEventListener('change', (e) => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; });
    $('#btnDemo').addEventListener('click', loadDemo);
    $('#btnClear').addEventListener('click', () => {
      if (!items.length) return;
      if (confirm('Apagar TODOS os investimentos? Esta acção não pode ser desfeita.')) { items = []; movements = []; bankRates = {}; save(); saveMovements(); localStorage.removeItem(RATE_KEY); render(); toast('Dados apagados.'); }
    });
  }

  /* ---------- Arranque ---------- */
  buildSectorPicker();
  bind();
  showView('dashboard');
})();
