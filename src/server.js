// ============================================================
//  SELETRIX — Servidor de inscrições (Fatia 1 + painel de gestão)
//  - Página pública com edital + formulário (configuráveis pelo painel)
//  - Inscrições salvas no PostgreSQL
//  - Painel /admin (senha): editar edital, gerir cargos, ver e
//    exportar inscritos
// ============================================================

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Banco de dados ----------------------------------------
const temBanco = !!process.env.DATABASE_URL;
const pool = temBanco
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_NO_SSL === '1' ? false : { rejectUnauthorized: false },
    })
  : null;

const CONFIG_PADRAO = {
  titulo: 'Edital nº 01/2026',
  orgao: 'Nome do Órgão / Município',
  periodo: '01 a 30/07/2026',
  taxa: 'R$ 80,00',
  prova: '24/08/2026',
  vagas: 'conforme edital',
  pdf_url: '',
  cargos: ['Especialista', 'Mestre'],
};

async function inicializarBanco() {
  if (!pool) {
    console.warn('⚠️  DATABASE_URL não configurada — as inscrições não serão salvas.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidatos (
      id SERIAL PRIMARY KEY, protocolo TEXT UNIQUE, nome TEXT NOT NULL, cpf TEXT NOT NULL,
      nascimento DATE, email TEXT, telefone TEXT, sexo TEXT, cargo TEXT NOT NULL,
      pcd BOOLEAN DEFAULT FALSE, nome_social TEXT, cidade TEXT, uf TEXT,
      status TEXT DEFAULT 'inscrito', criado_em TIMESTAMPTZ DEFAULT now(),
      UNIQUE (cpf, cargo)
    );`);
  await pool.query(`CREATE TABLE IF NOT EXISTS config (id INT PRIMARY KEY DEFAULT 1, dados TEXT NOT NULL);`);
  await pool.query('INSERT INTO config (id, dados) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(CONFIG_PADRAO)]);
  console.log('✅ Banco pronto (candidatos + config).');
}

async function lerConfig() {
  if (!pool) return CONFIG_PADRAO;
  const { rows } = await pool.query('SELECT dados FROM config WHERE id=1');
  if (!rows.length) return CONFIG_PADRAO;
  try { return { ...CONFIG_PADRAO, ...JSON.parse(rows[0].dados) }; }
  catch { return CONFIG_PADRAO; }
}

// ---- Utilidades --------------------------------------------
const soDigitos = (s) => (s || '').replace(/\D/g, '');
function cpfValido(cpf) {
  cpf = soDigitos(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base) => {
    let soma = 0;
    for (let i = 0; i < base; i++) soma += parseInt(cpf[i]) * (base + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Rotas públicas ----------------------------------------
app.get('/health', (req, res) => res.json({ ok: true, banco: temBanco }));

app.get('/api/config', async (req, res) => {
  try { res.json(await lerConfig()); }
  catch { res.json(CONFIG_PADRAO); }
});

app.post('/api/inscricao', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'O sistema ainda não está conectado ao banco. Tente novamente em instantes.' });
  try {
    const b = req.body || {};
    const nome = (b.nome || '').trim();
    const cpf = soDigitos(b.cpf);
    const cargo = (b.cargo || '').trim();
    const email = (b.email || '').trim();
    const telefone = soDigitos(b.telefone);

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
    return res.json({ ok: true, protocolo, nome, cargo });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Este CPF já possui inscrição para este cargo.' });
    console.error('Erro inscrição:', e.message);
    return res.status(500).json({ erro: 'Não foi possível concluir a inscrição agora. Tente novamente.' });
  }
});

// ---- Autenticação do painel --------------------------------
function exigirSenha(req, res, next) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return res.status(503).send('Defina ADMIN_PASSWORD para acessar o painel.');
  const h = req.headers.authorization || '';
  const [, b64] = h.split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass === senha) return next();
  res.set('WWW-Authenticate', 'Basic realm="Seletrix Admin"');
  return res.status(401).send('Acesso restrito.');
}

// ---- APIs do painel ----------------------------------------
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
    let cargos = Array.isArray(b.cargos) ? b.cargos : [];
    cargos = cargos.map((c) => String(c).trim()).filter(Boolean).slice(0, 100);
    if (!cargos.length) return res.status(400).json({ erro: 'Cadastre pelo menos um cargo.' });
    const cfg = {
      titulo: limpar(b.titulo), orgao: limpar(b.orgao), periodo: limpar(b.periodo),
      taxa: limpar(b.taxa), prova: limpar(b.prova), vagas: limpar(b.vagas),
      pdf_url: limpar(b.pdf_url), cargos,
    };
    await pool.query('UPDATE config SET dados=$1 WHERE id=1', [JSON.stringify(cfg)]);
    res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('Erro config:', e.message);
    res.status(500).json({ erro: 'Não foi possível salvar.' });
  }
});

app.get('/admin/inscritos.csv', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const { rows } = await pool.query('SELECT * FROM candidatos ORDER BY id');
  const cols = ['protocolo','nome','cpf','nascimento','email','telefone','sexo','cargo','pcd','nome_social','cidade','uf','status','criado_em'];
  const cab = ['Protocolo','Nome','CPF','Nascimento','E-mail','Telefone','Sexo','Cargo','PcD','Nome social','Cidade','UF','Status','Inscrito em'];
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

// ---- Página do painel --------------------------------------
app.get('/admin', exigirSenha, (req, res) => {
  res.send(PAINEL_HTML);
});

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
 .wrap{padding:22px;max-width:1050px;margin:0 auto}
 .card{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:20px;margin-bottom:16px}
 label{display:block;font-size:.8rem;font-weight:600;color:#33454f;margin:12px 0 6px}
 input{width:100%;padding:10px 12px;border:1.5px solid var(--linha);border-radius:8px;font-size:.95rem}
 input:focus{outline:none;border-color:#2e6f8e}
 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
 @media(max-width:620px){.grid2{grid-template-columns:1fr}}
 button{background:var(--verde);color:#fff;border:none;border-radius:9px;padding:12px 18px;font-weight:700;cursor:pointer;font-size:.95rem}
 button.sec{background:#eef3f5;color:var(--tinta)}
 button.del{background:#fdecec;color:#a12626;padding:8px 12px}
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
</style></head><body>
<header><h1>Seletrix — Painel de gestão</h1><a class="btn" href="/" target="_blank">Ver página pública ↗</a></header>
<div class="tabs">
  <div class="tab on" data-t="insc">Inscritos</div>
  <div class="tab" data-t="edital">Edital</div>
  <div class="tab" data-t="cargos">Cargos</div>
</div>
<div class="wrap">

  <section id="insc">
    <div class="card">
      <p class="total" id="total">Carregando...</p>
      <div id="resumo"></div>
      <p style="margin:12px 0"><a class="btn" href="/admin/inscritos.csv">⬇️ Baixar Excel (CSV)</a></p>
      <div class="scroll"><table>
        <thead><tr><th>Protocolo</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>E-mail</th><th>Telefone</th><th>PcD</th><th>Cidade/UF</th><th>Data</th></tr></thead>
        <tbody id="linhas"></tbody></table></div>
    </div>
  </section>

  <section id="edital" style="display:none">
    <div class="card">
      <h3>Dados do edital</h3>
      <p class="hint">Aparecem no cartão da página pública. Edite e salve.</p>
      <div class="grid2">
        <div><label>Título</label><input id="e_titulo" placeholder="Edital nº 01/2026"></div>
        <div><label>Órgão / Município</label><input id="e_orgao"></div>
        <div><label>Período de inscrições</label><input id="e_periodo"></div>
        <div><label>Taxa</label><input id="e_taxa" placeholder="R$ 80,00"></div>
        <div><label>Data da prova</label><input id="e_prova"></div>
        <div><label>Vagas</label><input id="e_vagas"></div>
      </div>
      <label>Link do edital completo (PDF)</label>
      <input id="e_pdf" placeholder="https://... (cole aqui o link do PDF do edital)">
      <p class="hint">Deixe em branco para esconder o botão "Ler o edital completo".</p>
      <button style="margin-top:16px" onclick="salvar()">Salvar edital</button>
      <div class="ok" id="ok_edital">Salvo! A página pública já está atualizada.</div>
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
      <div class="ok" id="ok_cargos">Salvo! O formulário público já mostra os cargos atualizados.</div>
    </div>
  </section>
</div>
<script>
  let CFG = { cargos: [] };
  const $ = (id) => document.getElementById(id);

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    ['insc','edital','cargos'].forEach(s => $(s).style.display = s === t.dataset.t ? 'block' : 'none');
  });

  async function carregar() {
    CFG = await (await fetch('/api/config')).json();
    $('e_titulo').value = CFG.titulo || ''; $('e_orgao').value = CFG.orgao || '';
    $('e_periodo').value = CFG.periodo || ''; $('e_taxa').value = CFG.taxa || '';
    $('e_prova').value = CFG.prova || ''; $('e_vagas').value = CFG.vagas || '';
    $('e_pdf').value = CFG.pdf_url || '';
    renderCargos();
    const { inscritos } = await (await fetch('/admin/inscritos.json')).json();
    $('total').textContent = 'Total de inscritos: ' + inscritos.length;
    const porCargo = {}; inscritos.forEach(r => porCargo[r.cargo] = (porCargo[r.cargo]||0)+1);
    $('resumo').innerHTML = Object.entries(porCargo).map(([c,n]) => '<span class="chip">'+esc(c)+': <b>'+n+'</b></span>').join(' ') || '<i>Nenhuma inscrição ainda.</i>';
    $('linhas').innerHTML = inscritos.map(r => '<tr><td>'+esc(r.protocolo)+'</td><td>'+esc(r.nome)+'</td><td>'+esc(r.cpf)+'</td><td>'+esc(r.cargo)+'</td><td>'+esc(r.email||'')+'</td><td>'+esc(r.telefone||'')+'</td><td>'+(r.pcd?'Sim':'Não')+'</td><td>'+esc((r.cidade||'')+(r.uf?'/'+r.uf:''))+'</td><td>'+new Date(r.criado_em).toLocaleString('pt-BR')+'</td></tr>').join('');
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

  function renderCargos(){
    $('lista_cargos').innerHTML = (CFG.cargos||[]).map((c,i) =>
      '<div class="cargo-item"><span>'+esc(c)+'</span><button class="del" onclick="removeCargo('+i+')">Remover</button></div>').join('') || '<p class="hint">Nenhum cargo cadastrado.</p>';
  }
  function addCargo(){ const v=$('novo_cargo').value.trim(); if(!v)return; CFG.cargos=CFG.cargos||[]; CFG.cargos.push(v); $('novo_cargo').value=''; renderCargos(); }
  function removeCargo(i){ CFG.cargos.splice(i,1); renderCargos(); }

  async function salvar(){
    const payload = {
      titulo:$('e_titulo').value, orgao:$('e_orgao').value, periodo:$('e_periodo').value,
      taxa:$('e_taxa').value, prova:$('e_prova').value, vagas:$('e_vagas').value,
      pdf_url:$('e_pdf').value, cargos:CFG.cargos||[]
    };
    const r = await fetch('/admin/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j = await r.json();
    if(!r.ok){ alert(j.erro||'Erro ao salvar'); return; }
    CFG = j.config;
    $('ok_edital').style.display='block'; $('ok_cargos').style.display='block';
    setTimeout(()=>{ $('ok_edital').style.display='none'; $('ok_cargos').style.display='none'; },3000);
  }
  carregar();
</script></body></html>`;

// ---- Início --------------------------------------------------
inicializarBanco()
  .catch((e) => console.error('Falha ao iniciar banco:', e.message))
  .finally(() => app.listen(PORT, () => console.log('🚀 Seletrix na porta ' + PORT)));
