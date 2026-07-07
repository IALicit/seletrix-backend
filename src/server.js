// ============================================================
//  SELETRIX — Multi-concursos + inscrições + pagamento (ASAAS)
//  - Vitrine pública lista concursos abertos
//  - Cada concurso tem sua página (edital + ficha de inscrição)
//  - Painel /admin: cria/edita concursos e vê inscritos por concurso
//  - Pagamento via ASAAS (Pix/boleto/cartão) + webhook
// ============================================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v); // DATE volta como 'YYYY-MM-DD' (sem fuso)

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '40mb' })); // PDFs/anexos chegam em base64
app.use(express.urlencoded({ extended: true, limit: '40mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Banco --------------------------------------------------
const temBanco = !!process.env.DATABASE_URL;
const pool = temBanco ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_NO_SSL === '1' ? false : { rejectUnauthorized: false },
}) : null;

function slugify(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'concurso';
}

async function inicializarBanco() {
  if (!pool) { console.warn('⚠️  DATABASE_URL não configurada.'); return; }
  // Tabela de candidatos (já existia)
  await pool.query(`CREATE TABLE IF NOT EXISTS candidatos (
    id SERIAL PRIMARY KEY, protocolo TEXT UNIQUE, nome TEXT NOT NULL, cpf TEXT NOT NULL,
    nascimento DATE, email TEXT, telefone TEXT, sexo TEXT, cargo TEXT NOT NULL,
    pcd BOOLEAN DEFAULT FALSE, nome_social TEXT, cidade TEXT, uf TEXT,
    status TEXT DEFAULT 'inscrito', criado_em TIMESTAMPTZ DEFAULT now());`);
  for (const col of [
    'asaas_customer_id TEXT', 'asaas_payment_id TEXT', 'invoice_url TEXT', 'concurso_id INT', 'sala_id INT'
  ]) {
    await pool.query(`ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // remove restrição antiga (cpf,cargo) que atrapalha multi-concurso
  await pool.query(`ALTER TABLE candidatos DROP CONSTRAINT IF EXISTS candidatos_cpf_cargo_key`).catch(() => {});
  // Tabela de concursos
  await pool.query(`CREATE TABLE IF NOT EXISTS concursos (
    id SERIAL PRIMARY KEY, slug TEXT UNIQUE, titulo TEXT, orgao TEXT, periodo TEXT,
    taxa TEXT, prova TEXT, vagas TEXT, pdf_url TEXT,
    taxa_valor NUMERIC DEFAULT 0, dias_vencimento INT DEFAULT 5,
    cargos TEXT DEFAULT '[]', aberto BOOLEAN DEFAULT TRUE, criado_em TIMESTAMPTZ DEFAULT now());`);
  // Config antiga (para migração)
  await pool.query(`CREATE TABLE IF NOT EXISTS config (id INT PRIMARY KEY DEFAULT 1, dados TEXT NOT NULL);`);
  // PDF do edital guardado no banco (permanente)
  await pool.query(`CREATE TABLE IF NOT EXISTS edital_pdf (concurso_id INT PRIMARY KEY, filename TEXT, dados BYTEA, tamanho INT, criado_em TIMESTAMPTZ DEFAULT now());`);
  // Brasão / logo do órgão (imagem) por concurso
  await pool.query(`CREATE TABLE IF NOT EXISTS brasao (concurso_id INT PRIMARY KEY, mime TEXT, dados BYTEA, tamanho INT, criado_em TIMESTAMPTZ DEFAULT now());`);
  await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS brasao_url TEXT`);
  // Campos extras do concurso (gratuito / títulos)
  for (const col of ['gratuito BOOLEAN DEFAULT FALSE', 'pede_titulos BOOLEAN DEFAULT FALSE', "tipos_titulos TEXT DEFAULT '[]'"]) {
    await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // Datas para situação automática (abertas / andamento / encerrado)
  for (const col of ['data_inicio DATE', 'data_fim DATE', 'data_encerramento DATE']) {
    await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // Janela de envio de títulos (o candidato só envia nesse período)
  for (const col of ['titulos_inicio DATE', 'titulos_fim DATE']) {
    await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // Data + hora (Brasília) da janela de títulos — 'YYYY-MM-DDTHH:MM'
  for (const col of ['titulos_inicio_dt TEXT', 'titulos_fim_dt TEXT']) {
    await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await pool.query(`UPDATE concursos SET titulos_inicio_dt = to_char(titulos_inicio,'YYYY-MM-DD')||'T00:00' WHERE titulos_inicio IS NOT NULL AND (titulos_inicio_dt IS NULL OR titulos_inicio_dt='')`).catch(() => {});
  await pool.query(`UPDATE concursos SET titulos_fim_dt = to_char(titulos_fim,'YYYY-MM-DD')||'T23:59' WHERE titulos_fim IS NOT NULL AND (titulos_fim_dt IS NULL OR titulos_fim_dt='')`).catch(() => {});
  // Anexos de títulos enviados pelos candidatos
  await pool.query(`CREATE TABLE IF NOT EXISTS titulos (id SERIAL PRIMARY KEY, candidato_id INT, tipo TEXT, filename TEXT, mime TEXT, dados BYTEA, tamanho INT, criado_em TIMESTAMPTZ DEFAULT now());`);
  // Login do candidato (CPF + senha) para a Área do Candidato
  await pool.query(`CREATE TABLE IF NOT EXISTS candidato_login (cpf TEXT PRIMARY KEY, senha_hash TEXT, nome TEXT, criado_em TIMESTAMPTZ DEFAULT now());`);
  // Etapas do concurso + arquivos de cada etapa + documentos avulsos (retificações)
  await pool.query(`CREATE TABLE IF NOT EXISTS etapas (id SERIAL PRIMARY KEY, concurso_id INT, nome TEXT, ordem INT DEFAULT 0, criado_em TIMESTAMPTZ DEFAULT now());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS etapa_arquivos (id SERIAL PRIMARY KEY, etapa_id INT, filename TEXT, mime TEXT, dados BYTEA, tamanho INT, criado_em TIMESTAMPTZ DEFAULT now());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS documentos (id SERIAL PRIMARY KEY, concurso_id INT, titulo TEXT, filename TEXT, mime TEXT, dados BYTEA, tamanho INT, criado_em TIMESTAMPTZ DEFAULT now());`);
  // Locação: escolas e salas por concurso
  await pool.query(`CREATE TABLE IF NOT EXISTS escolas (id SERIAL PRIMARY KEY, concurso_id INT, nome TEXT, endereco TEXT, criado_em TIMESTAMPTZ DEFAULT now());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS salas (id SERIAL PRIMARY KEY, escola_id INT, nome TEXT, capacidade INT DEFAULT 0, obs TEXT, criado_em TIMESTAMPTZ DEFAULT now());`);

  // Migração: se não há concursos, cria o primeiro a partir da config antiga
  const { rows: qc } = await pool.query('SELECT COUNT(*)::int n FROM concursos');
  if (qc[0].n === 0) {
    let cfg = { titulo: 'Edital nº 01/2026', orgao: '', periodo: '', taxa: '', prova: '', vagas: '', pdf_url: '', taxa_valor: 0, dias_vencimento: 5, cargos: ['Especialista', 'Mestre'] };
    const { rows: rc } = await pool.query('SELECT dados FROM config WHERE id=1');
    if (rc.length) { try { cfg = { ...cfg, ...JSON.parse(rc[0].dados) }; } catch {} }
    const slug = slugify(cfg.titulo);
    const ins = await pool.query(
      `INSERT INTO concursos (slug,titulo,orgao,periodo,taxa,prova,vagas,pdf_url,taxa_valor,dias_vencimento,cargos,aberto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE) RETURNING id`,
      [slug, cfg.titulo, cfg.orgao, cfg.periodo, cfg.taxa, cfg.prova, cfg.vagas, cfg.pdf_url,
       Number(cfg.taxa_valor) || 0, parseInt(cfg.dias_vencimento) || 5, JSON.stringify(cfg.cargos || [])]);
    const cid = ins.rows[0].id;
    await pool.query('UPDATE candidatos SET concurso_id=$1 WHERE concurso_id IS NULL', [cid]);
    console.log('✅ Migração: concurso inicial criado (id ' + cid + ').');
  }
  console.log('✅ Banco pronto (concursos + candidatos).');
}

function hojeBR() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function agoraBR() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16); } // 'YYYY-MM-DDTHH:MM'
function calcSituacao(di, df, de, hoje) {
  if (de && hoje > de) return 'encerrado';
  if (df && hoje > df) return 'andamento';
  if (di && hoje < di) return 'em_breve';
  return 'abertas';
}
function calcPode(di, df, hoje) {
  if (di && hoje < di) return false; // ainda não começou
  if (df && hoje > df) return false; // já encerrou
  return true;
}
function calcTitulos(pede, ti, tf, hoje) {
  if (!pede) return { status: 'sem', pode: false };
  if (ti && hoje < ti) return { status: 'antes', pode: false };
  if (tf && hoje > tf) return { status: 'depois', pode: false };
  return { status: 'aberto', pode: true };
}
function parseConcurso(r) {
  let cargos = []; try { cargos = JSON.parse(r.cargos || '[]'); } catch {}
  let tipos = []; try { tipos = JSON.parse(r.tipos_titulos || '[]'); } catch {}
  const di = r.data_inicio || null, df = r.data_fim || null, de = r.data_encerramento || null;
  const ti = r.titulos_inicio_dt || null, tf = r.titulos_fim_dt || null;
  const hoje = hojeBR();
  const tc = calcTitulos(!!r.pede_titulos, ti, tf, agoraBR());
  return {
    id: r.id, slug: r.slug, titulo: r.titulo, orgao: r.orgao, periodo: r.periodo, taxa: r.taxa,
    prova: r.prova, vagas: r.vagas, pdf_url: r.pdf_url, taxa_valor: Number(r.taxa_valor) || 0,
    dias_vencimento: r.dias_vencimento || 5, cargos, aberto: r.aberto,
    gratuito: !!r.gratuito, pede_titulos: !!r.pede_titulos, tipos_titulos: tipos,
    data_inicio: di, data_fim: df, data_encerramento: de,
    titulos_inicio: ti, titulos_fim: tf, titulos_status: tc.status, pode_titulos: tc.pode,
    brasao_url: r.brasao_url || null,
    situacao: calcSituacao(di, df, de, hoje), pode_inscrever: calcPode(di, df, hoje),
  };
}
async function lerConcursoPorChave(key) {
  if (!pool) return null;
  const numerico = /^\d+$/.test(String(key));
  const { rows } = await pool.query(
    `SELECT * FROM concursos WHERE ${numerico ? 'id=$1' : 'slug=$1'} LIMIT 1`, [key]);
  return rows.length ? parseConcurso(rows[0]) : null;
}

// ---- ASAAS --------------------------------------------------
const ASAAS_BASE = process.env.ASAAS_ENV === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
const temAsaas = !!process.env.ASAAS_API_KEY;
async function asaas(p, method, body) {
  const r = await fetch(ASAAS_BASE + p, {
    method, headers: { 'Content-Type': 'application/json', 'access_token': process.env.ASAAS_API_KEY, 'User-Agent': 'Seletrix' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.errors && j.errors[0] && j.errors[0].description) || ('ASAAS HTTP ' + r.status));
  return j;
}
async function criarCobranca(cand, concurso) {
  const cliente = await asaas('/customers', 'POST', { name: cand.nome, cpfCnpj: cand.cpf, email: cand.email || undefined, mobilePhone: cand.telefone || undefined });
  const dias = parseInt(concurso.dias_vencimento) || 5;
  const due = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  const base = (process.env.PUBLIC_URL || '').trim();
  const cobranca = await asaas('/payments', 'POST', {
    customer: cliente.id, billingType: 'UNDEFINED', value: Number(concurso.taxa_valor),
    dueDate: due, description: (concurso.titulo || 'Inscrição') + ' — ' + cand.cargo,
    externalReference: cand.protocolo, callback: base ? { successUrl: base, autoRedirect: false } : undefined,
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
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(senha), salt, 32).toString('hex');
  return salt + ':' + dk;
}
function verificaSenha(senha, armazenado) {
  try {
    const [salt, dk] = String(armazenado || '').split(':');
    if (!salt || !dk) return false;
    const calc = crypto.scryptSync(String(senha), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(dk, 'hex'));
  } catch { return false; }
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function mimeDe(buf) {
  if (!buf || buf.length < 4) return '';
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  return '';
}
function decodeB64(dataBase64) {
  let d = String(dataBase64 || ''); const v = d.indexOf(',');
  if (v > -1 && d.slice(0, v).includes('base64')) d = d.slice(v + 1);
  return d ? Buffer.from(d, 'base64') : null;
}
function servirArquivo(res, row) {
  if (!row || !row.dados) { res.status(404).send('Não encontrado.'); return; }
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + String(row.filename || 'arquivo').replace(/[^\w.\-]/g, '_') + '"');
  res.send(row.dados);
}

// ---- Rotas públicas ----------------------------------------
app.get('/health', (req, res) => res.json({ ok: true, banco: temBanco, asaas: temAsaas, versao: 'listas-v1' }));

app.get('/api/concursos', async (req, res) => {
  if (!pool) return res.json({ concursos: [] });
  const { rows } = await pool.query('SELECT * FROM concursos WHERE aberto=TRUE ORDER BY criado_em DESC');
  res.json({ concursos: rows.map(parseConcurso).map((c) => ({ slug: c.slug, titulo: c.titulo, orgao: c.orgao, periodo: c.periodo, taxa: c.taxa, vagas: c.vagas, gratuito: c.gratuito, prova: c.prova, situacao: c.situacao, pode_inscrever: c.pode_inscrever, data_inicio: c.data_inicio, brasao_url: c.brasao_url })) });
});

app.get('/api/concurso/:chave', async (req, res) => {
  const c = await lerConcursoPorChave(req.params.chave);
  if (!c) return res.status(404).json({ erro: 'Concurso não encontrado.' });
  res.json(c);
});

// Serve o PDF do edital (guardado no banco)
app.get('/edital/:chave.pdf', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const c = await lerConcursoPorChave(req.params.chave);
  if (!c) return res.status(404).send('Concurso não encontrado.');
  const { rows } = await pool.query('SELECT dados FROM edital_pdf WHERE concurso_id=$1', [c.id]);
  if (!rows.length || !rows[0].dados) return res.status(404).send('Edital não enviado.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="edital.pdf"');
  res.send(rows[0].dados);
});

// Serve o brasão / logo do órgão (imagem guardada no banco)
app.get('/brasao/:chave', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const c = await lerConcursoPorChave(req.params.chave);
  if (!c) return res.status(404).send('Não encontrado.');
  const { rows } = await pool.query('SELECT mime,dados FROM brasao WHERE concurso_id=$1', [c.id]);
  if (!rows.length || !rows[0].dados) return res.status(404).send('Sem brasão.');
  res.setHeader('Content-Type', rows[0].mime || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(rows[0].dados);
});

// Etapas + documentos de um concurso (público, só metadados)
app.get('/api/concurso/:chave/etapas', async (req, res) => {
  if (!pool) return res.json({ etapas: [], documentos: [] });
  const c = await lerConcursoPorChave(req.params.chave);
  if (!c) return res.status(404).json({ etapas: [], documentos: [] });
  const et = await pool.query('SELECT id,nome FROM etapas WHERE concurso_id=$1 ORDER BY ordem,id', [c.id]);
  const ar = await pool.query('SELECT ea.id,ea.etapa_id,ea.filename,ea.mime FROM etapa_arquivos ea JOIN etapas e ON e.id=ea.etapa_id WHERE e.concurso_id=$1 ORDER BY ea.id', [c.id]);
  const dc = await pool.query('SELECT id,titulo,filename,mime FROM documentos WHERE concurso_id=$1 ORDER BY id DESC', [c.id]);
  const etapas = et.rows.map((e) => ({ nome: e.nome, arquivos: ar.rows.filter((a) => a.etapa_id === e.id).map((a) => ({ id: a.id, filename: a.filename, mime: a.mime })) }));
  res.json({ etapas, documentos: dc.rows });
});

// Download público dos arquivos de etapa e documentos
app.get('/arquivo/etapa/:id', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT filename,mime,dados FROM etapa_arquivos WHERE id=$1', [req.params.id]);
  servirArquivo(res, rows[0]);
});
app.get('/arquivo/documento/:id', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT filename,mime,dados FROM documentos WHERE id=$1', [req.params.id]);
  servirArquivo(res, rows[0]);
});

app.post('/api/inscricao', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Sistema não conectado ao banco. Tente novamente.' });
  try {
    const b = req.body || {};
    const concurso = await lerConcursoPorChave(b.concurso || '');
    if (!concurso) return res.status(400).json({ erro: 'Concurso inválido.' });
    if (!concurso.pode_inscrever) {
      const msg = concurso.situacao === 'em_breve' ? 'As inscrições para este concurso ainda não começaram.'
        : (concurso.situacao === 'encerrado' ? 'Este processo seletivo foi encerrado.'
          : 'As inscrições para este concurso estão encerradas.');
      return res.status(400).json({ erro: msg });
    }

    const nome = (b.nome || '').trim(), cpf = soDigitos(b.cpf), cargo = (b.cargo || '').trim();
    const email = (b.email || '').trim(), telefone = soDigitos(b.telefone);
    if (nome.length < 3) return res.status(400).json({ erro: 'Informe o nome completo.' });
    if (!cpfValido(cpf)) return res.status(400).json({ erro: 'CPF inválido. Confira os números.' });
    if (!cargo) return res.status(400).json({ erro: 'Selecione o cargo desejado.' });
    if (email && !emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    if (telefone && telefone.length < 10) return res.status(400).json({ erro: 'Telefone/WhatsApp inválido.' });

    const dup = await pool.query('SELECT protocolo FROM candidatos WHERE cpf=$1 AND concurso_id=$2 LIMIT 1', [cpf, concurso.id]);
    if (dup.rows.length) return res.status(409).json({ erro: 'Este CPF já possui inscrição neste concurso. Protocolo: ' + dup.rows[0].protocolo });

    // Senha de acesso à Área do Candidato (cria na 1ª inscrição; confere nas próximas)
    const senha = String(b.senha || '');
    if (senha.length < 4) return res.status(400).json({ erro: 'Crie uma senha de acesso com pelo menos 4 caracteres.' });
    const lg = await pool.query('SELECT senha_hash FROM candidato_login WHERE cpf=$1', [cpf]);
    if (lg.rows.length) {
      if (!verificaSenha(senha, lg.rows[0].senha_hash))
        return res.status(409).json({ erro: 'Este CPF já tem uma senha cadastrada. Use a mesma senha que você criou na primeira inscrição.' });
    } else {
      await pool.query('INSERT INTO candidato_login (cpf,senha_hash,nome) VALUES ($1,$2,$3) ON CONFLICT (cpf) DO NOTHING', [cpf, hashSenha(senha), nome]);
    }

    const r = await pool.query(
      `INSERT INTO candidatos (nome,cpf,nascimento,email,telefone,sexo,cargo,pcd,nome_social,cidade,uf,concurso_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [nome, cpf, b.nascimento || null, email || null, telefone || null, b.sexo || null, cargo,
       b.pcd === true || b.pcd === 'on' || b.pcd === 'sim', (b.nome_social || '').trim() || null,
       (b.cidade || '').trim() || null, (b.uf || '').trim().toUpperCase() || null, concurso.id]);
    const id = r.rows[0].id;
    const protocolo = 'SLX2026' + String(id).padStart(5, '0');
    await pool.query('UPDATE candidatos SET protocolo=$1 WHERE id=$2', [protocolo, id]);

    // Anexos de títulos (se o concurso pedir)
    if (concurso.pede_titulos && Array.isArray(b.titulos)) {
      for (const t of b.titulos.slice(0, 5)) {
        try {
          let d = String(t.dataBase64 || ''); const v = d.indexOf(','); if (v > -1 && d.slice(0, v).includes('base64')) d = d.slice(v + 1);
          if (!d) continue;
          const buf = Buffer.from(d, 'base64');
          if (buf.length > 5 * 1024 * 1024) continue;
          const mime = buf.slice(0, 4).toString('latin1') === '%PDF' ? 'application/pdf'
            : (buf[0] === 0xFF && buf[1] === 0xD8 ? 'image/jpeg'
              : (buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : ''));
          if (!mime) continue;
          await pool.query('INSERT INTO titulos (candidato_id,tipo,filename,mime,dados,tamanho) VALUES ($1,$2,$3,$4,$5,$6)',
            [id, String(t.tipo || '').slice(0, 120), String(t.filename || 'arquivo').slice(0, 200), mime, buf, buf.length]);
        } catch (e) { console.error('titulo:', e.message); }
      }
    }

    const cobrar = temAsaas && !concurso.gratuito && Number(concurso.taxa_valor) > 0;
    if (!cobrar) return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: null, cobrar: false });
    try {
      const pay = await criarCobranca({ nome, cpf, email, telefone, cargo, protocolo }, concurso);
      await pool.query('UPDATE candidatos SET status=$1, asaas_customer_id=$2, asaas_payment_id=$3, invoice_url=$4 WHERE id=$5',
        ['aguardando_pagamento', pay.customerId, pay.paymentId, pay.invoiceUrl, id]);
      return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: pay.invoiceUrl, cobrar: true });
    } catch (e) {
      console.error('ASAAS falhou:', e.message);
      await pool.query("UPDATE candidatos SET status='aguardando_pagamento' WHERE id=$1", [id]);
      return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: null, cobrar: true, avisoPagamento: true });
    }
  } catch (e) {
    console.error('Erro inscrição:', e.message);
    return res.status(500).json({ erro: 'Não foi possível concluir a inscrição. Tente novamente.' });
  }
});

// ---- Área do Candidato (login CPF + senha) -----------------
app.post('/api/candidato/login', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const cpf = soDigitos((req.body || {}).cpf);
  const senha = String((req.body || {}).senha || '');
  if (!cpfValido(cpf) || !senha) return res.status(400).json({ erro: 'Informe CPF e senha.' });
  const lg = await pool.query('SELECT senha_hash, nome FROM candidato_login WHERE cpf=$1', [cpf]);
  if (!lg.rows.length || !verificaSenha(senha, lg.rows[0].senha_hash))
    return res.status(401).json({ erro: 'CPF ou senha inválidos, ou você ainda não fez nenhuma inscrição.' });
  const { rows } = await pool.query(
    `SELECT k.id, k.protocolo, k.cargo, k.status, k.invoice_url, k.criado_em,
            c.titulo AS concurso, c.slug, c.gratuito, c.prova,
            c.pede_titulos, c.tipos_titulos, c.titulos_inicio_dt, c.titulos_fim_dt
     FROM candidatos k LEFT JOIN concursos c ON c.id=k.concurso_id
     WHERE k.cpf=$1 ORDER BY k.id DESC`, [cpf]);
  const ids = rows.map((r) => r.id);
  const porCand = {};
  if (ids.length) {
    const t = await pool.query('SELECT id, candidato_id, tipo, filename FROM titulos WHERE candidato_id = ANY($1::int[]) ORDER BY id', [ids]);
    t.rows.forEach((x) => { (porCand[x.candidato_id] = porCand[x.candidato_id] || []).push({ id: x.id, tipo: x.tipo, filename: x.filename }); });
  }
  const agora = agoraBR();
  const inscricoes = rows.map((r) => {
    let tipos = []; try { tipos = JSON.parse(r.tipos_titulos || '[]'); } catch {}
    const ti = r.titulos_inicio_dt || null, tf = r.titulos_fim_dt || null;
    const tc = calcTitulos(!!r.pede_titulos, ti, tf, agora);
    return {
      id: r.id, protocolo: r.protocolo, cargo: r.cargo, status: r.status, invoice_url: r.invoice_url, criado_em: r.criado_em,
      concurso: r.concurso, slug: r.slug, gratuito: r.gratuito, prova: r.prova,
      pede_titulos: !!r.pede_titulos, tipos_titulos: tipos, titulos_inicio: ti, titulos_fim: tf,
      titulos_status: tc.status, pode_titulos: tc.pode, titulos: porCand[r.id] || [],
    };
  });
  res.json({ ok: true, nome: lg.rows[0].nome, inscricoes });
});

// Candidato envia um título (só dentro da janela)
async function autenticaCandidato(b) {
  const cpf = soDigitos((b || {}).cpf), senha = String((b || {}).senha || '');
  if (!cpfValido(cpf) || !senha) return null;
  const lg = await pool.query('SELECT senha_hash FROM candidato_login WHERE cpf=$1', [cpf]);
  if (!lg.rows.length || !verificaSenha(senha, lg.rows[0].senha_hash)) return null;
  return cpf;
}
app.post('/api/candidato/titulo', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const b = req.body || {};
  const cpf = await autenticaCandidato(b);
  if (!cpf) return res.status(401).json({ erro: 'Sessão inválida. Entre novamente.' });
  const cand = await pool.query('SELECT id, concurso_id FROM candidatos WHERE id=$1 AND cpf=$2', [parseInt(b.inscricao_id), cpf]);
  if (!cand.rows.length) return res.status(404).json({ erro: 'Inscrição não encontrada.' });
  const concurso = await lerConcursoPorChave(String(cand.rows[0].concurso_id));
  if (!concurso || !concurso.pode_titulos) return res.status(403).json({ erro: 'O envio de títulos não está aberto neste período.' });
  const cnt = await pool.query('SELECT COUNT(*)::int n FROM titulos WHERE candidato_id=$1', [cand.rows[0].id]);
  if (cnt.rows[0].n >= 10) return res.status(400).json({ erro: 'Limite de 10 títulos por inscrição atingido.' });
  const buf = decodeB64(b.dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione um arquivo.' });
  const mime = mimeDe(buf);
  if (!mime) return res.status(400).json({ erro: 'Formato inválido. Envie PDF, JPG ou PNG.' });
  if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo muito grande (máx. 5 MB).' });
  await pool.query('INSERT INTO titulos (candidato_id,tipo,filename,mime,dados,tamanho) VALUES ($1,$2,$3,$4,$5,$6)',
    [cand.rows[0].id, String(b.tipo || '').slice(0, 120), String(b.filename || 'arquivo').slice(0, 200), mime, buf, buf.length]);
  res.json({ ok: true });
});
app.post('/api/candidato/titulo/excluir', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const b = req.body || {};
  const cpf = await autenticaCandidato(b);
  if (!cpf) return res.status(401).json({ erro: 'Sessão inválida. Entre novamente.' });
  const t = await pool.query('SELECT t.id, k.concurso_id FROM titulos t JOIN candidatos k ON k.id=t.candidato_id WHERE t.id=$1 AND k.cpf=$2', [parseInt(b.titulo_id), cpf]);
  if (!t.rows.length) return res.status(404).json({ erro: 'Título não encontrado.' });
  const concurso = await lerConcursoPorChave(String(t.rows[0].concurso_id));
  if (!concurso || !concurso.pode_titulos) return res.status(403).json({ erro: 'Fora do período de envio; não é possível remover.' });
  await pool.query('DELETE FROM titulos WHERE id=$1', [t.rows[0].id]);
  res.json({ ok: true });
});

// ---- Webhook ASAAS -----------------------------------------
app.post('/webhook/asaas', async (req, res) => {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (token && req.headers['asaas-access-token'] !== token) return res.status(401).json({ erro: 'token inválido' });
  try {
    const { event, payment } = req.body || {};
    if (pool && payment && (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED')) {
      await pool.query("UPDATE candidatos SET status='pago' WHERE asaas_payment_id=$1 OR protocolo=$2", [payment.id, payment.externalReference || '']);
    }
  } catch (e) { console.error('Webhook erro:', e.message); }
  res.json({ ok: true });
});

// ---- Painel (senha) ----------------------------------------
function exigirSenha(req, res, next) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return res.status(503).send('Defina ADMIN_PASSWORD.');
  const [, b64] = (req.headers.authorization || '').split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass === senha) return next();
  res.set('WWW-Authenticate', 'Basic realm="Seletrix Admin"');
  return res.status(401).send('Acesso restrito.');
}

app.get('/admin/concursos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ concursos: [] });
  const { rows } = await pool.query(`
    SELECT c.*, 
      (SELECT COUNT(*)::int FROM candidatos k WHERE k.concurso_id=c.id) AS inscritos,
      (SELECT COUNT(*)::int FROM candidatos k WHERE k.concurso_id=c.id AND k.status='pago') AS pagos
    FROM concursos c ORDER BY c.criado_em DESC`);
  res.json({ concursos: rows.map((r) => ({ ...parseConcurso(r), inscritos: r.inscritos, pagos: r.pagos })) });
});

app.post('/admin/concurso', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  try {
    const b = req.body || {};
    const lim = (v) => String(v == null ? '' : v).trim().slice(0, 300);
    let cargos = (Array.isArray(b.cargos) ? b.cargos : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 100);
    let tipos = (Array.isArray(b.tipos_titulos) ? b.tipos_titulos : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 50);
    if (!lim(b.titulo)) return res.status(400).json({ erro: 'Informe o título do concurso.' });
    if (!cargos.length) return res.status(400).json({ erro: 'Cadastre pelo menos um cargo.' });
    const bool = (v) => v === true || v === 'true' || v === 'on';
    const dnull = (v) => { v = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
    const dtnull = (v) => { v = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : null; };
    const dados = {
      titulo: lim(b.titulo), orgao: lim(b.orgao), periodo: lim(b.periodo), taxa: lim(b.taxa),
      prova: lim(b.prova), vagas: lim(b.vagas), pdf_url: lim(b.pdf_url),
      taxa_valor: Math.max(0, Number(String(b.taxa_valor).replace(',', '.')) || 0),
      dias_vencimento: Math.max(1, parseInt(b.dias_vencimento) || 5),
      aberto: bool(b.aberto), gratuito: bool(b.gratuito), pede_titulos: bool(b.pede_titulos),
      data_inicio: dnull(b.data_inicio), data_fim: dnull(b.data_fim), data_encerramento: dnull(b.data_encerramento),
      titulos_inicio_dt: dtnull(b.titulos_inicio), titulos_fim_dt: dtnull(b.titulos_fim),
      cargos,
    };
    // slug único
    let base = slugify(dados.titulo), slug = base, n = 2;
    while (true) {
      const q = await pool.query('SELECT id FROM concursos WHERE slug=$1 AND id<>$2', [slug, b.id || 0]);
      if (!q.rows.length) break; slug = base + '-' + (n++);
    }
    if (b.id) {
      await pool.query(`UPDATE concursos SET slug=$1,titulo=$2,orgao=$3,periodo=$4,taxa=$5,prova=$6,vagas=$7,pdf_url=$8,taxa_valor=$9,dias_vencimento=$10,cargos=$11,aberto=$12,gratuito=$13,pede_titulos=$14,tipos_titulos=$15,data_inicio=$16,data_fim=$17,data_encerramento=$18,titulos_inicio_dt=$19,titulos_fim_dt=$20 WHERE id=$21`,
        [slug, dados.titulo, dados.orgao, dados.periodo, dados.taxa, dados.prova, dados.vagas, dados.pdf_url, dados.taxa_valor, dados.dias_vencimento, JSON.stringify(cargos), dados.aberto, dados.gratuito, dados.pede_titulos, JSON.stringify(tipos), dados.data_inicio, dados.data_fim, dados.data_encerramento, dados.titulos_inicio_dt, dados.titulos_fim_dt, b.id]);
      return res.json({ ok: true, id: b.id, slug });
    } else {
      const ins = await pool.query(`INSERT INTO concursos (slug,titulo,orgao,periodo,taxa,prova,vagas,pdf_url,taxa_valor,dias_vencimento,cargos,aberto,gratuito,pede_titulos,tipos_titulos,data_inicio,data_fim,data_encerramento,titulos_inicio_dt,titulos_fim_dt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
        [slug, dados.titulo, dados.orgao, dados.periodo, dados.taxa, dados.prova, dados.vagas, dados.pdf_url, dados.taxa_valor, dados.dias_vencimento, JSON.stringify(cargos), dados.aberto, dados.gratuito, dados.pede_titulos, JSON.stringify(tipos), dados.data_inicio, dados.data_fim, dados.data_encerramento, dados.titulos_inicio_dt, dados.titulos_fim_dt]);
      return res.json({ ok: true, id: ins.rows[0].id, slug });
    }
  } catch (e) { console.error('concurso:', e.message); res.status(500).json({ erro: 'Não foi possível salvar.' }); }
});

// Upload do PDF do edital (base64) -> guarda no banco e aponta o pdf_url do concurso
app.post('/admin/concurso/:id/edital', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  try {
    const id = parseInt(req.params.id);
    const c = await lerConcursoPorChave(String(id));
    if (!c) return res.status(404).json({ erro: 'Concurso não encontrado.' });
    let b64 = String((req.body || {}).dataBase64 || '');
    const virg = b64.indexOf(',');
    if (virg > -1 && b64.slice(0, virg).includes('base64')) b64 = b64.slice(virg + 1);
    if (!b64) return res.status(400).json({ erro: 'Selecione um arquivo PDF.' });
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 4 || buf.slice(0, 4).toString('latin1') !== '%PDF')
      return res.status(400).json({ erro: 'O arquivo precisa ser um PDF válido.' });
    if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ erro: 'PDF muito grande (máximo 15 MB).' });
    await pool.query(
      `INSERT INTO edital_pdf (concurso_id, filename, dados, tamanho) VALUES ($1,$2,$3,$4)
       ON CONFLICT (concurso_id) DO UPDATE SET filename=EXCLUDED.filename, dados=EXCLUDED.dados, tamanho=EXCLUDED.tamanho, criado_em=now()`,
      [id, String((req.body || {}).filename || 'edital.pdf').slice(0, 200), buf, buf.length]);
    const pdf_url = '/edital/' + c.slug + '.pdf';
    await pool.query('UPDATE concursos SET pdf_url=$1 WHERE id=$2', [pdf_url, id]);
    res.json({ ok: true, pdf_url });
  } catch (e) { console.error('upload edital:', e.message); res.status(500).json({ erro: 'Não foi possível enviar o PDF.' }); }
});

// Títulos anexados por um candidato (listar + baixar)
app.get('/admin/inscrito/:id/titulos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ titulos: [] });
  const { rows } = await pool.query('SELECT id,tipo,filename,mime,tamanho FROM titulos WHERE candidato_id=$1 ORDER BY id', [req.params.id]);
  res.json({ titulos: rows });
});
app.get('/admin/titulo/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT filename,mime,dados FROM titulos WHERE id=$1', [req.params.id]);
  if (!rows.length || !rows[0].dados) return res.status(404).send('Não encontrado.');
  res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + String(rows[0].filename || 'arquivo').replace(/[^\w.\-]/g, '_') + '"');
  res.send(rows[0].dados);
});

// Upload / remoção do brasão do órgão
app.post('/admin/concurso/:id/brasao', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const id = parseInt(req.params.id);
  const c = await lerConcursoPorChave(String(id));
  if (!c) return res.status(404).json({ erro: 'Concurso não encontrado.' });
  const buf = decodeB64((req.body || {}).dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione uma imagem.' });
  const mime = mimeDe(buf);
  if (mime !== 'image/jpeg' && mime !== 'image/png') return res.status(400).json({ erro: 'Envie uma imagem JPG ou PNG.' });
  if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem muito grande (máx. 2 MB).' });
  await pool.query(`INSERT INTO brasao (concurso_id,mime,dados,tamanho) VALUES ($1,$2,$3,$4)
    ON CONFLICT (concurso_id) DO UPDATE SET mime=EXCLUDED.mime, dados=EXCLUDED.dados, tamanho=EXCLUDED.tamanho, criado_em=now()`, [id, mime, buf, buf.length]);
  const url = '/brasao/' + id;
  await pool.query('UPDATE concursos SET brasao_url=$1 WHERE id=$2', [url, id]);
  res.json({ ok: true, brasao_url: url });
});
app.post('/admin/concurso/:id/brasao/remover', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const id = parseInt(req.params.id);
  await pool.query('DELETE FROM brasao WHERE concurso_id=$1', [id]);
  await pool.query('UPDATE concursos SET brasao_url=NULL WHERE id=$1', [id]);
  res.json({ ok: true });
});

app.get('/admin/inscritos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ inscritos: [] });
  const cid = req.query.concurso;
  const sel = 'SELECT k.*, c.titulo AS concurso, (SELECT COUNT(*)::int FROM titulos t WHERE t.candidato_id=k.id) AS titulos FROM candidatos k LEFT JOIN concursos c ON c.id=k.concurso_id';
  const { rows } = cid
    ? await pool.query(sel + ' WHERE k.concurso_id=$1 ORDER BY k.id DESC', [cid])
    : await pool.query(sel + ' ORDER BY k.id DESC');
  res.json({ inscritos: rows });
});

// Editar dados de uma inscrição (inclui status de pagamento)
app.post('/admin/inscrito/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  try {
    const id = parseInt(req.params.id);
    const b = req.body || {};
    const nome = (b.nome || '').trim(), cpf = soDigitos(b.cpf), cargo = (b.cargo || '').trim();
    if (nome.length < 3) return res.status(400).json({ erro: 'Informe o nome completo.' });
    if (!cpfValido(cpf)) return res.status(400).json({ erro: 'CPF inválido.' });
    if (!cargo) return res.status(400).json({ erro: 'Informe o cargo.' });
    const status = ['inscrito', 'aguardando_pagamento', 'pago'].includes(b.status) ? b.status : null;
    await pool.query(
      `UPDATE candidatos SET nome=$1,cpf=$2,email=$3,telefone=$4,cargo=$5,cidade=$6,uf=$7,pcd=$8,sexo=$9,nome_social=$10,status=COALESCE($11,status) WHERE id=$12`,
      [nome, cpf, (b.email || '').trim() || null, soDigitos(b.telefone) || null, cargo,
       (b.cidade || '').trim() || null, (b.uf || '').trim().toUpperCase() || null,
       b.pcd === true || b.pcd === 'true' || b.pcd === 'on', b.sexo || null,
       (b.nome_social || '').trim() || null, status, id]);
    res.json({ ok: true });
  } catch (e) { console.error('editar inscrito:', e.message); res.status(500).json({ erro: 'Não foi possível salvar.' }); }
});

// Excluir uma inscrição (remove também os títulos anexados)
app.delete('/admin/inscrito/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  try {
    const id = parseInt(req.params.id);
    await pool.query('DELETE FROM titulos WHERE candidato_id=$1', [id]);
    await pool.query('DELETE FROM candidatos WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { console.error('excluir inscrito:', e.message); res.status(500).json({ erro: 'Não foi possível excluir.' }); }
});

app.get('/admin/inscritos.csv', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const cid = req.query.concurso;
  const { rows } = cid
    ? await pool.query('SELECT k.*, c.titulo AS concurso FROM candidatos k LEFT JOIN concursos c ON c.id=k.concurso_id WHERE k.concurso_id=$1 ORDER BY k.id', [cid])
    : await pool.query('SELECT k.*, c.titulo AS concurso FROM candidatos k LEFT JOIN concursos c ON c.id=k.concurso_id ORDER BY k.id');
  const cols = ['protocolo', 'concurso', 'nome', 'cpf', 'nascimento', 'email', 'telefone', 'sexo', 'cargo', 'pcd', 'nome_social', 'cidade', 'uf', 'status', 'invoice_url', 'criado_em'];
  const cab = ['Protocolo', 'Concurso', 'Nome', 'CPF', 'Nascimento', 'E-mail', 'Telefone', 'Sexo', 'Cargo', 'PcD', 'Nome social', 'Cidade', 'UF', 'Status', 'Link pagamento', 'Inscrito em'];
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

app.post('/admin/cobranca/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  if (!temAsaas) return res.status(400).json({ erro: 'Configure a chave do ASAAS.' });
  try {
    const { rows } = await pool.query('SELECT * FROM candidatos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Inscrito não encontrado.' });
    const c = rows[0];
    const concurso = await lerConcursoPorChave(String(c.concurso_id));
    if (!concurso || Number(concurso.taxa_valor) <= 0) return res.status(400).json({ erro: 'Defina o valor da taxa do concurso (mín. R$ 5,00).' });
    const pay = await criarCobranca({ nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, cargo: c.cargo, protocolo: c.protocolo }, concurso);
    await pool.query('UPDATE candidatos SET status=$1, asaas_customer_id=$2, asaas_payment_id=$3, invoice_url=$4 WHERE id=$5',
      ['aguardando_pagamento', pay.customerId, pay.paymentId, pay.invoiceUrl, c.id]);
    res.json({ ok: true, invoiceUrl: pay.invoiceUrl });
  } catch (e) { console.error('cobranca:', e.message); res.status(500).json({ erro: e.message }); }
});

// ---- Etapas / Documentos (admin) ---------------------------
app.get('/admin/concurso/:id/etapas.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ etapas: [], documentos: [] });
  const cid = parseInt(req.params.id);
  const et = await pool.query('SELECT id,nome,ordem FROM etapas WHERE concurso_id=$1 ORDER BY ordem,id', [cid]);
  const ar = await pool.query('SELECT ea.id,ea.etapa_id,ea.filename,ea.mime,ea.tamanho FROM etapa_arquivos ea JOIN etapas e ON e.id=ea.etapa_id WHERE e.concurso_id=$1 ORDER BY ea.id', [cid]);
  const dc = await pool.query('SELECT id,titulo,filename,mime,tamanho FROM documentos WHERE concurso_id=$1 ORDER BY id DESC', [cid]);
  const etapas = et.rows.map((e) => ({ id: e.id, nome: e.nome, arquivos: ar.rows.filter((a) => a.etapa_id === e.id) }));
  res.json({ etapas, documentos: dc.rows });
});
app.post('/admin/concurso/:id/etapa', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const cid = parseInt(req.params.id);
  const nome = String((req.body || {}).nome || '').trim().slice(0, 120);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da etapa.' });
  const o = await pool.query('SELECT COALESCE(MAX(ordem),0)+1 AS n FROM etapas WHERE concurso_id=$1', [cid]);
  const r = await pool.query('INSERT INTO etapas (concurso_id,nome,ordem) VALUES ($1,$2,$3) RETURNING id', [cid, nome, o.rows[0].n]);
  res.json({ ok: true, id: r.rows[0].id });
});
app.post('/admin/etapa/:id/rename', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const nome = String((req.body || {}).nome || '').trim().slice(0, 120);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome.' });
  await pool.query('UPDATE etapas SET nome=$1 WHERE id=$2', [nome, req.params.id]);
  res.json({ ok: true });
});
app.delete('/admin/etapa/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const id = parseInt(req.params.id);
  await pool.query('DELETE FROM etapa_arquivos WHERE etapa_id=$1', [id]);
  await pool.query('DELETE FROM etapas WHERE id=$1', [id]);
  res.json({ ok: true });
});
app.post('/admin/etapa/:id/arquivo', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const buf = decodeB64((req.body || {}).dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione um arquivo.' });
  const mime = mimeDe(buf);
  if (!mime) return res.status(400).json({ erro: 'Formato inválido. Envie PDF, JPG ou PNG.' });
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo muito grande (máx. 10 MB).' });
  await pool.query('INSERT INTO etapa_arquivos (etapa_id,filename,mime,dados,tamanho) VALUES ($1,$2,$3,$4,$5)',
    [parseInt(req.params.id), String((req.body || {}).filename || 'arquivo').slice(0, 200), mime, buf, buf.length]);
  res.json({ ok: true });
});
app.delete('/admin/arquivo/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('DELETE FROM etapa_arquivos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.post('/admin/concurso/:id/documento', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const buf = decodeB64((req.body || {}).dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione um arquivo.' });
  const mime = mimeDe(buf);
  if (!mime) return res.status(400).json({ erro: 'Formato inválido. Envie PDF, JPG ou PNG.' });
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo muito grande (máx. 10 MB).' });
  await pool.query('INSERT INTO documentos (concurso_id,titulo,filename,mime,dados,tamanho) VALUES ($1,$2,$3,$4,$5,$6)',
    [parseInt(req.params.id), String((req.body || {}).titulo || '').slice(0, 160), String((req.body || {}).filename || 'arquivo').slice(0, 200), mime, buf, buf.length]);
  res.json({ ok: true });
});
app.delete('/admin/documento/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('DELETE FROM documentos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Relatórios (admin) ------------------------------------
function filtrosInscritos(q) {
  const where = ['k.concurso_id=$1']; const params = [parseInt(q.concurso)];
  if (q.cargo) { params.push(q.cargo); where.push('k.cargo=$' + params.length); }
  if (q.pagamento === 'pagos') where.push("k.status='pago'");
  else if (q.pagamento === 'naopagos') where.push("k.status<>'pago'");
  if (q.pcd === 'sim') where.push('k.pcd=TRUE');
  else if (q.pcd === 'nao') where.push('k.pcd=FALSE');
  return { where: where.join(' AND '), params };
}
function mascaraCpf(cpf) { cpf = soDigitos(cpf); if (cpf.length !== 11) return cpf || ''; return '***.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-**'; }
function situacaoTxt(r, gratuito) { return (r.status === 'pago' || gratuito) ? 'Confirmada' : 'Aguardando pagamento'; }
function resumoFiltros(q) {
  const p = [];
  if (q.cargo) p.push('Cargo: ' + q.cargo);
  p.push('Pagamento: ' + (q.pagamento === 'pagos' ? 'somente pagos' : q.pagamento === 'naopagos' ? 'somente não pagos' : 'todos'));
  if (q.pcd === 'sim') p.push('somente PcD'); else if (q.pcd === 'nao') p.push('exceto PcD');
  return p.join(' · ');
}

app.get('/admin/relatorio/inscritos.json', exigirSenha, async (req, res) => {
  if (!pool || !req.query.concurso) return res.json({ total: 0 });
  const f = filtrosInscritos(req.query);
  const { rows } = await pool.query('SELECT COUNT(*)::int total FROM candidatos k WHERE ' + f.where, f.params);
  res.json({ total: rows[0].total });
});

app.get('/admin/relatorio/inscritos.csv', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const f = filtrosInscritos(req.query);
  const { rows } = await pool.query('SELECT * FROM candidatos k WHERE ' + f.where + ' ORDER BY nome', f.params);
  const completa = req.query.versao === 'completa';
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let cab, linha;
  if (completa) {
    cab = ['Protocolo', 'Nome', 'CPF', 'Nascimento', 'E-mail', 'Telefone', 'Sexo', 'Cargo', 'PcD', 'Nome social', 'Cidade', 'UF', 'Situação'];
    linha = (r) => [r.protocolo, r.nome, r.cpf, r.nascimento, r.email, r.telefone, r.sexo, r.cargo, (r.pcd ? 'Sim' : 'Não'), r.nome_social, r.cidade, r.uf, situacaoTxt(r, concurso.gratuito)];
  } else {
    cab = ['Nome', 'Inscrição', 'CPF', 'Cargo', 'Situação'];
    linha = (r) => [r.nome, r.protocolo, mascaraCpf(r.cpf), r.cargo, situacaoTxt(r, concurso.gratuito)];
  }
  const csv = '\uFEFF' + [cab.join(';'), ...rows.map((r) => linha(r).map(esc).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="lista_inscritos.csv"');
  res.send(csv);
});

app.get('/admin/relatorio/inscritos.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const f = filtrosInscritos(req.query);
  const { rows } = await pool.query('SELECT * FROM candidatos k WHERE ' + f.where + ' ORDER BY nome', f.params);
  const completa = req.query.versao === 'completa';
  const e = escapeHtml;
  const brasao = concurso.brasao_url ? `<img src="${concurso.brasao_url}" alt="" style="height:64px;width:64px;object-fit:contain">` : '';
  const agora = new Date(Date.now() - 3 * 3600 * 1000).toLocaleString('pt-BR');
  let thead, tbody;
  if (completa) {
    thead = '<th>#</th><th>Nome</th><th>CPF</th><th>Nasc.</th><th>Cargo</th><th>PcD</th><th>Cidade/UF</th><th>Protocolo</th><th>Situação</th>';
    tbody = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${e(r.nome)}</td><td>${e(r.cpf)}</td><td>${e(r.nascimento || '')}</td><td>${e(r.cargo)}</td><td>${r.pcd ? 'Sim' : 'Não'}</td><td>${e((r.cidade || '') + (r.uf ? '/' + r.uf : ''))}</td><td>${e(r.protocolo)}</td><td>${e(situacaoTxt(r, concurso.gratuito))}</td></tr>`).join('');
  } else {
    thead = '<th>#</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Inscrição</th><th>Situação</th>';
    tbody = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${e(r.nome)}</td><td>${e(mascaraCpf(r.cpf))}</td><td>${e(r.cargo)}</td><td>${e(r.protocolo)}</td><td>${e(situacaoTxt(r, concurso.gratuito))}</td></tr>`).join('');
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de Inscritos</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#16242f;padding:28px;font-size:13px}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .cab{display:flex;align-items:center;gap:16px;border-bottom:3px solid #0b3a5e;padding-bottom:14px;margin-bottom:6px}
 .cab .org{font-size:12px;color:#5b7183;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
 .cab h1{font-size:18px;color:#0b3a5e;margin-top:2px}
 .cab h2{font-size:14px;color:#16242f;font-weight:600;margin-top:2px}
 .meta{color:#5b7183;font-size:12px;margin:10px 0 16px}
 table{width:100%;border-collapse:collapse;font-size:12px}
 th,td{border:1px solid #cdd8df;padding:6px 8px;text-align:left}
 th{background:#eef3f6;color:#0b3a5e}
 tr:nth-child(even) td{background:#f7fafc}
 .rodape{margin-top:16px;color:#5b7183;font-size:11px;display:flex;justify-content:space-between}
 @media print{.barra-print{display:none}body{padding:0}}
</style></head><body>
<div class="barra-print"><span>Confira e use <b>Imprimir → Salvar como PDF</b>.</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
<div class="cab">${brasao}<div><div class="org">${e(concurso.orgao || 'Processo Seletivo')}</div><h1>${e(concurso.titulo || '')}</h1><h2>Lista de Inscritos${completa ? ' (uso interno)' : ''}</h2></div></div>
<div class="meta">Filtros: ${e(resumoFiltros(req.query) || 'todos')} &nbsp;·&nbsp; Total: <b>${rows.length}</b> inscritos &nbsp;·&nbsp; Emitido em ${e(agora)}</div>
<table><thead><tr>${thead}</tr></thead><tbody>${tbody || '<tr><td colspan="9" style="text-align:center;padding:16px">Nenhum inscrito com esses filtros.</td></tr>'}</tbody></table>
<div class="rodape"><span>${e(concurso.titulo || '')} — Lista de Inscritos</span><span>Gerado pelo Seletrix</span></div>
</body></html>`;
  res.send(html);
});

// ---- Locação: escolas e salas (admin) ----------------------
app.get('/admin/concurso/:id/escolas.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ escolas: [], inscritos: 0, capacidade_total: 0 });
  const cid = parseInt(req.params.id);
  const es = await pool.query('SELECT id,nome,endereco FROM escolas WHERE concurso_id=$1 ORDER BY id', [cid]);
  const sl = await pool.query('SELECT s.id,s.escola_id,s.nome,s.capacidade,s.obs FROM salas s JOIN escolas e ON e.id=s.escola_id WHERE e.concurso_id=$1 ORDER BY s.id', [cid]);
  const ins = await pool.query('SELECT COUNT(*)::int n FROM candidatos WHERE concurso_id=$1', [cid]);
  let capTotal = 0;
  const escolas = es.rows.map((e) => {
    const salas = sl.rows.filter((s) => s.escola_id === e.id);
    const cap = salas.reduce((a, s) => a + (s.capacidade || 0), 0);
    capTotal += cap;
    return { id: e.id, nome: e.nome, endereco: e.endereco, salas, capacidade: cap };
  });
  res.json({ escolas, inscritos: ins.rows[0].n, capacidade_total: capTotal });
});
app.post('/admin/concurso/:id/escola', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const nome = String((req.body || {}).nome || '').trim().slice(0, 200);
  const endereco = String((req.body || {}).endereco || '').trim().slice(0, 400);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da escola.' });
  const r = await pool.query('INSERT INTO escolas (concurso_id,nome,endereco) VALUES ($1,$2,$3) RETURNING id', [parseInt(req.params.id), nome, endereco]);
  res.json({ ok: true, id: r.rows[0].id });
});
app.post('/admin/escola/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const nome = String((req.body || {}).nome || '').trim().slice(0, 200);
  const endereco = String((req.body || {}).endereco || '').trim().slice(0, 400);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da escola.' });
  await pool.query('UPDATE escolas SET nome=$1,endereco=$2 WHERE id=$3', [nome, endereco, req.params.id]);
  res.json({ ok: true });
});
app.delete('/admin/escola/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const id = parseInt(req.params.id);
  await pool.query('DELETE FROM salas WHERE escola_id=$1', [id]);
  await pool.query('DELETE FROM escolas WHERE id=$1', [id]);
  res.json({ ok: true });
});
app.post('/admin/escola/:id/sala', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const nome = String((req.body || {}).nome || '').trim().slice(0, 120);
  const cap = Math.max(0, parseInt((req.body || {}).capacidade) || 0);
  const obs = String((req.body || {}).obs || '').trim().slice(0, 200);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome/número da sala.' });
  if (cap <= 0) return res.status(400).json({ erro: 'Informe a capacidade da sala.' });
  await pool.query('INSERT INTO salas (escola_id,nome,capacidade,obs) VALUES ($1,$2,$3,$4)', [parseInt(req.params.id), nome, cap, obs]);
  res.json({ ok: true });
});
app.post('/admin/sala/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const nome = String((req.body || {}).nome || '').trim().slice(0, 120);
  const cap = Math.max(0, parseInt((req.body || {}).capacidade) || 0);
  const obs = String((req.body || {}).obs || '').trim().slice(0, 200);
  if (!nome || cap <= 0) return res.status(400).json({ erro: 'Nome e capacidade são obrigatórios.' });
  await pool.query('UPDATE salas SET nome=$1,capacidade=$2,obs=$3 WHERE id=$4', [nome, cap, obs, req.params.id]);
  res.json({ ok: true });
});
app.delete('/admin/sala/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('DELETE FROM salas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Alocação (admin) --------------------------------------
app.get('/admin/concurso/:id/salas.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ salas: [] });
  const cid = parseInt(req.params.id);
  const { rows } = await pool.query(`SELECT s.id, s.nome, s.capacidade, e.nome AS escola,
    (SELECT COUNT(*)::int FROM candidatos k WHERE k.sala_id=s.id) AS ocupacao
    FROM salas s JOIN escolas e ON e.id=s.escola_id WHERE e.concurso_id=$1 ORDER BY e.id, s.id`, [cid]);
  res.json({ salas: rows });
});
app.get('/admin/concurso/:id/candidatos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ candidatos: [] });
  const cid = parseInt(req.params.id); const q = req.query;
  const where = ['k.concurso_id=$1']; const params = [cid];
  if (q.cargo) { params.push(q.cargo); where.push('k.cargo=$' + params.length); }
  if (q.pagamento === 'pagos') where.push("k.status='pago'"); else if (q.pagamento === 'naopagos') where.push("k.status<>'pago'");
  if (q.pcd === 'sim') where.push('k.pcd=TRUE'); else if (q.pcd === 'nao') where.push('k.pcd=FALSE');
  if (q.aloc === 'nao') where.push('k.sala_id IS NULL'); else if (q.aloc === 'sim') where.push('k.sala_id IS NOT NULL');
  if (q.busca) { params.push('%' + String(q.busca).trim() + '%'); where.push('k.nome ILIKE $' + params.length); }
  const { rows } = await pool.query(`SELECT k.id,k.nome,k.cpf,k.cargo,k.pcd,k.status,k.sala_id, s.nome AS sala_nome, e.nome AS escola_nome
    FROM candidatos k LEFT JOIN salas s ON s.id=k.sala_id LEFT JOIN escolas e ON e.id=s.escola_id
    WHERE ${where.join(' AND ')} ORDER BY k.nome LIMIT 2000`, params);
  res.json({ candidatos: rows });
});
app.post('/admin/alocar', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const b = req.body || {}; const salaId = parseInt(b.sala_id);
  const ids = (Array.isArray(b.candidato_ids) ? b.candidato_ids : []).map((x) => parseInt(x)).filter(Boolean);
  if (!salaId || !ids.length) return res.status(400).json({ erro: 'Selecione a sala e ao menos um candidato.' });
  const sala = await pool.query('SELECT s.capacidade, e.concurso_id FROM salas s JOIN escolas e ON e.id=s.escola_id WHERE s.id=$1', [salaId]);
  if (!sala.rows.length) return res.status(404).json({ erro: 'Sala não encontrada.' });
  const cap = sala.rows[0].capacidade, concursoId = sala.rows[0].concurso_id;
  const atual = await pool.query('SELECT COUNT(*)::int n FROM candidatos WHERE sala_id=$1', [salaId]);
  const entrando = await pool.query('SELECT COUNT(*)::int n FROM candidatos WHERE id = ANY($1::int[]) AND concurso_id=$2 AND (sala_id IS NULL OR sala_id <> $3)', [ids, concursoId, salaId]);
  if (atual.rows[0].n + entrando.rows[0].n > cap) {
    const livres = Math.max(0, cap - atual.rows[0].n);
    return res.status(400).json({ erro: 'Esta sala tem ' + cap + ' lugares e ' + livres + ' livre(s). Você selecionou ' + entrando.rows[0].n + ' novo(s) candidato(s).' });
  }
  await pool.query('UPDATE candidatos SET sala_id=$1 WHERE id = ANY($2::int[]) AND concurso_id=$3', [salaId, ids, concursoId]);
  res.json({ ok: true, alocados: ids.length });
});
app.post('/admin/desalocar', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const ids = (Array.isArray((req.body || {}).candidato_ids) ? req.body.candidato_ids : []).map((x) => parseInt(x)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ erro: 'Selecione ao menos um candidato.' });
  await pool.query('UPDATE candidatos SET sala_id=NULL WHERE id = ANY($1::int[])', [ids]);
  res.json({ ok: true });
});

// Locais de Prova (somente candidatos alocados)
app.get('/admin/relatorio/locais.csv', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const modo = req.query.modo === 'corrido' ? 'corrido' : 'agrupado';
  const order = modo === 'corrido' ? 'k.nome' : 'e.id, s.id, k.nome';
  const { rows } = await pool.query(`SELECT k.nome,k.cpf,k.cargo,k.nascimento,k.pcd, s.nome AS sala, s.obs AS sala_obs, e.nome AS escola, e.endereco
    FROM candidatos k JOIN salas s ON s.id=k.sala_id JOIN escolas e ON e.id=s.escola_id WHERE k.concurso_id=$1 ORDER BY ${order}`, [concurso.id]);
  const completa = req.query.versao === 'completa';
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let cab, linha;
  if (completa) { cab = ['Escola', 'Endereço', 'Sala', 'Nome', 'CPF', 'Nascimento', 'Cargo', 'PcD']; linha = (r) => [r.escola, r.endereco, r.sala, r.nome, r.cpf, r.nascimento, r.cargo, (r.pcd ? 'Sim' : 'Não')]; }
  else { cab = ['Escola', 'Endereço', 'Sala', 'Nome', 'CPF', 'Cargo']; linha = (r) => [r.escola, r.endereco, r.sala, r.nome, mascaraCpf(r.cpf), r.cargo]; }
  const csv = '\uFEFF' + [cab.join(';'), ...rows.map((r) => linha(r).map(esc).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="locais_de_prova.csv"');
  res.send(csv);
});
app.get('/admin/relatorio/locais.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const modo = req.query.modo === 'corrido' ? 'corrido' : 'agrupado';
  const completa = req.query.versao === 'completa';
  const order = modo === 'corrido' ? 'k.nome' : 'e.id, s.id, k.nome';
  const { rows } = await pool.query(`SELECT k.nome,k.cpf,k.cargo,k.nascimento,k.pcd, s.id AS sala_id, s.nome AS sala, s.obs AS sala_obs, e.id AS escola_id, e.nome AS escola, e.endereco
    FROM candidatos k JOIN salas s ON s.id=k.sala_id JOIN escolas e ON e.id=s.escola_id WHERE k.concurso_id=$1 ORDER BY ${order}`, [concurso.id]);
  const e = escapeHtml;
  const cpf = (c) => completa ? e(c) : e(mascaraCpf(c));
  let body = '';
  if (modo === 'agrupado') {
    const byE = {}, ordE = [];
    rows.forEach((r) => {
      if (!byE[r.escola_id]) { byE[r.escola_id] = { nome: r.escola, endereco: r.endereco, salas: {}, ordS: [] }; ordE.push(r.escola_id); }
      const E = byE[r.escola_id];
      if (!E.salas[r.sala_id]) { E.salas[r.sala_id] = { nome: r.sala, obs: r.sala_obs, cands: [] }; E.ordS.push(r.sala_id); }
      E.salas[r.sala_id].cands.push(r);
    });
    ordE.forEach((eid) => {
      const E = byE[eid];
      body += `<div class="escola"><h3>${e(E.nome)}</h3><div class="end">${e(E.endereco || '')}</div>`;
      E.ordS.forEach((sid) => {
        const S = E.salas[sid];
        body += `<div class="sala">${e(S.nome)}${S.obs ? (' — ' + e(S.obs)) : ''} <span class="qtd">(${S.cands.length} candidato(s))</span></div>`;
        body += `<table><thead><tr><th>#</th><th>Nome</th><th>CPF</th><th>Cargo</th></tr></thead><tbody>`;
        S.cands.forEach((r, i) => { body += `<tr><td>${i + 1}</td><td>${e(r.nome)}</td><td>${cpf(r.cpf)}</td><td>${e(r.cargo)}</td></tr>`; });
        body += `</tbody></table>`;
      });
      body += `</div>`;
    });
  } else {
    body = `<table><thead><tr><th>#</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Escola</th><th>Sala</th><th>Endereço</th></tr></thead><tbody>`;
    rows.forEach((r, i) => { body += `<tr><td>${i + 1}</td><td>${e(r.nome)}</td><td>${cpf(r.cpf)}</td><td>${e(r.cargo)}</td><td>${e(r.escola)}</td><td>${e(r.sala)}</td><td>${e(r.endereco || '')}</td></tr>`; });
    body += `</tbody></table>`;
  }
  const brasao = concurso.brasao_url ? `<img src="${concurso.brasao_url}" alt="" style="height:64px;width:64px;object-fit:contain">` : '';
  const agora = new Date(Date.now() - 3 * 3600 * 1000).toLocaleString('pt-BR');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Locais de Prova</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#16242f;padding:28px;font-size:13px}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .cab{display:flex;align-items:center;gap:16px;border-bottom:3px solid #0b3a5e;padding-bottom:14px;margin-bottom:6px}
 .cab .org{font-size:12px;color:#5b7183;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
 .cab h1{font-size:18px;color:#0b3a5e;margin-top:2px}
 .cab h2{font-size:14px;color:#16242f;font-weight:600;margin-top:2px}
 .meta{color:#5b7183;font-size:12px;margin:10px 0 16px}
 .escola{margin:18px 0;page-break-inside:avoid}
 .escola h3{font-size:15px;color:#0b3a5e;border-bottom:1px solid #cdd8df;padding-bottom:4px}
 .escola .end{color:#5b7183;font-size:12px;margin:2px 0 8px}
 .sala{background:#eef3f6;color:#0b3a5e;font-weight:700;padding:6px 10px;border-radius:6px;margin:12px 0 6px}
 .sala .qtd{font-weight:400;color:#5b7183}
 table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
 th,td{border:1px solid #cdd8df;padding:6px 8px;text-align:left}
 th{background:#f3f6f9;color:#0b3a5e}
 tr:nth-child(even) td{background:#fafcfe}
 .rodape{margin-top:16px;color:#5b7183;font-size:11px}
 @media print{.barra-print{display:none}body{padding:0}}
</style></head><body>
<div class="barra-print"><span>Confira e use <b>Imprimir → Salvar como PDF</b>.</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
<div class="cab">${brasao}<div><div class="org">${e(concurso.orgao || 'Processo Seletivo')}</div><h1>${e(concurso.titulo || '')}</h1><h2>Locais de Prova${completa ? ' (uso interno)' : ''}</h2></div></div>
<div class="meta">Total alocados: <b>${rows.length}</b> &nbsp;·&nbsp; ${modo === 'agrupado' ? 'Agrupado por escola e sala' : 'Lista alfabética'} &nbsp;·&nbsp; Emitido em ${e(agora)}</div>
${body || '<p style="padding:16px;text-align:center">Nenhum candidato alocado ainda.</p>'}
<div class="rodape">${e(concurso.titulo || '')} — Locais de Prova · Gerado pelo Seletrix</div>
</body></html>`;
  res.send(html);
});

// Ata da Sala (abertura/encerramento + folha de ocorrências) — 2 páginas por sala
app.get('/admin/relatorio/ata.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const salaId = parseInt(req.query.sala) || 0;
  const params = [concurso.id];
  let filtro = '';
  if (salaId) { params.push(salaId); filtro = ' AND s.id=$2'; }
  const { rows } = await pool.query(`SELECT s.id,s.nome,s.obs,s.capacidade, e.nome AS escola, e.endereco,
    (SELECT COUNT(*)::int FROM candidatos k WHERE k.sala_id=s.id) AS ocupacao
    FROM salas s JOIN escolas e ON e.id=s.escola_id WHERE e.concurso_id=$1${filtro} ORDER BY e.id, s.id`, params);
  const e = escapeHtml;
  const editalLinha = e(((concurso.titulo || '') + (concurso.orgao ? ' - ' + concurso.orgao : '')).toUpperCase());
  const linhaVazia = '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>';
  function ataDaSala(s) {
    const cab = e(((s.nome || '') + (s.obs ? ' - ' + s.obs : '')).toUpperCase());
    const frente = `
<div class="pagina">
  <div class="tit">Ata de abertura e encerramento do edital</div>
  <div class="edital">${editalLinha}</div>
  <div class="salahdr">${cab}</div>
  <div class="escola">${e(s.escola || '')}</div>
  <div class="endereco">${e(s.endereco || '')}</div>
  <div class="turno">Turno _____________ — ______/______/__________</div>
  <div class="qtd">(${s.ocupacao} candidatos)</div>
  <div class="sec">ATA DE ABERTURA E ENCERRAMENTO DAS PROVAS E REGISTRO DE OCORRÊNCIAS.</div>
  <p class="texto">Aos ______ dias do mês de ________________ de __________, às ______ horas, na escola ${e(s.escola || '')}, foi(foram) aberto(s) por três candidatos, através deste Termo de Abertura, o envelope da ${cab}, contendo as provas da vaga acima descrita, conforme o edital de nº 01, verificando-se que o mesmo estava devidamente lacrado. Foram voluntários para a conferência os seguintes candidatos:</p>
  <div class="sub">ABERTURA DE ENVELOPE DE PROVAS COM GABARITOS (CARTÃO RESPOSTA).</div>
  <p class="txt2">Foram voluntários para a conferência os seguintes candidatos:</p>
  <table class="t2"><thead><tr><th>Nome do Candidato</th><th>Assinatura</th></tr></thead><tbody>${linhaVazia}${linhaVazia}${linhaVazia}</tbody></table>
  <table class="tpres"><tbody><tr>
    <td class="lbl">Candidatos Presentes</td><td class="pre">&nbsp;</td>
    <td class="lbl">Candidatos Ausentes</td><td class="pre">&nbsp;</td>
    <td class="lbl">Nº de Inclusões</td><td class="pre">&nbsp;</td>
  </tr></tbody></table>
  <p class="texto">Termo de Encerramento: Os três últimos candidatos, deu-se o fechamento do envelope de retorno das provas, lacrou-se o envelope e não havendo outros registros a serem informados, os três últimos candidatos, juntamente com os fiscais de sala assinam a presente ata de abertura, encerrando o registro de ocorrência de sala de provas.</p>
  <div class="sub">FECHAMENTO ENVELOPES DE GABARITOS (CARTÃO-RESPOSTA)</div>
  <p class="txt2">Foram voluntários para a conferência os seguintes, os 3 Últimos Candidatos:</p>
  <table class="t2"><thead><tr><th>Nome do Candidato</th><th>Assinatura</th></tr></thead><tbody>${linhaVazia}${linhaVazia}${linhaVazia}</tbody></table>
  <table class="t2"><thead><tr><th>Nome dos fiscais</th><th>Assinatura</th></tr></thead><tbody>${linhaVazia}${linhaVazia}</tbody></table>
  <table class="t2"><thead><tr><th>Coordenador/Auxiliar Coordenação</th><th>Assinatura</th></tr></thead><tbody>${linhaVazia}</tbody></table>
</div>`;
    let linhas = ''; for (let i = 0; i < 26; i++) linhas += '<div class="linha">&nbsp;</div>';
    const verso = `
<div class="pagina">
  <div class="tit">Ata de abertura e encerramento do edital</div>
  <div class="edital">${editalLinha}</div>
  <div class="ocor">RELATO DE OCORRÊNCIAS:</div>
  <div class="quadro">${linhas}</div>
</div>`;
    return frente + verso;
  }
  const corpo = rows.length ? rows.map(ataDaSala).join('') : '<p style="padding:20px;text-align:center">Nenhuma sala encontrada (cadastre salas e aloque candidatos).</p>';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata da Sala</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#111;font-size:12px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4 portrait;margin:12mm}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .pagina{max-width:780px;margin:0 auto;padding:18px 24px}
 .tit{text-align:center;font-weight:700;font-size:13px}
 .edital{text-align:center;font-weight:700;font-size:12px;margin-top:4px;line-height:1.35}
 .salahdr{text-align:center;font-weight:700;font-size:17px;margin-top:12px}
 .escola{text-align:center;font-size:12px;margin-top:4px}
 .endereco{text-align:center;font-size:11px;color:#333}
 .turno{text-align:center;font-size:12px;margin-top:4px}
 .qtd{text-align:center;font-style:italic;font-size:12px;margin-top:2px}
 .sec{font-weight:700;margin:14px 0 6px;font-size:12px}
 .sub{font-weight:700;margin:12px 0 4px;font-size:12px}
 .texto{text-align:justify;line-height:1.5;margin:6px 0}
 .txt2{margin:4px 0}
 table{width:100%;border-collapse:collapse;margin:6px 0}
 .t2 th,.t2 td{border:1px solid #000;padding:7px 8px}
 .t2 th{text-align:center;background:#f0f0f0}
 .t2 td{height:26px}
 .tpres td{border:1px solid #000;padding:7px 8px}
 .tpres .lbl{font-weight:700;background:#f0f0f0;white-space:nowrap}
 .tpres .pre{width:70px}
 .ocor{text-align:center;font-weight:700;margin:14px 0 6px}
 .quadro{border:1px solid #000}
 .linha{border-bottom:1px solid #000;height:30px}
 @media print{
   .barra-print{display:none}
   .pagina{max-width:none;margin:0;padding:0}
   .pagina + .pagina{break-before:page;page-break-before:always}
   table,.escola,.quadro{break-inside:avoid}
 }
</style></head><body>
<div class="barra-print"><span>Confira e use <b>Imprimir → Salvar como PDF</b> (cada sala tem 2 páginas).</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
${corpo}
</body></html>`;
  res.send(html);
});

// ---- Listas operacionais (presença, frente de sala/prédio) ----
function relShell(tab, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${tab}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#111;font-size:12px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4 portrait;margin:12mm}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .pagina{max-width:780px;margin:0 auto;padding:18px 24px}
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #0b3a5e;padding-bottom:10px;margin-bottom:10px}
 .cab img{height:56px;width:56px;object-fit:contain}
 .cab .org{font-size:11px;color:#5b7183;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
 .cab h1{font-size:16px;color:#0b3a5e;margin-top:2px}
 .cab h2{font-size:13px;color:#111;font-weight:600;margin-top:2px}
 .salahdr{text-align:center;font-weight:700;font-size:22px;margin:10px 0 2px}
 .subhdr{text-align:center;font-size:13px;margin-bottom:2px}
 .qtd{text-align:center;font-style:italic;margin-bottom:8px}
 .linha-sala{font-weight:700;color:#0b3a5e;margin:6px 0}
 table{width:100%;border-collapse:collapse;margin:6px 0;font-size:12px}
 th,td{border:1px solid #000;padding:6px 8px;text-align:left}
 th{background:#eef3f6;color:#0b3a5e}
 .assin{width:45%}
 .rowtall td{height:30px}
 .num{width:36px;text-align:center}
 @media print{
   .barra-print{display:none}
   .pagina{max-width:none;margin:0;padding:0}
   .pagina + .pagina{break-before:page;page-break-before:always}
   tr{break-inside:avoid}
 }
</style></head><body>
<div class="barra-print"><span>Confira e use <b>Imprimir → Salvar como PDF</b>.</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
${corpo}
</body></html>`;
}
function cabHTML(concurso, docNome) {
  const e = escapeHtml;
  const brasao = concurso.brasao_url ? `<img src="${concurso.brasao_url}" alt="">` : '';
  return `<div class="cab">${brasao}<div><div class="org">${e(concurso.orgao || 'Processo Seletivo')}</div><h1>${e(concurso.titulo || '')}</h1><h2>${e(docNome)}</h2></div></div>`;
}
async function alocadosDoConcurso(concursoId, salaId) {
  const params = [concursoId]; let filtro = '';
  if (salaId) { params.push(salaId); filtro = ' AND s.id=$2'; }
  const { rows } = await pool.query(`SELECT k.nome,k.cpf,k.protocolo,k.cargo, s.id AS sala_id, s.nome AS sala, s.obs AS sala_obs, e.id AS escola_id, e.nome AS escola, e.endereco
    FROM candidatos k JOIN salas s ON s.id=k.sala_id JOIN escolas e ON e.id=s.escola_id WHERE k.concurso_id=$1${filtro} ORDER BY e.id, s.id, k.nome`, params);
  return rows;
}

app.get('/admin/relatorio/presenca.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const rows = await alocadosDoConcurso(concurso.id, parseInt(req.query.sala) || 0);
  const e = escapeHtml; const bySala = {}, ord = [];
  rows.forEach((r) => { if (!bySala[r.sala_id]) { bySala[r.sala_id] = { r, cands: [] }; ord.push(r.sala_id); } bySala[r.sala_id].cands.push(r); });
  let corpo = '';
  if (!ord.length) corpo = `<div class="pagina">${cabHTML(concurso, 'Lista de Presença')}<p style="padding:16px">Nenhum candidato alocado.</p></div>`;
  ord.forEach((sid) => {
    const g = bySala[sid], s = g.r; let linhas = '';
    g.cands.forEach((c, i) => { linhas += `<tr class="rowtall"><td class="num">${i + 1}</td><td>${e(c.nome)}</td><td>${e(c.cpf)}</td><td class="assin"></td></tr>`; });
    corpo += `<div class="pagina">${cabHTML(concurso, 'Lista de Presença')}
      <div class="linha-sala">${e(s.escola)} — ${e(s.sala)}${s.sala_obs ? (' (' + e(s.sala_obs) + ')') : ''} &nbsp;·&nbsp; ${g.cands.length} candidato(s)</div>
      <table><thead><tr><th class="num">#</th><th>Nome</th><th>CPF</th><th class="assin">Assinatura</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  });
  res.send(relShell('Lista de Presença', corpo));
});

app.get('/admin/relatorio/frente-sala.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const rows = await alocadosDoConcurso(concurso.id, parseInt(req.query.sala) || 0);
  const e = escapeHtml; const bySala = {}, ord = [];
  rows.forEach((r) => { if (!bySala[r.sala_id]) { bySala[r.sala_id] = { r, cands: [] }; ord.push(r.sala_id); } bySala[r.sala_id].cands.push(r); });
  let corpo = '';
  if (!ord.length) corpo = `<div class="pagina">${cabHTML(concurso, 'Frente de Sala')}<p style="padding:16px">Nenhum candidato alocado.</p></div>`;
  ord.forEach((sid) => {
    const g = bySala[sid], s = g.r; let linhas = '';
    g.cands.forEach((c, i) => { linhas += `<tr><td class="num">${i + 1}</td><td>${e(c.nome)}</td></tr>`; });
    corpo += `<div class="pagina">
      <div style="text-align:center"><div class="org" style="font-size:11px;color:#5b7183;text-transform:uppercase;font-weight:700">${e(concurso.orgao || '')}</div><div style="font-size:13px">${e(concurso.titulo || '')}</div></div>
      <div class="salahdr">${e(((s.sala || '') + (s.sala_obs ? (' - ' + s.sala_obs) : '')).toUpperCase())}</div>
      <div class="subhdr">${e(s.escola)}</div>
      <div class="qtd">(${g.cands.length} candidatos)</div>
      <table><thead><tr><th class="num">#</th><th>Nome do Candidato</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  });
  res.send(relShell('Frente de Sala', corpo));
});

app.get('/admin/relatorio/frente-predio.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const rows = await alocadosDoConcurso(concurso.id, 0);
  const e = escapeHtml; const byE = {}, ord = [];
  rows.forEach((r) => { if (!byE[r.escola_id]) { byE[r.escola_id] = { r, cands: [] }; ord.push(r.escola_id); } byE[r.escola_id].cands.push(r); });
  let corpo = '';
  if (!ord.length) corpo = `<div class="pagina">${cabHTML(concurso, 'Frente de Prédio')}<p style="padding:16px">Nenhum candidato alocado.</p></div>`;
  ord.forEach((eid) => {
    const g = byE[eid], s = g.r;
    g.cands.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
    let linhas = '';
    g.cands.forEach((c, i) => { linhas += `<tr><td class="num">${i + 1}</td><td>${e(c.nome)}</td><td>${e(c.sala)}${c.sala_obs ? (' (' + e(c.sala_obs) + ')') : ''}</td></tr>`; });
    corpo += `<div class="pagina">${cabHTML(concurso, 'Frente de Prédio — Locais de Prova')}
      <div class="linha-sala">${e(s.escola)}${s.endereco ? (' — ' + e(s.endereco)) : ''}</div>
      <table><thead><tr><th class="num">#</th><th>Nome</th><th>Sala</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  });
  res.send(relShell('Frente de Prédio', corpo));
});

app.get('/admin', exigirSenha, (req, res) => res.send(PAINEL_HTML));
const PAINEL_HTML = require('./painel.js');

inicializarBanco().catch((e) => console.error('Falha banco:', e.message))
  .finally(() => app.listen(PORT, () => console.log('🚀 Seletrix na porta ' + PORT + ' | ASAAS: ' + (temAsaas ? ASAAS_BASE : 'não configurado'))));
