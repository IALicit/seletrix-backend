// ============================================================
//  SELETRIX — Inscrições + painel de gestão + pagamento (ASAAS)
// ============================================================
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Banco --------------------------------------------------
const temBanco = !!process.env.DATABASE_URL;
const pool = temBanco ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_NO_SSL === '1' ? false : { rejectUnauthorized: false },
}) : null;

const CONFIG_PADRAO = {
  titulo: 'Edital nº 01/2026', orgao: 'Nome do Órgão / Município',
  periodo: '01 a 30/07/2026', taxa: 'R$ 80,00', prova: '24/08/2026',
  vagas: 'conforme edital', pdf_url: '',
  taxa_valor: 0, dias_vencimento: 5,
  cargos: ['Especialista', 'Mestre'],
};

async function inicializarBanco() {
  if (!pool) { console.warn('⚠️  DATABASE_URL não configurada.'); return; }
  await pool.query(`CREATE TABLE IF NOT EXISTS candidatos (
    id SERIAL PRIMARY KEY, protocolo TEXT UNIQUE, nome TEXT NOT NULL, cpf TEXT NOT NULL,
    nascimento DATE, email TEXT, telefone TEXT, sexo TEXT, cargo TEXT NOT NULL,
    pcd BOOLEAN DEFAULT FALSE, nome_social TEXT, cidade TEXT, uf TEXT,
    status TEXT DEFAULT 'inscrito', criado_em TIMESTAMPTZ DEFAULT now(),
    UNIQUE (cpf, cargo));`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT`);
  await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS invoice_url TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS config (id INT PRIMARY KEY DEFAULT 1, dados TEXT NOT NULL);`);
  await pool.query('INSERT INTO config (id, dados) VALUES (1,$1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(CONFIG_PADRAO)]);
  console.log('✅ Banco pronto.');
}
async function lerConfig() {
  if (!pool) return CONFIG_PADRAO;
  const { rows } = await pool.query('SELECT dados FROM config WHERE id=1');
  if (!rows.length) return CONFIG_PADRAO;
  try { return { ...CONFIG_PADRAO, ...JSON.parse(rows[0].dados) }; } catch { return CONFIG_PADRAO; }
}

// ---- ASAAS --------------------------------------------------
const ASAAS_BASE = process.env.ASAAS_ENV === 'sandbox'
  ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
const temAsaas = !!process.env.ASAAS_API_KEY;

async function asaas(pathApi, method, body) {
  const r = await fetch(ASAAS_BASE + pathApi, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_API_KEY,
      'User-Agent': 'Seletrix',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.errors && j.errors[0] && j.errors[0].description) || ('ASAAS HTTP ' + r.status));
  return j;
}

async function criarCobranca(cand, cfg) {
  const cliente = await asaas('/customers', 'POST', {
    name: cand.nome, cpfCnpj: cand.cpf,
    email: cand.email || undefined, mobilePhone: cand.telefone || undefined,
  });
  const dias = parseInt(cfg.dias_vencimento) || 5;
  const due = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  const base = (process.env.PUBLIC_URL || '').trim();
  const cobranca = await asaas('/payments', 'POST', {
    customer: cliente.id,
    billingType: 'UNDEFINED', // candidato escolhe Pix, boleto ou cartão
    value: Number(cfg.taxa_valor),
    dueDate: due,
    description: (cfg.titulo || 'Inscrição') + ' — ' + cand.cargo,
    externalReference: cand.protocolo,
    callback: base ? { successUrl: base, autoRedirect: false } : undefined,
  });
  return { customerId: cliente.id, paymentId: cobranca.id, invoiceUrl: cobranca.invoiceUrl };
}

// ---- Utilidades --------------------------------------------
const soDigitos = (s) => (s || '').replace(/\D/g, '');
function cpfValido(cpf) {
  cpf = soDigitos(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (b) => { let s = 0; for (let i = 0; i < b; i++) s += parseInt(cpf[i]) * (b + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- Rotas públicas ----------------------------------------
app.get('/health', (req, res) => res.json({ ok: true, banco: temBanco, asaas: temAsaas }));
app.get('/api/config', async (req, res) => { try { res.json(await lerConfig()); } catch { res.json(CONFIG_PADRAO); } });

app.post('/api/inscricao', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Sistema não conectado ao banco. Tente novamente.' });
  try {
    const b = req.body || {};
    const nome = (b.nome || '').trim(), cpf = soDigitos(b.cpf), cargo = (b.cargo || '').trim();
    const email = (b.email || '').trim(), telefone = soDigitos(b.telefone);
    if (nome.length < 3) return res.status(400).json({ erro: 'Informe o nome completo.' });
    if (!cpfValido(cpf)) return res.status(400).json({ erro: 'CPF inválido. Confira os números.' });
    if (!cargo) return res.status(400).json({ erro: 'Selecione o cargo desejado.' });
    if (email && !emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    if (telefone && telefone.length < 10) return res.status(400).json({ erro: 'Telefone/WhatsApp inválido.' });

    const r = await pool.query(
      `INSERT INTO candidatos (nome,cpf,nascimento,email,telefone,sexo,cargo,pcd,nome_social,cidade,uf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [nome, cpf, b.nascimento || null, email || null, telefone || null, b.sexo || null, cargo,
       b.pcd === true || b.pcd === 'on' || b.pcd === 'sim', (b.nome_social || '').trim() || null,
       (b.cidade || '').trim() || null, (b.uf || '').trim().toUpperCase() || null]);
    const id = r.rows[0].id;
    const protocolo = 'SLX2026' + String(id).padStart(5, '0');
    await pool.query('UPDATE candidatos SET protocolo=$1 WHERE id=$2', [protocolo, id]);

    const cfg = await lerConfig();
    const cobrar = temAsaas && Number(cfg.taxa_valor) > 0;
    if (!cobrar) {
      return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: null, cobrar: false });
    }
    try {
      const pay = await criarCobranca({ nome, cpf, email, telefone, cargo, protocolo }, cfg);
      await pool.query('UPDATE candidatos SET status=$1, asaas_customer_id=$2, asaas_payment_id=$3, invoice_url=$4 WHERE id=$5',
        ['aguardando_pagamento', pay.customerId, pay.paymentId, pay.invoiceUrl, id]);
      return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: pay.invoiceUrl, cobrar: true });
    } catch (e) {
      console.error('ASAAS falhou:', e.message);
      await pool.query("UPDATE candidatos SET status='aguardando_pagamento' WHERE id=$1", [id]);
      return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: null, cobrar: true, avisoPagamento: true });
    }
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Este CPF já possui inscrição para este cargo.' });
    console.error('Erro inscrição:', e.message);
    return res.status(500).json({ erro: 'Não foi possível concluir a inscrição. Tente novamente.' });
  }
});

// ---- Webhook ASAAS (confirmação de pagamento) --------------
app.post('/webhook/asaas', async (req, res) => {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (token && req.headers['asaas-access-token'] !== token) return res.status(401).json({ erro: 'token inválido' });
  try {
    const { event, payment } = req.body || {};
    if (pool && payment && (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED')) {
      await pool.query("UPDATE candidatos SET status='pago' WHERE asaas_payment_id=$1 OR protocolo=$2",
        [payment.id, payment.externalReference || '']);
    }
  } catch (e) { console.error('Webhook erro:', e.message); }
  res.json({ ok: true });
});

// ---- Autenticação do painel --------------------------------
function exigirSenha(req, res, next) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return res.status(503).send('Defina ADMIN_PASSWORD.');
  const [, b64] = (req.headers.authorization || '').split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass === senha) return next();
  res.set('WWW-Authenticate', 'Basic realm="Seletrix Admin"');
  return res.status(401).send('Acesso restrito.');
}

app.get('/admin/inscritos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ inscritos: [] });
  const { rows } = await pool.query('SELECT * FROM candidatos ORDER BY id DESC');
  res.json({ inscritos: rows });
});

app.post('/admin/config', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  try {
    const b = req.body || {};
    const limpar = (v) => String(v == null ? '' : v).trim().slice(0, 300);
    let cargos = (Array.isArray(b.cargos) ? b.cargos : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 100);
    if (!cargos.length) return res.status(400).json({ erro: 'Cadastre pelo menos um cargo.' });
    const cfg = {
      titulo: limpar(b.titulo), orgao: limpar(b.orgao), periodo: limpar(b.periodo),
      taxa: limpar(b.taxa), prova: limpar(b.prova), vagas: limpar(b.vagas), pdf_url: limpar(b.pdf_url),
      taxa_valor: Math.max(0, Number(String(b.taxa_valor).replace(',', '.')) || 0),
      dias_vencimento: Math.max(1, parseInt(b.dias_vencimento) || 5),
      cargos,
    };
    await pool.query('UPDATE config SET dados=$1 WHERE id=1', [JSON.stringify(cfg)]);
    res.json({ ok: true, config: cfg });
  } catch (e) { console.error('config:', e.message); res.status(500).json({ erro: 'Não foi possível salvar.' }); }
});

// gerar/regenerar cobrança de um inscrito
app.post('/admin/cobranca/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  if (!temAsaas) return res.status(400).json({ erro: 'Configure a chave do ASAAS (ASAAS_API_KEY).' });
  try {
    const { rows } = await pool.query('SELECT * FROM candidatos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Inscrito não encontrado.' });
    const c = rows[0];
    const cfg = await lerConfig();
    if (Number(cfg.taxa_valor) <= 0) return res.status(400).json({ erro: 'Defina o valor da taxa na aba Edital.' });
    const pay = await criarCobranca({ nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, cargo: c.cargo, protocolo: c.protocolo }, cfg);
    await pool.query('UPDATE candidatos SET status=$1, asaas_customer_id=$2, asaas_payment_id=$3, invoice_url=$4 WHERE id=$5',
      ['aguardando_pagamento', pay.customerId, pay.paymentId, pay.invoiceUrl, c.id]);
    res.json({ ok: true, invoiceUrl: pay.invoiceUrl });
  } catch (e) { console.error('cobranca:', e.message); res.status(500).json({ erro: e.message }); }
});

app.get('/admin/inscritos.csv', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const { rows } = await pool.query('SELECT * FROM candidatos ORDER BY id');
  const cols = ['protocolo','nome','cpf','nascimento','email','telefone','sexo','cargo','pcd','nome_social','cidade','uf','status','invoice_url','criado_em'];
  const cab = ['Protocolo','Nome','CPF','Nascimento','E-mail','Telefone','Sexo','Cargo','PcD','Nome social','Cidade','UF','Status','Link pagamento','Inscrito em'];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const linhas = rows.map((r) => cols.map((c) => {
    if (c === 'pcd') return esc(r[c] ? 'Sim' : 'Não');
    if (c === 'criado_em') return esc(new Date(r[c]).toLocaleString('pt-BR'));
    return esc(r[c]);
  }).join(';'));
  const csv = '\uFEFF' + [cab.join(';'), ...linhas].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="inscritos_seletrix.csv"');
  res.send(csv);
});

app.get('/admin', exigirSenha, (req, res) => res.send(PAINEL_HTML));

const PAINEL_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Seletrix · Painel</title>
<style>
 :root{--tinta:#0f3a4f;--verde:#1b8a5a;--linha:#dde6ea;--suave:#5e7280;--papel:#f5f7f8}
 *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}
 body{background:var(--papel);color:#1b2a32}
 header{background:var(--tinta);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
 header h1{font-size:1.05rem}
 .tabs{display:flex;gap:6px;padding:0 22px;background:#fff;border-bottom:1px solid var(--linha)}
 .tab{padding:14px 18px;cursor:pointer;font-weight:600;color:var(--suave);border-bottom:3px solid transparent}
 .tab.on{color:var(--tinta);border-color:var(--tinta)}
 .wrap{padding:22px;max-width:1100px;margin:0 auto}
 .card{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:20px;margin-bottom:16px}
 label{display:block;font-size:.8rem;font-weight:600;color:#33454f;margin:12px 0 6px}
 input{width:100%;padding:10px 12px;border:1.5px solid var(--linha);border-radius:8px;font-size:.95rem}
 input:focus{outline:none;border-color:#2e6f8e}
 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
 @media(max-width:620px){.grid2{grid-template-columns:1fr}}
 button{background:var(--verde);color:#fff;border:none;border-radius:9px;padding:12px 18px;font-weight:700;cursor:pointer;font-size:.95rem}
 button.sec{background:#eef3f5;color:var(--tinta)}
 button.del{background:#fdecec;color:#a12626;padding:8px 12px}
 button.mini{background:#eef3f5;color:var(--tinta);padding:6px 10px;font-size:.8rem}
 .btn{display:inline-block;background:var(--verde);color:#fff;text-decoration:none;padding:11px 16px;border-radius:9px;font-weight:700;font-size:.9rem}
 .chip{display:inline-block;background:#e8eef1;border-radius:999px;padding:5px 12px;margin:3px 4px;font-size:.85rem}
 table{width:100%;border-collapse:collapse;font-size:.85rem}
 th,td{padding:9px 10px;border-bottom:1px solid #e7edf0;text-align:left;white-space:nowrap}
 th{background:#eef3f5;position:sticky;top:0}
 .scroll{overflow:auto;max-height:65vh;border-radius:10px;border:1px solid var(--linha)}
 .cargo-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--linha)}
 .cargo-item span{flex:1}
 .ok{display:none;background:#e7f6ee;color:#0f6b41;border:1px solid #bfe6d1;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:.9rem}
 .hint{font-size:.8rem;color:var(--suave);margin-top:4px}
 .total{font-weight:700;font-size:1.05rem;margin-bottom:8px}
 .tag{padding:3px 9px;border-radius:999px;font-size:.75rem;font-weight:700}
 .tag.pago{background:#e7f6ee;color:#0f6b41}.tag.aguard{background:#fff4e0;color:#8a5a00}.tag.insc{background:#eef1f4;color:#456}
</style></head><body>
<header><h1>Seletrix — Painel de gestão</h1><a class="btn" href="/" target="_blank">Ver página pública ↗</a></header>
<div class="tabs">
  <div class="tab on" data-t="insc">Inscritos</div>
  <div class="tab" data-t="edital">Edital & Taxa</div>
  <div class="tab" data-t="cargos">Cargos</div>
</div>
<div class="wrap">
  <section id="insc">
    <div class="card">
      <p class="total" id="total">Carregando...</p>
      <div id="resumo"></div>
      <p style="margin:12px 0"><a class="btn" href="/admin/inscritos.csv">⬇️ Baixar Excel (CSV)</a></p>
      <div class="scroll"><table>
        <thead><tr><th>Protocolo</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Status</th><th>Pagamento</th><th>Data</th></tr></thead>
        <tbody id="linhas"></tbody></table></div>
    </div>
  </section>
  <section id="edital" style="display:none">
    <div class="card">
      <h3>Dados do edital</h3>
      <p class="hint">Aparecem no cartão da página pública.</p>
      <div class="grid2">
        <div><label>Título</label><input id="e_titulo"></div>
        <div><label>Órgão / Município</label><input id="e_orgao"></div>
        <div><label>Período de inscrições</label><input id="e_periodo"></div>
        <div><label>Taxa (texto exibido)</label><input id="e_taxa" placeholder="R$ 80,00"></div>
        <div><label>Data da prova</label><input id="e_prova"></div>
        <div><label>Vagas</label><input id="e_vagas"></div>
      </div>
      <label>Link do edital completo (PDF)</label>
      <input id="e_pdf" placeholder="https://...">
      <hr style="margin:20px 0;border:none;border-top:1px solid var(--linha)">
      <h3>Cobrança da taxa (ASAAS)</h3>
      <div class="grid2">
        <div><label>Valor da taxa para cobrança (R$)</label><input id="e_valor" inputmode="decimal" placeholder="80.00"></div>
        <div><label>Dias para pagar (vencimento)</label><input id="e_dias" inputmode="numeric" placeholder="5"></div>
      </div>
      <p class="hint">Se o valor for 0, a inscrição fica sem cobrança. Com valor &gt; 0 e o ASAAS configurado, cada inscrição gera um link de pagamento (Pix, boleto ou cartão).</p>
      <button style="margin-top:16px" onclick="salvar()">Salvar</button>
      <div class="ok" id="ok_edital">Salvo!</div>
    </div>
  </section>
  <section id="cargos" style="display:none">
    <div class="card">
      <h3>Cargos pretendidos</h3>
      <p class="hint">São as opções que o candidato escolhe no formulário.</p>
      <div id="lista_cargos" style="margin:14px 0"></div>
      <label>Adicionar cargo</label>
      <div style="display:flex;gap:8px">
        <input id="novo_cargo" placeholder="Ex.: Analista Administrativo" onkeydown="if(event.key==='Enter')addCargo()">
        <button class="sec" onclick="addCargo()">Adicionar</button>
      </div>
      <button style="margin-top:16px" onclick="salvar()">Salvar cargos</button>
      <div class="ok" id="ok_cargos">Salvo!</div>
    </div>
  </section>
</div>
<script>
  let CFG = { cargos: [] };
  const $ = (id) => document.getElementById(id);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
    ['insc','edital','cargos'].forEach(s => $(s).style.display = s === t.dataset.t ? 'block' : 'none');
  });
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function statusTag(s){
    if(s==='pago')return '<span class="tag pago">Pago</span>';
    if(s==='aguardando_pagamento')return '<span class="tag aguard">Aguardando</span>';
    return '<span class="tag insc">Inscrito</span>';
  }
  async function carregar() {
    CFG = await (await fetch('/api/config')).json();
    $('e_titulo').value=CFG.titulo||''; $('e_orgao').value=CFG.orgao||''; $('e_periodo').value=CFG.periodo||'';
    $('e_taxa').value=CFG.taxa||''; $('e_prova').value=CFG.prova||''; $('e_vagas').value=CFG.vagas||'';
    $('e_pdf').value=CFG.pdf_url||''; $('e_valor').value=CFG.taxa_valor||0; $('e_dias').value=CFG.dias_vencimento||5;
    renderCargos();
    const { inscritos } = await (await fetch('/admin/inscritos.json')).json();
    $('total').textContent = 'Total de inscritos: ' + inscritos.length;
    const pc={}; inscritos.forEach(r=>pc[r.cargo]=(pc[r.cargo]||0)+1);
    const pagos = inscritos.filter(r=>r.status==='pago').length;
    $('resumo').innerHTML = Object.entries(pc).map(([c,n])=>'<span class="chip">'+esc(c)+': <b>'+n+'</b></span>').join(' ')
      + ' <span class="chip">Pagos: <b>'+pagos+'</b></span>';
    $('linhas').innerHTML = inscritos.map(r=>{
      const pag = r.invoice_url ? '<a href="'+esc(r.invoice_url)+'" target="_blank">abrir fatura</a>'
        : '<button class="mini" onclick="gerar('+r.id+')">Gerar cobrança</button>';
      return '<tr><td>'+esc(r.protocolo)+'</td><td>'+esc(r.nome)+'</td><td>'+esc(r.cpf)+'</td><td>'+esc(r.cargo)+'</td><td>'+statusTag(r.status)+'</td><td>'+pag+'</td><td>'+new Date(r.criado_em).toLocaleString('pt-BR')+'</td></tr>';
    }).join('');
  }
  function renderCargos(){ $('lista_cargos').innerHTML=(CFG.cargos||[]).map((c,i)=>'<div class="cargo-item"><span>'+esc(c)+'</span><button class="del" onclick="removeCargo('+i+')">Remover</button></div>').join('')||'<p class="hint">Nenhum cargo.</p>'; }
  function addCargo(){const v=$('novo_cargo').value.trim();if(!v)return;CFG.cargos=CFG.cargos||[];CFG.cargos.push(v);$('novo_cargo').value='';renderCargos();}
  function removeCargo(i){CFG.cargos.splice(i,1);renderCargos();}
  async function gerar(id){
    if(!confirm('Gerar link de pagamento para este inscrito?'))return;
    const r=await fetch('/admin/cobranca/'+id,{method:'POST'});const j=await r.json();
    if(!r.ok){alert(j.erro||'Erro');return;} carregar();
  }
  async function salvar(){
    const payload={titulo:$('e_titulo').value,orgao:$('e_orgao').value,periodo:$('e_periodo').value,taxa:$('e_taxa').value,prova:$('e_prova').value,vagas:$('e_vagas').value,pdf_url:$('e_pdf').value,taxa_valor:$('e_valor').value,dias_vencimento:$('e_dias').value,cargos:CFG.cargos||[]};
    const r=await fetch('/admin/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    CFG=j.config; $('ok_edital').style.display='block'; $('ok_cargos').style.display='block';
    setTimeout(()=>{$('ok_edital').style.display='none';$('ok_cargos').style.display='none';},3000);
  }
  carregar();
</script></body></html>`;

inicializarBanco().catch((e) => console.error('Falha banco:', e.message))
  .finally(() => app.listen(PORT, () => console.log('🚀 Seletrix na porta ' + PORT + ' | ASAAS: ' + (temAsaas ? ASAAS_BASE : 'não configurado'))));
