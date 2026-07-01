// ============================================================
//  SELETRIX — Servidor de inscrições (Fatia 1)
//  Serve a página pública, recebe a inscrição, salva no banco
//  (PostgreSQL) e oferece um painel /admin protegido por senha
//  com exportação dos inscritos em Excel (CSV).
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
      // Render exige SSL. Defina DB_NO_SSL=1 só se usar um banco sem SSL.
      ssl: process.env.DB_NO_SSL === '1' ? false : { rejectUnauthorized: false },
    })
  : null;

async function inicializarBanco() {
  if (!pool) {
    console.warn('⚠️  DATABASE_URL não configurada — as inscrições não serão salvas até você configurar o banco.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidatos (
      id           SERIAL PRIMARY KEY,
      protocolo    TEXT UNIQUE,
      nome         TEXT NOT NULL,
      cpf          TEXT NOT NULL,
      nascimento   DATE,
      email        TEXT,
      telefone     TEXT,
      sexo         TEXT,
      cargo        TEXT NOT NULL,
      pcd          BOOLEAN DEFAULT FALSE,
      nome_social  TEXT,
      cidade       TEXT,
      uf           TEXT,
      status       TEXT DEFAULT 'inscrito',
      criado_em    TIMESTAMPTZ DEFAULT now(),
      UNIQUE (cpf, cargo)
    );
  `);
  console.log('✅ Banco pronto (tabela candidatos).');
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

// ---- Rotas públicas ----------------------------------------
app.get('/health', (req, res) => res.json({ ok: true, banco: temBanco }));

app.post('/api/inscricao', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ erro: 'O sistema ainda não está conectado ao banco de dados. Tente novamente em instantes.' });
  }
  try {
    const b = req.body || {};
    const nome = (b.nome || '').trim();
    const cpf = soDigitos(b.cpf);
    const cargo = (b.cargo || '').trim();
    const email = (b.email || '').trim();
    const telefone = soDigitos(b.telefone);

    // Validações
    if (nome.length < 3) return res.status(400).json({ erro: 'Informe o nome completo.' });
    if (!cpfValido(cpf)) return res.status(400).json({ erro: 'CPF inválido. Confira os números.' });
    if (!cargo) return res.status(400).json({ erro: 'Selecione o cargo desejado.' });
    if (email && !emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    if (telefone && telefone.length < 10) return res.status(400).json({ erro: 'Telefone/WhatsApp inválido.' });

    const r = await pool.query(
      `INSERT INTO candidatos
         (nome, cpf, nascimento, email, telefone, sexo, cargo, pcd, nome_social, cidade, uf)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        nome,
        cpf,
        b.nascimento || null,
        email || null,
        telefone || null,
        b.sexo || null,
        cargo,
        b.pcd === true || b.pcd === 'on' || b.pcd === 'sim',
        (b.nome_social || '').trim() || null,
        (b.cidade || '').trim() || null,
        (b.uf || '').trim().toUpperCase() || null,
      ]
    );
    const id = r.rows[0].id;
    const protocolo = 'SLX2026' + String(id).padStart(5, '0');
    await pool.query('UPDATE candidatos SET protocolo=$1 WHERE id=$2', [protocolo, id]);

    return res.json({ ok: true, protocolo, nome, cargo });
  } catch (e) {
    if (e.code === '23505') {
      // violação da unicidade (cpf, cargo)
      return res.status(409).json({ erro: 'Este CPF já possui inscrição para este cargo.' });
    }
    console.error('Erro ao salvar inscrição:', e.message);
    return res.status(500).json({ erro: 'Não foi possível concluir a inscrição agora. Tente novamente em instantes.' });
  }
});

// ---- Área administrativa (senha) ---------------------------
function exigirSenha(req, res, next) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return res.status(503).send('Defina a variável ADMIN_PASSWORD para acessar o painel.');
  const h = req.headers.authorization || '';
  const [, b64] = h.split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass === senha) return next();
  res.set('WWW-Authenticate', 'Basic realm="Seletrix Admin"');
  return res.status(401).send('Acesso restrito.');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

app.get('/admin', exigirSenha, async (req, res) => {
  if (!pool) return res.send('Banco de dados não configurado ainda.');
  const { rows } = await pool.query('SELECT * FROM candidatos ORDER BY id DESC');
  const porCargo = {};
  rows.forEach((r) => { porCargo[r.cargo] = (porCargo[r.cargo] || 0) + 1; });
  const resumo = Object.entries(porCargo)
    .map(([c, n]) => `<span class="chip">${escapeHtml(c)}: <b>${n}</b></span>`).join(' ');
  const linhas = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.protocolo)}</td>
      <td>${escapeHtml(r.nome)}</td>
      <td>${escapeHtml(r.cpf)}</td>
      <td>${escapeHtml(r.cargo)}</td>
      <td>${escapeHtml(r.email || '')}</td>
      <td>${escapeHtml(r.telefone || '')}</td>
      <td>${r.pcd ? 'Sim' : 'Não'}</td>
      <td>${escapeHtml((r.cidade || '') + (r.uf ? '/' + r.uf : ''))}</td>
      <td>${new Date(r.criado_em).toLocaleString('pt-BR')}</td>
    </tr>`).join('');
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Seletrix · Inscritos</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f6f8f9;color:#1b2a32}
      header{background:#0f3a4f;color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
      header h1{font-size:1.05rem;margin:0}
      .wrap{padding:18px 22px}
      .chip{display:inline-block;background:#e8eef1;border-radius:999px;padding:5px 12px;margin:3px 4px;font-size:.85rem}
      .btn{background:#1b8a5a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;font-size:.9rem}
      table{width:100%;border-collapse:collapse;background:#fff;margin-top:14px;font-size:.85rem;box-shadow:0 1px 4px rgba(0,0,0,.06)}
      th,td{padding:9px 10px;border-bottom:1px solid #e7edf0;text-align:left;white-space:nowrap}
      th{background:#eef3f5;position:sticky;top:0}
      .total{font-weight:700;font-size:1.1rem}
      .scroll{overflow:auto;max-height:70vh;border-radius:10px}
    </style></head><body>
    <header><h1>Seletrix — Inscritos</h1><a class="btn" href="/admin/inscritos.csv">⬇️ Baixar Excel (CSV)</a></header>
    <div class="wrap">
      <p class="total">Total de inscritos: ${rows.length}</p>
      <div>${resumo || '<i>Nenhuma inscrição ainda.</i>'}</div>
      <div class="scroll"><table>
        <thead><tr><th>Protocolo</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>E-mail</th><th>Telefone</th><th>PcD</th><th>Cidade/UF</th><th>Data</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </div></body></html>`);
});

app.get('/admin/inscritos.csv', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const { rows } = await pool.query('SELECT * FROM candidatos ORDER BY id');
  const cols = ['protocolo', 'nome', 'cpf', 'nascimento', 'email', 'telefone', 'sexo', 'cargo', 'pcd', 'nome_social', 'cidade', 'uf', 'status', 'criado_em'];
  const cab = ['Protocolo', 'Nome', 'CPF', 'Nascimento', 'E-mail', 'Telefone', 'Sexo', 'Cargo', 'PcD', 'Nome social', 'Cidade', 'UF', 'Status', 'Inscrito em'];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const linhas = rows.map((r) => cols.map((c) => {
    if (c === 'pcd') return esc(r[c] ? 'Sim' : 'Não');
    if (c === 'criado_em') return esc(new Date(r[c]).toLocaleString('pt-BR'));
    return esc(r[c]);
  }).join(';'));
  const csv = '\uFEFF' + [cab.join(';'), ...linhas].join('\r\n'); // BOM p/ Excel ler acentos
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="inscritos_seletrix.csv"');
  res.send(csv);
});

// ---- Início --------------------------------------------------
inicializarBanco()
  .catch((e) => console.error('Falha ao iniciar banco:', e.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`🚀 Seletrix rodando na porta ${PORT}`));
  });
