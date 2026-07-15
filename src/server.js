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
const QRCode = require('qrcode');
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
    'asaas_customer_id TEXT', 'asaas_payment_id TEXT', 'invoice_url TEXT', 'concurso_id INT', 'sala_id INT',
    'bb_nosso_numero TEXT', 'bb_linha_digitavel TEXT', 'bb_codigo_barras TEXT', 'bb_qrcode_pix TEXT',
    'cep TEXT', 'endereco TEXT', 'bairro TEXT',
    'condicao_especial TEXT', 'laudo_mime TEXT', 'laudo_dados BYTEA', 'laudo_nome TEXT'
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
  for (const col of ['pagamento_gateway TEXT DEFAULT \'asaas\'', 'bb_client_id TEXT', 'bb_client_secret TEXT', 'bb_app_key TEXT',
    'bb_convenio TEXT', 'bb_carteira TEXT', 'bb_variacao TEXT', 'bb_agencia TEXT', 'bb_conta TEXT',
    'bb_beneficiario_nome TEXT', 'bb_beneficiario_doc TEXT', 'bb_ambiente TEXT DEFAULT \'homologacao\'']) {
    await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // Campos extras do concurso (gratuito / títulos)
  for (const col of ['gratuito BOOLEAN DEFAULT FALSE', 'pede_titulos BOOLEAN DEFAULT FALSE', "tipos_titulos TEXT DEFAULT '[]'", 'pede_laudo BOOLEAN DEFAULT FALSE']) {
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
  for (const col of ['titulos_inicio_dt TEXT', 'titulos_fim_dt TEXT', 'laudo_inicio_dt TEXT', 'laudo_fim_dt TEXT']) {
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
  // Banco de questões (geral) + imagem opcional no enunciado
  await pool.query(`CREATE TABLE IF NOT EXISTS questoes (
    id SERIAL PRIMARY KEY, enunciado TEXT, alternativas TEXT DEFAULT '[]', correta INT DEFAULT 0,
    disciplina TEXT, nivel TEXT, cargo TEXT, imagem_mime TEXT, imagem_dados BYTEA,
    criado_em TIMESTAMPTZ DEFAULT now());`);
  // Prova online + respostas/sessão por candidato
  await pool.query(`CREATE TABLE IF NOT EXISTS provas_online (id SERIAL PRIMARY KEY, concurso_id INT, titulo TEXT,
    duracao_min INT DEFAULT 60, max_saidas INT DEFAULT 2, questao_ids TEXT DEFAULT '[]', ativa BOOLEAN DEFAULT TRUE, criado_em TIMESTAMPTZ DEFAULT now());`);
  for (const col of ['inicio_em TEXT', 'tolerancia_min INT DEFAULT 0', 'tipo TEXT DEFAULT \'banco\'', 'pdf_mime TEXT', 'pdf_dados BYTEA', 'num_questoes INT DEFAULT 0', 'num_alternativas INT DEFAULT 4', 'gabarito TEXT DEFAULT \'[]\'']) {
    await pool.query(`ALTER TABLE provas_online ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS prova_respostas (id SERIAL PRIMARY KEY, prova_id INT, candidato_id INT, codigo TEXT,
    respostas TEXT DEFAULT '{}', status TEXT DEFAULT 'nao_iniciado', saidas INT DEFAULT 0,
    iniciado_em TIMESTAMPTZ, finalizado_em TIMESTAMPTZ, nota INT, UNIQUE(prova_id, candidato_id));`);
  // Recursos: fases (com prazo) + recursos interpostos pelos candidatos
  await pool.query(`CREATE TABLE IF NOT EXISTS recurso_fases (id SERIAL PRIMARY KEY, concurso_id INT, nome TEXT, abertura TEXT, fechamento TEXT, criado_em TIMESTAMPTZ DEFAULT now());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS recursos (id SERIAL PRIMARY KEY, concurso_id INT, fase_id INT, candidato_id INT, texto TEXT,
    anexo_mime TEXT, anexo_dados BYTEA, anexo_nome TEXT, status TEXT DEFAULT 'pendente', resposta TEXT, respondido_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT now());`);
  // Multiempresa: empresas + vínculo do concurso
  await pool.query(`CREATE TABLE IF NOT EXISTS empresas (id SERIAL PRIMARY KEY, slug TEXT UNIQUE, nome TEXT, subtitulo TEXT,
    logo_mime TEXT, logo_dados BYTEA, ativa BOOLEAN DEFAULT TRUE, criado_em TIMESTAMPTZ DEFAULT now());`);
  await pool.query(`ALTER TABLE concursos ADD COLUMN IF NOT EXISTS empresa_id INT`);
  {
    const e = await pool.query('SELECT COUNT(*)::int n FROM empresas');
    if (!e.rows[0].n) await pool.query(`INSERT INTO empresas (slug,nome,subtitulo) VALUES ('seletrix','Seletrix','Organização de Concursos Públicos')`);
    const pri = await pool.query('SELECT id FROM empresas ORDER BY id LIMIT 1');
    if (pri.rows.length) await pool.query('UPDATE concursos SET empresa_id=$1 WHERE empresa_id IS NULL', [pri.rows[0].id]);
  }
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
    gratuito: !!r.gratuito, pede_titulos: !!r.pede_titulos, pede_laudo: !!r.pede_laudo, tipos_titulos: tipos,
    data_inicio: di, data_fim: df, data_encerramento: de,
    titulos_inicio: ti, titulos_fim: tf, titulos_status: tc.status, pode_titulos: tc.pode,
    laudo_inicio: r.laudo_inicio_dt || null, laudo_fim: r.laudo_fim_dt || null, empresa_id: r.empresa_id || null,
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
// ---- Banco do Brasil (API Cobrança) ------------------------
const bbTokenCache = {}; // por concurso: { token, exp }
function bbUrls(cfg) {
  const prod = cfg.bb_ambiente === 'producao';
  return {
    oauth: prod ? 'https://oauth.bb.com.br/oauth/token' : 'https://oauth.hm.bb.com.br/oauth/token',
    api: prod ? 'https://api.bb.com.br' : 'https://api.hm.bb.com.br',
  };
}
async function bbToken(cfg) {
  const c = bbTokenCache[cfg.id];
  if (c && c.exp > Date.now() + 60000) return c.token;
  const u = bbUrls(cfg);
  const basic = Buffer.from(`${cfg.bb_client_id}:${cfg.bb_client_secret}`).toString('base64');
  const r = await fetch(u.oauth, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=cobrancas.boletos-requisicao cobrancas.boletos-info',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('BB OAuth: ' + (j.error_description || j.error || ('HTTP ' + r.status)));
  bbTokenCache[cfg.id] = { token: j.access_token, exp: Date.now() + ((j.expires_in || 600) * 1000) };
  return j.access_token;
}
const soNum = (s) => String(s || '').replace(/\D/g, '');
function bbDataBR(ymd) { const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (m[3] + '.' + m[2] + '.' + m[1]) : ymd; }
async function bbRegistrarBoleto(cfg, cand, valor, dueYmd) {
  const token = await bbToken(cfg);
  const u = bbUrls(cfg);
  const conv = soNum(cfg.bb_convenio);
  const conv7 = conv.padStart(7, '0').slice(-7);
  const seq10 = soNum(String(cand.id || Date.now())).padStart(10, '0').slice(-10);
  const numeroTituloCliente = '000' + conv7 + seq10; // 20 dígitos
  const corpo = {
    numeroConvenio: Number(conv), numeroCarteira: Number(soNum(cfg.bb_carteira) || 17),
    numeroVariacaoCarteira: Number(soNum(cfg.bb_variacao) || 0), codigoModalidade: 1,
    dataEmissao: bbDataBR(new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)),
    dataVencimento: bbDataBR(dueYmd), valorOriginal: Number(Number(valor).toFixed(2)),
    indicadorAceiteTituloVencido: 'S', numeroDiasLimiteRecebimento: 30,
    codigoAceite: 'A', codigoTipoTitulo: 2, descricaoTipoTitulo: 'DM',
    indicadorPermissaoRecebimentoParcial: 'N',
    numeroTituloBeneficiario: String(cand.protocolo || cand.id).slice(0, 15),
    campoUtilizacaoBeneficiario: (cfg.bb_beneficiario_nome || 'Inscricao').slice(0, 30),
    numeroTituloCliente,
    mensagemBloquetoOcorrencia: ('Inscricao ' + (cand.protocolo || '')).slice(0, 30),
    pagador: {
      tipoInscricao: 1, numeroInscricao: Number(soNum(cand.cpf)),
      nome: (cand.nome || '').slice(0, 60), endereco: (cand.endereco || 'Nao informado').slice(0, 60),
      cep: Number(soNum(cand.cep) || 0) || 1310100, cidade: (cand.cidade || 'Sao Paulo').slice(0, 30),
      bairro: (cand.bairro || 'Centro').slice(0, 30), uf: (cand.uf || 'SP').slice(0, 2),
      telefone: soNum(cand.telefone).slice(0, 11) || undefined,
    },
    indicadorPix: 'S',
  };
  const r = await fetch(u.api + '/cobrancas/v2/boletos?gw-dev-app-key=' + encodeURIComponent(cfg.bb_app_key), {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('BB boleto: ' + ((j.erros && j.erros[0] && (j.erros[0].mensagem || j.erros[0].textoMensagem)) || j.message || ('HTTP ' + r.status)));
  const pix = j.qrCode || {};
  return {
    nossoNumero: j.numero || numeroTituloCliente,
    linhaDigitavel: j.linhaDigitavel || '',
    codigoBarras: j.codigoBarraNumerico || '',
    qrCodePix: pix.emv || pix.txId || '',
  };
}
async function bbConsultarBoleto(cfg, id) {
  const token = await bbToken(cfg);
  const u = bbUrls(cfg);
  const conv = Number(soNum(cfg.bb_convenio));
  const r = await fetch(u.api + '/cobrancas/v2/boletos/' + id + '?gw-dev-app-key=' + encodeURIComponent(cfg.bb_app_key) + '&numeroConvenio=' + conv, {
    method: 'GET', headers: { Authorization: 'Bearer ' + token },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('BB consulta: HTTP ' + r.status);
  // codigoEstadoTituloCobranca: 06/07 = liquidado (varia); valorPagoSacado > 0 indica pagamento
  const pago = Number(j.valorPagoSacado || j.valorPago || 0) > 0 || [6, 7].includes(Number(j.codigoEstadoTituloCobranca));
  return { pago, raw: j };
}

function calcVencimento(concurso) {
  const maisUmDia = (ymd) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  let due;
  if (concurso.data_fim) due = maisUmDia(String(concurso.data_fim).slice(0, 10));
  else due = new Date(Date.now() + (parseInt(concurso.dias_vencimento) || 5) * 86400000).toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (due < amanha) due = amanha;
  return due;
}
async function criarCobranca(cand, concurso) {
  const due = calcVencimento(concurso);
  // Gateway Banco do Brasil
  if (concurso.pagamento_gateway === 'bb') {
    const cfg = await lerConfigBB(concurso.id);
    if (!cfg || !cfg.bb_client_id || !cfg.bb_client_secret || !cfg.bb_app_key || !cfg.bb_convenio) throw new Error('Configuração do Banco do Brasil incompleta neste concurso.');
    let full = cand;
    if (cand.id) { const q = await pool.query('SELECT * FROM candidatos WHERE id=$1', [cand.id]); if (q.rows[0]) full = { ...q.rows[0], protocolo: cand.protocolo || q.rows[0].protocolo }; }
    const bb = await bbRegistrarBoleto(cfg, full, Number(concurso.taxa_valor), due);
    const base = (process.env.PUBLIC_URL || '').trim();
    const invoiceUrl = (base || '') + '/boleto/' + encodeURIComponent(cand.protocolo || full.protocolo || '');
    return { provider: 'bb', paymentId: bb.nossoNumero, invoiceUrl, bb };
  }
  // Gateway ASAAS (padrão)
  const cliente = await asaas('/customers', 'POST', { name: cand.nome, cpfCnpj: cand.cpf, email: cand.email || undefined, mobilePhone: cand.telefone || undefined });
  const base = (process.env.PUBLIC_URL || '').trim();
  const cobranca = await asaas('/payments', 'POST', {
    customer: cliente.id, billingType: 'UNDEFINED', value: Number(concurso.taxa_valor),
    dueDate: due, description: (concurso.titulo || 'Inscrição') + ' — ' + cand.cargo,
    externalReference: cand.protocolo, callback: base ? { successUrl: base, autoRedirect: false } : undefined,
  });
  return { provider: 'asaas', customerId: cliente.id, paymentId: cobranca.id, invoiceUrl: cobranca.invoiceUrl };
}
async function lerConfigBB(concursoId) {
  const { rows } = await pool.query('SELECT id,bb_client_id,bb_client_secret,bb_app_key,bb_convenio,bb_carteira,bb_variacao,bb_agencia,bb_conta,bb_beneficiario_nome,bb_beneficiario_doc,bb_ambiente FROM concursos WHERE id=$1', [concursoId]);
  return rows[0] || null;
}
async function persistirPagamento(candId, pay) {
  if (pay.provider === 'bb') {
    await pool.query('UPDATE candidatos SET asaas_payment_id=$1, invoice_url=$2, bb_nosso_numero=$3, bb_linha_digitavel=$4, bb_codigo_barras=$5, bb_qrcode_pix=$6 WHERE id=$7',
      [pay.paymentId, pay.invoiceUrl, pay.bb.nossoNumero, pay.bb.linhaDigitavel, pay.bb.codigoBarras, pay.bb.qrCodePix, candId]);
  } else {
    await pool.query('UPDATE candidatos SET asaas_customer_id=$1, asaas_payment_id=$2, invoice_url=$3 WHERE id=$4',
      [pay.customerId, pay.paymentId, pay.invoiceUrl, candId]);
  }
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
app.get('/health', (req, res) => res.json({ ok: true, banco: temBanco, asaas: temAsaas, versao: 'multiempresa-v1' }));

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

    const cobrar = !concurso.gratuito && Number(concurso.taxa_valor) > 0 && (concurso.pagamento_gateway === 'bb' || temAsaas);
    if (!cobrar) return res.json({ ok: true, protocolo, nome, cargo, invoiceUrl: null, cobrar: false });
    try {
      const pay = await criarCobranca({ id, nome, cpf, email, telefone, cargo, protocolo }, concurso);
      await pool.query("UPDATE candidatos SET status='aguardando_pagamento' WHERE id=$1", [id]);
      await persistirPagamento(id, pay);
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
    `SELECT k.id, k.protocolo, k.cargo, k.status, k.invoice_url, k.criado_em, k.concurso_id,
            k.condicao_especial, (k.laudo_dados IS NOT NULL) AS tem_laudo, k.laudo_nome,
            c.titulo AS concurso, c.slug, c.gratuito, c.prova, c.pede_laudo, c.laudo_inicio_dt, c.laudo_fim_dt,
            c.pede_titulos, c.tipos_titulos, c.titulos_inicio_dt, c.titulos_fim_dt
     FROM candidatos k LEFT JOIN concursos c ON c.id=k.concurso_id
     WHERE k.cpf=$1 ORDER BY k.id DESC`, [cpf]);
  const ids = rows.map((r) => r.id);
  const concIds = Array.from(new Set(rows.map((r) => r.concurso_id).filter(Boolean)));
  const porCand = {};
  if (ids.length) {
    const t = await pool.query('SELECT id, candidato_id, tipo, filename FROM titulos WHERE candidato_id = ANY($1::int[]) ORDER BY id', [ids]);
    t.rows.forEach((x) => { (porCand[x.candidato_id] = porCand[x.candidato_id] || []).push({ id: x.id, tipo: x.tipo, filename: x.filename }); });
  }
  const agora = agoraBR();
  const fasesPorConc = {};
  if (concIds.length) {
    const f = await pool.query('SELECT id, concurso_id, nome, abertura, fechamento FROM recurso_fases WHERE concurso_id = ANY($1::int[]) ORDER BY id', [concIds]);
    f.rows.forEach((x) => { const c = calcFase(x.abertura, x.fechamento, agora); (fasesPorConc[x.concurso_id] = fasesPorConc[x.concurso_id] || []).push({ id: x.id, nome: x.nome, abertura: x.abertura, fechamento: x.fechamento, status: c.status, pode: c.pode }); });
  }
  const recursosPorCand = {};
  if (ids.length) {
    const rc = await pool.query(`SELECT r.id, r.candidato_id, r.texto, r.status, r.resposta, r.criado_em, r.anexo_nome, (r.anexo_dados IS NOT NULL) AS tem_anexo, f.nome AS fase_nome
      FROM recursos r LEFT JOIN recurso_fases f ON f.id=r.fase_id WHERE r.candidato_id = ANY($1::int[]) ORDER BY r.id DESC`, [ids]);
    rc.rows.forEach((x) => { (recursosPorCand[x.candidato_id] = recursosPorCand[x.candidato_id] || []).push(x); });
  }
  const inscricoes = rows.map((r) => {
    let tipos = []; try { tipos = JSON.parse(r.tipos_titulos || '[]'); } catch {}
    const ti = r.titulos_inicio_dt || null, tf = r.titulos_fim_dt || null;
    const tc = calcTitulos(!!r.pede_titulos, ti, tf, agora);
    return {
      id: r.id, protocolo: r.protocolo, cargo: r.cargo, status: r.status, invoice_url: r.invoice_url, criado_em: r.criado_em,
      concurso: r.concurso, slug: r.slug, gratuito: r.gratuito, prova: r.prova,
      pede_titulos: !!r.pede_titulos, tipos_titulos: tipos, titulos_inicio: ti, titulos_fim: tf,
      titulos_status: tc.status, pode_titulos: tc.pode, titulos: porCand[r.id] || [],
      recurso_fases: fasesPorConc[r.concurso_id] || [], meus_recursos: recursosPorCand[r.id] || [],
      pede_laudo: !!r.pede_laudo, condicao_especial: r.condicao_especial || '', tem_laudo: !!r.tem_laudo, laudo_nome: r.laudo_nome || '',
      laudo_inicio: r.laudo_inicio_dt || null, laudo_fim: r.laudo_fim_dt || null, empresa_id: r.empresa_id || null,
      laudo_status: calcJanelaLaudo(!!r.pede_laudo, r.laudo_inicio_dt, r.laudo_fim_dt, agora).status,
      pode_laudo: calcJanelaLaudo(!!r.pede_laudo, r.laudo_inicio_dt, r.laudo_fim_dt, agora).pode,
    };
  });
  res.json({ ok: true, nome: lg.rows[0].nome, inscricoes });
});
function calcFase(ab, fe, agora) {
  if (!ab || !fe) return { status: 'indefinido', pode: false };
  if (agora < ab) return { status: 'antes', pode: false };
  if (agora > fe) return { status: 'depois', pode: false };
  return { status: 'aberto', pode: true };
}
function calcJanelaLaudo(pede, ab, fe, agora) {
  if (!pede) return { status: 'off', pode: false };
  if (!ab && !fe) return { status: 'aberto', pode: true };
  if (ab && agora < ab) return { status: 'antes', pode: false };
  if (fe && agora > fe) return { status: 'depois', pode: false };
  return { status: 'aberto', pode: true };
}

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

app.post('/api/candidato/boleto', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const b = req.body || {};
  const cpf = await autenticaCandidato(b);
  if (!cpf) return res.status(401).json({ erro: 'Sessão inválida. Entre novamente.' });
  const cand = await pool.query('SELECT * FROM candidatos WHERE id=$1 AND cpf=$2', [parseInt(b.inscricao_id), cpf]);
  if (!cand.rows.length) return res.status(404).json({ erro: 'Inscrição não encontrada.' });
  const c = cand.rows[0];
  if (c.status === 'pago') return res.status(400).json({ erro: 'Esta inscrição já está paga.' });
  const concurso = await lerConcursoPorChave(String(c.concurso_id));
  if (!concurso) return res.status(404).json({ erro: 'Concurso não encontrado.' });
  if (concurso.gratuito || !(Number(concurso.taxa_valor) > 0)) return res.status(400).json({ erro: 'Esta inscrição é gratuita, não há boleto.' });
  if (c.invoice_url) return res.json({ ok: true, invoice_url: c.invoice_url });
  if (concurso.pagamento_gateway !== 'bb' && !temAsaas) return res.status(400).json({ erro: 'Pagamento indisponível no momento. Tente mais tarde.' });
  try {
    const pay = await criarCobranca({ id: c.id, nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, cargo: c.cargo, protocolo: c.protocolo }, concurso);
    await persistirPagamento(c.id, pay);
    res.json({ ok: true, invoice_url: pay.invoiceUrl });
  } catch (e) {
    res.status(500).json({ erro: 'Não foi possível gerar o boleto agora: ' + e.message });
  }
});
app.post('/api/candidato/laudo', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const b = req.body || {};
  const cpf = await autenticaCandidato(b);
  if (!cpf) return res.status(401).json({ erro: 'Sessão inválida. Entre novamente.' });
  const cand = await pool.query('SELECT k.id, c.pede_laudo, c.laudo_inicio_dt, c.laudo_fim_dt FROM candidatos k LEFT JOIN concursos c ON c.id=k.concurso_id WHERE k.id=$1 AND k.cpf=$2', [parseInt(b.inscricao_id), cpf]);
  if (!cand.rows.length) return res.status(404).json({ erro: 'Inscrição não encontrada.' });
  if (!cand.rows[0].pede_laudo) return res.status(403).json({ erro: 'Este concurso não solicita laudo/condição especial.' });
  const jl = calcJanelaLaudo(true, cand.rows[0].laudo_inicio_dt, cand.rows[0].laudo_fim_dt, agoraBR());
  if (!jl.pode) return res.status(403).json({ erro: jl.status === 'antes' ? 'O prazo para envio do laudo ainda não abriu.' : 'O prazo para envio do laudo está encerrado.' });
  const cond = String(b.condicao_especial || '').trim().slice(0, 1000);
  if (b.dataBase64) {
    const buf = decodeB64(b.dataBase64);
    if (!buf) return res.status(400).json({ erro: 'Arquivo inválido.' });
    const mime = mimeDe(buf);
    if (!mime) return res.status(400).json({ erro: 'Envie PDF, JPG ou PNG.' });
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo muito grande (máx. 5 MB).' });
    await pool.query('UPDATE candidatos SET condicao_especial=$1, laudo_mime=$2, laudo_dados=$3, laudo_nome=$4, pcd=TRUE WHERE id=$5',
      [cond, mime, buf, String(b.filename || 'laudo').slice(0, 200), cand.rows[0].id]);
  } else {
    await pool.query('UPDATE candidatos SET condicao_especial=$1 WHERE id=$2', [cond, cand.rows[0].id]);
  }
  res.json({ ok: true });
});
app.get('/api/candidato/laudo/:id', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const cpf = await autenticaCandidato({ cpf: req.query.cpf, senha: req.query.senha });
  if (!cpf) return res.status(401).send('Sessão inválida.');
  const { rows } = await pool.query('SELECT laudo_mime, laudo_dados, laudo_nome FROM candidatos WHERE id=$1 AND cpf=$2', [parseInt(req.params.id), cpf]);
  if (!rows.length || !rows[0].laudo_dados) return res.status(404).send('Sem laudo.');
  res.setHeader('Content-Type', rows[0].laudo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + (rows[0].laudo_nome || 'laudo') + '"');
  res.send(rows[0].laudo_dados);
});
app.get('/admin/candidato/:id/laudo', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT laudo_mime, laudo_dados, laudo_nome FROM candidatos WHERE id=$1', [parseInt(req.params.id)]);
  if (!rows.length || !rows[0].laudo_dados) return res.status(404).send('Sem laudo.');
  res.setHeader('Content-Type', rows[0].laudo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + (rows[0].laudo_nome || 'laudo') + '"');
  res.send(rows[0].laudo_dados);
});
app.post('/api/candidato/recurso', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const b = req.body || {};
  const cpf = await autenticaCandidato(b);
  if (!cpf) return res.status(401).json({ erro: 'Sessão inválida. Entre novamente.' });
  const cand = await pool.query('SELECT id, concurso_id FROM candidatos WHERE id=$1 AND cpf=$2', [parseInt(b.inscricao_id), cpf]);
  if (!cand.rows.length) return res.status(404).json({ erro: 'Inscrição não encontrada.' });
  const fase = await pool.query('SELECT * FROM recurso_fases WHERE id=$1 AND concurso_id=$2', [parseInt(b.fase_id), cand.rows[0].concurso_id]);
  if (!fase.rows.length) return res.status(404).json({ erro: 'Fase de recurso não encontrada.' });
  const cf = calcFase(fase.rows[0].abertura, fase.rows[0].fechamento, agoraBR());
  if (!cf.pode) return res.status(403).json({ erro: 'O prazo desta fase de recurso não está aberto.' });
  const texto = String(b.texto || '').trim();
  if (texto.length < 5) return res.status(400).json({ erro: 'Escreva o texto do recurso.' });
  let mime = null, buf = null, nome = null;
  if (b.dataBase64) {
    buf = decodeB64(b.dataBase64);
    if (!buf) return res.status(400).json({ erro: 'Anexo inválido.' });
    mime = mimeDe(buf);
    if (!mime) return res.status(400).json({ erro: 'Anexo deve ser PDF, JPG ou PNG.' });
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ erro: 'Anexo muito grande (máx. 5 MB).' });
    nome = String(b.filename || 'anexo').slice(0, 200);
  }
  await pool.query('INSERT INTO recursos (concurso_id,fase_id,candidato_id,texto,anexo_mime,anexo_dados,anexo_nome) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [cand.rows[0].concurso_id, fase.rows[0].id, cand.rows[0].id, texto.slice(0, 5000), mime, buf, nome]);
  res.json({ ok: true });
});
app.get('/api/candidato/recurso/:id/anexo', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const cpf = await autenticaCandidato({ cpf: req.query.cpf, senha: req.query.senha });
  if (!cpf) return res.status(401).send('Sessão inválida.');
  const { rows } = await pool.query('SELECT r.anexo_mime, r.anexo_dados, r.anexo_nome FROM recursos r JOIN candidatos k ON k.id=r.candidato_id WHERE r.id=$1 AND k.cpf=$2', [parseInt(req.params.id), cpf]);
  if (!rows.length || !rows[0].anexo_dados) return res.status(404).send('Sem anexo.');
  res.setHeader('Content-Type', rows[0].anexo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + (rows[0].anexo_nome || 'anexo') + '"');
  res.send(rows[0].anexo_dados);
});

// ---- Recursos: admin (banca) -------------------------------
app.get('/admin/recurso-fases.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ fases: [] });
  const cid = parseInt(req.query.concurso) || 0;
  const { rows } = await pool.query('SELECT id,nome,abertura,fechamento FROM recurso_fases WHERE concurso_id=$1 ORDER BY id', [cid]);
  const agora = agoraBR();
  res.json({ fases: rows.map((r) => ({ ...r, status: calcFase(r.abertura, r.fechamento, agora).status })) });
});
app.post('/admin/recurso-fase', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const b = req.body || {};
  const cid = parseInt(b.concurso_id) || 0;
  const nome = String(b.nome || '').trim().slice(0, 160);
  const ab = String(b.abertura || '').trim().slice(0, 16) || null;
  const fe = String(b.fechamento || '').trim().slice(0, 16) || null;
  if (!cid) return res.status(400).json({ erro: 'Selecione o concurso.' });
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da fase.' });
  if (b.id) { await pool.query('UPDATE recurso_fases SET nome=$1,abertura=$2,fechamento=$3 WHERE id=$4', [nome, ab, fe, b.id]); return res.json({ ok: true, id: b.id }); }
  const r = await pool.query('INSERT INTO recurso_fases (concurso_id,nome,abertura,fechamento) VALUES ($1,$2,$3,$4) RETURNING id', [cid, nome, ab, fe]);
  res.json({ ok: true, id: r.rows[0].id });
});
app.delete('/admin/recurso-fase/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('DELETE FROM recursos WHERE fase_id=$1', [req.params.id]);
  await pool.query('DELETE FROM recurso_fases WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.get('/admin/recursos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ recursos: [] });
  const cid = parseInt(req.query.concurso) || 0;
  const params = [cid]; let filtro = '';
  if (req.query.fase) { params.push(parseInt(req.query.fase)); filtro += ' AND r.fase_id=$' + params.length; }
  if (req.query.status) { params.push(req.query.status); filtro += ' AND r.status=$' + params.length; }
  const { rows } = await pool.query(`SELECT r.id, r.texto, r.status, r.resposta, r.criado_em, r.respondido_em, r.anexo_nome, (r.anexo_dados IS NOT NULL) AS tem_anexo,
      k.nome AS candidato, k.cpf, k.protocolo, f.nome AS fase_nome
    FROM recursos r JOIN candidatos k ON k.id=r.candidato_id LEFT JOIN recurso_fases f ON f.id=r.fase_id
    WHERE r.concurso_id=$1${filtro} ORDER BY r.id DESC`, params);
  res.json({ recursos: rows });
});
app.post('/admin/recurso/:id/responder', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const b = req.body || {};
  const status = ['deferido', 'indeferido', 'pendente'].includes(b.status) ? b.status : 'pendente';
  const resposta = String(b.resposta || '').trim().slice(0, 5000);
  await pool.query('UPDATE recursos SET status=$1, resposta=$2, respondido_em=now() WHERE id=$3', [status, resposta, req.params.id]);
  res.json({ ok: true });
});
app.get('/admin/recurso/:id/anexo', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT anexo_mime, anexo_dados, anexo_nome FROM recursos WHERE id=$1', [parseInt(req.params.id)]);
  if (!rows.length || !rows[0].anexo_dados) return res.status(404).send('Sem anexo.');
  res.setHeader('Content-Type', rows[0].anexo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + (rows[0].anexo_nome || 'anexo') + '"');
  res.send(rows[0].anexo_dados);
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

// ---- Empresas (multiempresa) -------------------------------
app.get('/admin/empresas.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ empresas: [] });
  const { rows } = await pool.query(`SELECT e.id, e.slug, e.nome, e.subtitulo, e.ativa, (e.logo_dados IS NOT NULL) AS tem_logo,
    (SELECT COUNT(*)::int FROM concursos c WHERE c.empresa_id=e.id) AS concursos FROM empresas e ORDER BY e.id`);
  res.json({ empresas: rows });
});
app.post('/admin/empresa', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const b = req.body || {};
  const nome = String(b.nome || '').trim().slice(0, 120);
  const sub = String(b.subtitulo || '').trim().slice(0, 160);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da empresa.' });
  let base = slugify(nome), slug = base, n = 2;
  while (true) { const q = await pool.query('SELECT id FROM empresas WHERE slug=$1 AND id<>$2', [slug, b.id || 0]); if (!q.rows.length) break; slug = base + '-' + (n++); }
  if (b.id) { await pool.query('UPDATE empresas SET nome=$1, subtitulo=$2, slug=$3, ativa=$4 WHERE id=$5', [nome, sub, slug, b.ativa !== false, b.id]); return res.json({ ok: true, id: b.id, slug }); }
  const r = await pool.query('INSERT INTO empresas (slug,nome,subtitulo) VALUES ($1,$2,$3) RETURNING id', [slug, nome, sub]);
  res.json({ ok: true, id: r.rows[0].id, slug });
});
app.post('/admin/empresa/:id/logo', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const buf = decodeB64((req.body || {}).dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione uma imagem.' });
  const mime = mimeDe(buf);
  if (mime !== 'image/png' && mime !== 'image/jpeg') return res.status(400).json({ erro: 'Envie PNG ou JPG.' });
  if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem muito grande (máx. 2 MB).' });
  await pool.query('UPDATE empresas SET logo_mime=$1, logo_dados=$2 WHERE id=$3', [mime, buf, req.params.id]);
  res.json({ ok: true });
});
app.get('/empresa/:id/logo', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT logo_mime, logo_dados FROM empresas WHERE id=$1 OR slug=$2', [parseInt(req.params.id) || 0, req.params.id]);
  if (!rows.length || !rows[0].logo_dados) return res.redirect('/logo.png');
  res.setHeader('Content-Type', rows[0].logo_mime || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(rows[0].logo_dados);
});
app.delete('/admin/empresa/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const q = await pool.query('SELECT COUNT(*)::int n FROM concursos WHERE empresa_id=$1', [req.params.id]);
  if (q.rows[0].n) return res.status(400).json({ erro: 'Esta empresa tem ' + q.rows[0].n + ' concurso(s). Exclua ou mova os concursos antes.' });
  const t = await pool.query('SELECT COUNT(*)::int n FROM empresas');
  if (t.rows[0].n <= 1) return res.status(400).json({ erro: 'É preciso manter ao menos uma empresa.' });
  await pool.query('DELETE FROM empresas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/admin/concursos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ concursos: [] });
  const emp = parseInt(req.query.empresa) || 0;
  const filtro = emp ? 'WHERE c.empresa_id=$1' : '';
  const params = emp ? [emp] : [];
  const { rows } = await pool.query(`
    SELECT c.*, 
      (SELECT COUNT(*)::int FROM candidatos k WHERE k.concurso_id=c.id) AS inscritos,
      (SELECT COUNT(*)::int FROM candidatos k WHERE k.concurso_id=c.id AND k.status='pago') AS pagos
    FROM concursos c ${filtro} ORDER BY c.criado_em DESC`, params);
  res.json({ concursos: rows.map((r) => ({ ...parseConcurso(r), inscritos: r.inscritos, pagos: r.pagos,
    pagamento_gateway: r.pagamento_gateway || 'asaas', bb_client_id: r.bb_client_id || '', bb_app_key: r.bb_app_key || '',
    bb_convenio: r.bb_convenio || '', bb_carteira: r.bb_carteira || '', bb_variacao: r.bb_variacao || '',
    bb_agencia: r.bb_agencia || '', bb_conta: r.bb_conta || '', bb_beneficiario_nome: r.bb_beneficiario_nome || '',
    bb_beneficiario_doc: r.bb_beneficiario_doc || '', bb_ambiente: r.bb_ambiente || 'homologacao', bb_secret_set: !!r.bb_client_secret })) });
});

app.post('/admin/concurso/:id/pagamento', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const id = parseInt(req.params.id);
  const b = req.body || {};
  const lim = (v) => String(v == null ? '' : v).trim().slice(0, 300);
  const gateway = (b.pagamento_gateway === 'bb') ? 'bb' : 'asaas';
  const amb = (b.bb_ambiente === 'producao') ? 'producao' : 'homologacao';
  // client_secret só é atualizado se enviado (não vazio); senão mantém o atual
  const temSecret = String(b.bb_client_secret || '').trim().length > 0;
  const campos = ['pagamento_gateway=$1', 'bb_client_id=$2', 'bb_app_key=$3', 'bb_convenio=$4', 'bb_carteira=$5',
    'bb_variacao=$6', 'bb_agencia=$7', 'bb_conta=$8', 'bb_beneficiario_nome=$9', 'bb_beneficiario_doc=$10', 'bb_ambiente=$11'];
  const vals = [gateway, lim(b.bb_client_id), lim(b.bb_app_key), lim(b.bb_convenio), lim(b.bb_carteira),
    lim(b.bb_variacao), lim(b.bb_agencia), lim(b.bb_conta), lim(b.bb_beneficiario_nome), lim(b.bb_beneficiario_doc), amb];
  if (temSecret) { campos.push('bb_client_secret=$12'); vals.push(String(b.bb_client_secret).trim()); vals.push(id); }
  else vals.push(id);
  await pool.query(`UPDATE concursos SET ${campos.join(',')} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
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
      aberto: bool(b.aberto), gratuito: bool(b.gratuito), pede_titulos: bool(b.pede_titulos), pede_laudo: bool(b.pede_laudo),
      laudo_inicio_dt: dtnull(b.laudo_inicio), laudo_fim_dt: dtnull(b.laudo_fim),
      empresa_id: parseInt(b.empresa_id) || null,
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
      await pool.query(`UPDATE concursos SET slug=$1,titulo=$2,orgao=$3,periodo=$4,taxa=$5,prova=$6,vagas=$7,pdf_url=$8,taxa_valor=$9,dias_vencimento=$10,cargos=$11,aberto=$12,gratuito=$13,pede_titulos=$14,tipos_titulos=$15,data_inicio=$16,data_fim=$17,data_encerramento=$18,titulos_inicio_dt=$19,titulos_fim_dt=$20,pede_laudo=$21,laudo_inicio_dt=$22,laudo_fim_dt=$23,empresa_id=COALESCE($24,empresa_id) WHERE id=$25`,
        [slug, dados.titulo, dados.orgao, dados.periodo, dados.taxa, dados.prova, dados.vagas, dados.pdf_url, dados.taxa_valor, dados.dias_vencimento, JSON.stringify(cargos), dados.aberto, dados.gratuito, dados.pede_titulos, JSON.stringify(tipos), dados.data_inicio, dados.data_fim, dados.data_encerramento, dados.titulos_inicio_dt, dados.titulos_fim_dt, dados.pede_laudo, dados.laudo_inicio_dt, dados.laudo_fim_dt, dados.empresa_id, b.id]);
      return res.json({ ok: true, id: b.id, slug });
    } else {
      const ins = await pool.query(`INSERT INTO concursos (slug,titulo,orgao,periodo,taxa,prova,vagas,pdf_url,taxa_valor,dias_vencimento,cargos,aberto,gratuito,pede_titulos,tipos_titulos,data_inicio,data_fim,data_encerramento,titulos_inicio_dt,titulos_fim_dt,pede_laudo,laudo_inicio_dt,laudo_fim_dt,empresa_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,COALESCE($24,(SELECT id FROM empresas ORDER BY id LIMIT 1))) RETURNING id`,
        [slug, dados.titulo, dados.orgao, dados.periodo, dados.taxa, dados.prova, dados.vagas, dados.pdf_url, dados.taxa_valor, dados.dias_vencimento, JSON.stringify(cargos), dados.aberto, dados.gratuito, dados.pede_titulos, JSON.stringify(tipos), dados.data_inicio, dados.data_fim, dados.data_encerramento, dados.titulos_inicio_dt, dados.titulos_fim_dt, dados.pede_laudo, dados.laudo_inicio_dt, dados.laudo_fim_dt, dados.empresa_id]);
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
    const pay = await criarCobranca({ id: c.id, nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, cargo: c.cargo, protocolo: c.protocolo }, concurso);
    await pool.query("UPDATE candidatos SET status='aguardando_pagamento' WHERE id=$1", [c.id]);
    await persistirPagamento(c.id, pay);
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
  const brasao = '';
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
  const brasao = '';
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
  return `<div class="cab"><div><div class="org">${e(concurso.orgao || 'Processo Seletivo')}</div><h1>${e(concurso.titulo || '')}</h1><h2>${e(docNome)}</h2></div></div>`;
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
    g.cands.forEach((c, i) => { linhas += `<tr><td class="num">${i + 1}</td><td>${e(c.nome)}</td><td>${e(c.cpf)}</td><td>${e(c.cargo || '')}</td></tr>`; });
    corpo += `<div class="pagina">
      <div style="text-align:center">
        <div class="org" style="font-size:11px;color:#5b7183;text-transform:uppercase;font-weight:700">${e(concurso.orgao || '')}</div>
        <div style="font-size:13px">${e(concurso.titulo || '')}</div>
        <div style="font-weight:700;color:#0b3a5e;font-size:15px;margin-top:4px">FRENTE DE SALA</div>
      </div>
      <div class="salahdr">${e(((s.sala || '') + (s.sala_obs ? (' - ' + s.sala_obs) : '')).toUpperCase())}</div>
      <div class="subhdr">${e(s.escola)}</div>
      <div class="qtd">(${g.cands.length} candidatos)</div>
      <table><thead><tr><th class="num">#</th><th>Nome do Candidato</th><th>CPF</th><th>Cargo</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
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
    g.cands.forEach((c, i) => { linhas += `<tr><td class="num">${i + 1}</td><td>${e(c.nome)}</td><td>${e(c.cargo || '')}</td><td>${e(c.sala)}${c.sala_obs ? (' (' + e(c.sala_obs) + ')') : ''}</td></tr>`; });
    corpo += `<div class="pagina">${cabHTML(concurso, 'Frente de Prédio — Locais de Prova')}
      <div class="linha-sala">${e(s.escola)}${s.endereco ? (' — ' + e(s.endereco)) : ''}</div>
      <table><thead><tr><th class="num">#</th><th>Nome</th><th>Cargo</th><th>Sala</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  });
  res.send(relShell('Frente de Prédio', corpo));
});

// ---- Cartões-resposta --------------------------------------
function cartaoShell(corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cartões-Resposta</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#1a2b4a;font-size:12px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4 portrait;margin:8mm}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .pagina{width:190mm;margin:0 auto;padding:8mm 0}
 .cartao{position:relative;border:1.5px solid #1a2b4a;border-radius:8px;padding:16px 18px}
 .mark{position:absolute;width:28px;height:28px}
 .mark.tl{top:-2px;left:-2px;border-top:5px solid #111;border-left:5px solid #111}
 .mark.tr{top:-2px;right:-2px;border-top:5px solid #111;border-right:5px solid #111}
 .mark.bl{bottom:-2px;left:-2px;border-bottom:5px solid #111;border-left:5px solid #111}
 .mark.br{bottom:-2px;right:-2px;border-bottom:5px solid #111;border-right:5px solid #111}
 .topo{display:flex;gap:14px;align-items:stretch;margin-bottom:12px}
 .qr{flex:none;text-align:center;border:1px solid #1a2b4a;border-radius:6px;padding:8px}
 .qr svg{width:108px;height:108px;display:block}
 .qr .idnum{font-size:8px;margin-top:5px;line-height:1.3}
 .dados{flex:1;border:1px solid #1a2b4a;border-radius:6px;padding:12px 14px;font-size:12px;line-height:2}
 .dados .l1{font-weight:700}
 .dados .assin{margin-top:8px;border-top:1px dashed #8a99b3;padding-top:8px;font-size:11px}
 .assin-linha{height:30px;border-bottom:1px solid #1a2b4a;margin-top:18px}
 .ausente{flex:none;width:132px;border:1px solid #1a2b4a;border-radius:6px;padding:10px 8px;text-align:center;font-size:9px;display:flex;flex-direction:column;justify-content:center;gap:6px}
 .ausente .lbl{font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#5b7183}
 .ausente .nome{font-weight:700;font-size:11px}
 .ausente .bolha{width:30px;height:30px;border:2px solid #1a2b4a;border-radius:50%;margin:2px auto 0}
 .meio{display:flex;gap:14px;align-items:center;margin:0 0 14px;border:1px solid #1a2b4a;border-radius:6px;padding:10px 14px}
 .idbox{flex:1;text-align:center;font-size:9px;font-weight:700;letter-spacing:.03em}
 .idbox .idcode{display:inline-block;margin-top:5px;font-size:17px;letter-spacing:3px}
 .instr{flex:1.3;font-size:9px;line-height:1.6;border-left:1px solid #cdd8df;padding-left:14px}
 .grade{display:flex;gap:64px;justify-content:center;margin-top:6px}
 .col{flex:none}
 .qrow{display:flex;align-items:center;gap:6px;margin:5px 0}
 .qn{width:26px;text-align:right;font-weight:700;font-size:12px}
 .opt{display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border:1.3px solid #1a2b4a;border-radius:50%;font-size:10px;color:#1a2b4a}
 @media print{
   .barra-print{display:none}
   .pagina{width:auto;margin:0;padding:0}
   .pagina + .pagina{break-before:page;page-break-before:always}
   .cartao{break-inside:avoid}
 }
</style></head><body>
<div class="barra-print"><span>Confira e use <b>Imprimir → Salvar como PDF</b> (1 cartão por página).</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
${corpo}
</body></html>`;
}
app.get('/admin/relatorio/cartoes.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const salaId = parseInt(req.query.sala) || 0;
  const cargo = req.query.cargo || '';
  const questoes = Math.min(120, Math.max(1, parseInt(req.query.questoes) || 30));
  const alternativas = Math.min(6, Math.max(2, parseInt(req.query.alternativas) || 4));
  const params = [concurso.id]; let filtro = '';
  if (salaId) { params.push(salaId); filtro += ' AND s.id=$' + params.length; }
  if (cargo) { params.push(cargo); filtro += ' AND k.cargo=$' + params.length; }
  const { rows } = await pool.query(`SELECT k.nome,k.cpf,k.protocolo,k.cargo, s.nome AS sala, s.obs AS sala_obs, e.nome AS escola
    FROM candidatos k JOIN salas s ON s.id=k.sala_id JOIN escolas e ON e.id=s.escola_id
    WHERE k.concurso_id=$1${filtro} ORDER BY e.id, s.id, k.nome`, params);
  const e = escapeHtml;
  const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
  const fmtData = (v) => { v = String(v || '').trim(); const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? (m[3] + '/' + m[2] + '/' + m[1]) : v; };
  const turnoTxt = e(String(req.query.turno || '').trim() || '____________');
  const dataTxt = e(fmtData(req.query.data) || (concurso.prova ? String(concurso.prova) : '____/____/________'));
  const qrs = await Promise.all(rows.map((r) => QRCode.toString(String(r.protocolo || ''), { type: 'svg', margin: 0, width: 108 }).catch(() => '')));
  function opts() { let s = ''; for (let a = 0; a < alternativas; a++) s += `<span class="opt">${letras[a]}</span>`; return s; }
  function grade() {
    const meta = Math.ceil(questoes / 2); let c1 = '', c2 = '';
    for (let q = 1; q <= questoes; q++) { const row = `<div class="qrow"><span class="qn">${q}</span>${opts()}</div>`; if (q <= meta) c1 += row; else c2 += row; }
    return `<div class="grade"><div class="col">${c1}</div><div class="col">${c2}</div></div>`;
  }
  let corpo = '';
  if (!rows.length) corpo = `<div class="pagina"><p style="padding:20px">Nenhum candidato alocado com esses filtros.</p></div>`;
  rows.forEach((r, i) => {
    const salaTxt = e(((r.sala || '') + (r.sala_obs ? (' - ' + r.sala_obs) : '')).toUpperCase());
    corpo += `<div class="pagina"><div class="cartao">
      <span class="mark tl"></span><span class="mark tr"></span><span class="mark bl"></span><span class="mark br"></span>
      <div class="topo">
        <div class="qr">${qrs[i]}<div class="idnum">INSCRIÇÃO<br><b>${e(r.protocolo || '')}</b></div></div>
        <div class="dados">
          <div class="l1">EDITAL: ${e(concurso.titulo || '')} &nbsp;•&nbsp; TURNO: ${turnoTxt}</div>
          <div>${e(concurso.orgao || '')}</div>
          <div><b>SALA ${salaTxt}</b> &nbsp;•&nbsp; DATA: ${dataTxt}</div>
          <div>CANDIDATO: <b>${e(r.nome || '')}</b></div>
          <div>CPF: ${e(r.cpf || '')} &nbsp;•&nbsp; INSCRIÇÃO: ${e(r.protocolo || '')}</div>
          <div>CARGO: <b>${e(r.cargo || '')}</b></div>
          <div class="assin">ASSINATURA DO CANDIDATO:<div class="assin-linha"></div></div>
        </div>
        <div class="ausente">
          <div class="lbl">Uso do fiscal de sala</div>
          <div class="nome">Candidato Ausente</div>
          <div>Preencha se faltou:</div>
          <div class="bolha"></div>
        </div>
      </div>
      <div class="meio">
        <div class="idbox">CÓDIGO DE IDENTIFICAÇÃO — NÃO RASURAR<br><span class="idcode">${e(r.protocolo || '')}</span></div>
        <div class="instr"><b>INSTRUÇÕES DE PREENCHIMENTO</b><br>• Não rasure o cartão-resposta. • Use somente caneta azul ou preta. • Preencha todo o círculo: ●</div>
      </div>
      ${grade()}
    </div></div>`;
  });
  res.send(cartaoShell(corpo));
});

// ---- Etiquetas de malote (Pimaco A4350: 2x5, 99x55,8mm) ----
app.get('/admin/relatorio/etiquetas.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  if (!concurso) return res.status(400).send('Concurso inválido.');
  const e = escapeHtml;
  const turno = e(String(req.query.turno || '').trim() || '________');
  const data = e(concurso.prova ? String(concurso.prova) : '____/____/____');
  const { rows } = await pool.query(`SELECT k.cargo, s.id AS sala_id, s.nome AS sala, s.obs, e.id AS escola_id, e.nome AS escola, e.endereco
    FROM candidatos k JOIN salas s ON s.id=k.sala_id JOIN escolas e ON e.id=s.escola_id
    WHERE k.concurso_id=$1 ORDER BY e.id, s.id`, [concurso.id]);
  // agrupa por sala: qtd + cargos distintos
  const bySala = {}, ord = [];
  rows.forEach((r) => {
    if (!bySala[r.sala_id]) { bySala[r.sala_id] = { r, qtd: 0, cargos: new Set() }; ord.push(r.sala_id); }
    bySala[r.sala_id].qtd++; if (r.cargo) bySala[r.sala_id].cargos.add(r.cargo);
  });
  const etiquetas = ord.map((sid) => {
    const g = bySala[sid], s = g.r;
    const salaTxt = ((s.sala || '') + (s.obs ? (' - ' + s.obs) : '')).toUpperCase();
    const cargos = Array.from(g.cargos).sort().join(', ') || '—';
    return `<div class="etq">
      <div class="tag">LOCAL DE PROVA · MALOTE — ${e(concurso.titulo || '')}</div>
      <div class="sala">SALA ${e(salaTxt)}</div>
      <div class="esc">${e(s.escola || '')}</div>
      <div class="row"><b>Cargos:</b> ${e(cargos)}</div>
      <div class="row"><b>Turno:</b> ${turno} &nbsp;&nbsp; <b>Data:</b> ${data}</div>
      <div class="qtd">${g.qtd} CANDIDATO(S)</div>
    </div>`;
  });
  // páginas de 10 etiquetas
  let corpo = '';
  if (!etiquetas.length) corpo = '<div class="folha"><div class="etq">Nenhuma sala com candidatos alocados.</div></div>';
  for (let i = 0; i < etiquetas.length; i += 10) corpo += `<div class="folha">${etiquetas.slice(i, i + 10).join('')}</div>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de Malote</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#1a2b4a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4;margin:0}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .folha{width:210mm;min-height:297mm;padding:9mm 5mm 0;margin:0 auto;display:grid;grid-template-columns:repeat(2,99mm);grid-auto-rows:55.8mm;column-gap:2mm;row-gap:0;background:#fff}
 .etq{padding:5mm;overflow:hidden;border:1px dashed #e2e6ea;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
 .etq .tag{font-size:8px;letter-spacing:.08em;color:#5b7183;font-weight:700;text-transform:uppercase}
 .etq .sala{font-size:16px;font-weight:800;color:#0b2a4a;margin-top:3px;line-height:1.1}
 .etq .esc{font-size:11px;margin-top:3px;font-weight:600}
 .etq .row{font-size:10px;margin-top:4px}
 .etq .qtd{font-size:14px;font-weight:800;margin-top:6px;color:#0b2a4a}
 @media print{.barra-print{display:none} .etq{border:none} .folha + .folha{break-before:page;page-break-before:always}}
</style></head><body>
<div class="barra-print"><span>Etiquetas Pimaco A4350 (10 por folha). <b>Imprima em escala 100%</b> e teste antes numa folha comum.</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
${corpo}
</body></html>`;
  res.send(html);
});

// ---- Banco de Questões (admin) -----------------------------
app.get('/admin/questoes.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ questoes: [] });
  const q = req.query; const where = []; const params = [];
  if (q.disciplina) { params.push('%' + q.disciplina + '%'); where.push('disciplina ILIKE $' + params.length); }
  if (q.nivel) { params.push(q.nivel); where.push('nivel=$' + params.length); }
  if (q.cargo) { params.push('%' + q.cargo + '%'); where.push('cargo ILIKE $' + params.length); }
  if (q.busca) { params.push('%' + q.busca + '%'); where.push('enunciado ILIKE $' + params.length); }
  const w = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const { rows } = await pool.query(`SELECT id,enunciado,alternativas,correta,disciplina,nivel,cargo,(imagem_dados IS NOT NULL) AS tem_imagem FROM questoes ${w} ORDER BY id DESC LIMIT 500`, params);
  res.json({ questoes: rows.map((r) => { let a = []; try { a = JSON.parse(r.alternativas || '[]'); } catch {} return { id: r.id, enunciado: r.enunciado, alternativas: a, correta: r.correta, disciplina: r.disciplina, nivel: r.nivel, cargo: r.cargo, tem_imagem: r.tem_imagem }; }) });
});
app.post('/admin/questao', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const b = req.body || {};
  const enunciado = String(b.enunciado || '').trim();
  const alts = Array.isArray(b.alternativas) ? b.alternativas.map((x) => String(x || '').trim()).filter((x) => x !== '') : [];
  const correta = Math.max(0, Math.min(alts.length - 1, parseInt(b.correta) || 0));
  if (!enunciado) return res.status(400).json({ erro: 'Informe o enunciado.' });
  if (alts.length < 2) return res.status(400).json({ erro: 'Informe pelo menos 2 alternativas.' });
  const disc = String(b.disciplina || '').trim().slice(0, 120);
  const nivel = String(b.nivel || '').trim().slice(0, 40);
  const cargo = String(b.cargo || '').trim().slice(0, 120);
  if (b.id) {
    await pool.query('UPDATE questoes SET enunciado=$1,alternativas=$2,correta=$3,disciplina=$4,nivel=$5,cargo=$6 WHERE id=$7', [enunciado, JSON.stringify(alts), correta, disc, nivel, cargo, b.id]);
    return res.json({ ok: true, id: b.id });
  }
  const r = await pool.query('INSERT INTO questoes (enunciado,alternativas,correta,disciplina,nivel,cargo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [enunciado, JSON.stringify(alts), correta, disc, nivel, cargo]);
  res.json({ ok: true, id: r.rows[0].id });
});
app.delete('/admin/questao/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('DELETE FROM questoes WHERE id=$1', [req.params.id]); res.json({ ok: true });
});
app.post('/admin/questao/:id/imagem', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const buf = decodeB64((req.body || {}).dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione uma imagem.' });
  const mime = mimeDe(buf);
  if (mime !== 'image/jpeg' && mime !== 'image/png') return res.status(400).json({ erro: 'Envie JPG ou PNG.' });
  if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem muito grande (máx. 3 MB).' });
  await pool.query('UPDATE questoes SET imagem_mime=$1,imagem_dados=$2 WHERE id=$3', [mime, buf, req.params.id]);
  res.json({ ok: true });
});
app.post('/admin/questao/:id/imagem/remover', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('UPDATE questoes SET imagem_mime=NULL,imagem_dados=NULL WHERE id=$1', [req.params.id]); res.json({ ok: true });
});
app.get('/admin/questao/:id/imagem', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT imagem_mime,imagem_dados FROM questoes WHERE id=$1', [req.params.id]);
  if (!rows.length || !rows[0].imagem_dados) return res.status(404).send('Sem imagem.');
  res.setHeader('Content-Type', rows[0].imagem_mime || 'image/png');
  res.send(rows[0].imagem_dados);
});

// ---- Geração do caderno de prova ---------------------------
app.get('/admin/prova.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const concurso = await lerConcursoPorChave(String(req.query.concurso || ''));
  const titulo = String(req.query.titulo || 'Prova Objetiva').slice(0, 160);
  const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x)).filter(Boolean);
  if (!ids.length) return res.status(400).send('Selecione ao menos uma questão.');
  const { rows } = await pool.query('SELECT id,enunciado,alternativas,imagem_mime,imagem_dados FROM questoes WHERE id = ANY($1::int[])', [ids]);
  const byId = {}; rows.forEach((r) => byId[r.id] = r);
  const ordered = ids.map((i) => byId[i]).filter(Boolean);
  const e = escapeHtml;
  let body = '';
  ordered.forEach((q, idx) => {
    let alts = []; try { alts = JSON.parse(q.alternativas || '[]'); } catch {}
    const img = q.imagem_dados ? `<div class="qimg"><img src="data:${q.imagem_mime || 'image/png'};base64,${Buffer.from(q.imagem_dados).toString('base64')}"></div>` : '';
    const altHtml = alts.map((a, i) => `<div class="alt"><span class="letra">${String.fromCharCode(65 + i)})</span> ${e(a)}</div>`).join('');
    body += `<div class="questao"><div class="enun"><span class="qnum">${idx + 1}.</span> ${e(q.enunciado)}</div>${img}<div class="alts">${altHtml}</div></div>`;
  });
  const org = concurso ? e(concurso.orgao || '') : '';
  const edital = concurso ? e(concurso.titulo || '') : '';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(titulo)}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#111;font-size:12px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4 portrait;margin:14mm}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .folha{max-width:780px;margin:0 auto;padding:16px 18px}
 .cab{text-align:center;border-bottom:2px solid #0b3a5e;padding-bottom:10px;margin-bottom:10px}
 .cab .org{font-size:12px;color:#5b7183;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
 .cab .edital{font-size:15px;color:#0b3a5e;font-weight:700;margin-top:2px}
 .cab .tprova{font-size:13px;font-weight:600;margin-top:2px}
 .idbox{border:1px solid #000;border-radius:4px;padding:10px 12px;margin-bottom:16px;font-size:11px;line-height:2.1}
 .questao{margin-bottom:16px;break-inside:avoid;page-break-inside:avoid}
 .enun{font-size:12px;line-height:1.55;text-align:justify}
 .qnum{font-weight:700}
 .qimg{margin:8px 0}
 .qimg img{max-width:75%;max-height:60mm;display:block}
 .alts{margin-top:6px}
 .alt{font-size:12px;margin:4px 0;padding-left:20px;line-height:1.4}
 .letra{font-weight:700}
 @media print{.barra-print{display:none} .folha{max-width:none;margin:0;padding:0}}
</style></head><body>
<div class="barra-print"><span>Confira e use <b>Imprimir → Salvar como PDF</b>.</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
<div class="folha">
  <div class="cab"><div class="org">${org}</div><div class="edital">${edital}</div><div class="tprova">${e(titulo)}</div></div>
  <div class="idbox">
    <div>NOME: ____________________________________________________________</div>
    <div>INSCRIÇÃO: ____________________ &nbsp; SALA: ____________ &nbsp; ASSINATURA: ____________________</div>
  </div>
  ${body}
</div>
</body></html>`;
  res.send(html);
});

// ---- Importar candidatos (planilha) ------------------------
app.post('/admin/concurso/:id/importar', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const cid = parseInt(req.params.id);
  const b = req.body || {};
  const lista = Array.isArray(b.candidatos) ? b.candidatos : [];
  if (!lista.length) return res.status(400).json({ erro: 'Nenhum candidato para importar.' });
  const status = (b.status === 'pago') ? 'pago' : 'inscrito';
  const ex = await pool.query('SELECT cpf FROM candidatos WHERE concurso_id=$1', [cid]);
  const existentes = new Set(ex.rows.map((r) => soDigitos(r.cpf)));
  const vistos = new Set();
  const parseNasc = (v) => {
    v = String(v || '').trim(); if (!v) return null;
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  };
  let importados = 0, pulados = 0;
  for (const row of lista) {
    const nome = String(row.nome || '').trim();
    const cpf = soDigitos(row.cpf);
    if (!nome || cpf.length !== 11) { pulados++; continue; }
    if (existentes.has(cpf) || vistos.has(cpf)) { pulados++; continue; }
    vistos.add(cpf);
    const cargo = String(row.cargo || '').trim() || 'Não informado';
    const pcd = /^(sim|s|true|1|x|pcd)$/i.test(String(row.pcd || '').trim());
    await pool.query(
      `INSERT INTO candidatos (nome,cpf,nascimento,email,telefone,sexo,cargo,pcd,nome_social,cidade,uf,concurso_id,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [nome, cpf, parseNasc(row.nascimento), String(row.email || '').trim() || null, String(row.telefone || '').trim() || null,
       String(row.sexo || '').trim() || null, cargo, pcd, String(row.nome_social || '').trim() || null,
       String(row.cidade || '').trim() || null, String(row.uf || '').trim().toUpperCase().slice(0, 2) || null, cid, status]);
    importados++;
  }
  await pool.query("UPDATE candidatos SET protocolo='SLX2026'||LPAD(id::text,5,'0') WHERE concurso_id=$1 AND (protocolo IS NULL OR protocolo='')", [cid]);
  res.json({ ok: true, importados, pulados });
});

// ---- Prova Online ------------------------------------------
function gerarCodigo() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function restanteSeg(a) { if (!a.iniciado_em) return a.duracao_min * 60; const fim = new Date(a.iniciado_em).getTime() + a.duracao_min * 60000; return Math.max(0, Math.floor((fim - Date.now()) / 1000)); }
async function questoesParaProva(qids) {
  if (!qids.length) return [];
  const { rows } = await pool.query('SELECT id,enunciado,alternativas,imagem_mime,imagem_dados FROM questoes WHERE id = ANY($1::int[])', [qids]);
  const byId = {}; rows.forEach((r) => byId[r.id] = r);
  return qids.map((i) => byId[i]).filter(Boolean).map((q) => { let a = []; try { a = JSON.parse(q.alternativas || '[]'); } catch {} return { id: q.id, enunciado: q.enunciado, alternativas: a, imagem: q.imagem_dados ? ('data:' + (q.imagem_mime || 'image/png') + ';base64,' + Buffer.from(q.imagem_dados).toString('base64')) : null }; });
}
async function finalizarProva(a) {
  let resp = {}; try { resp = JSON.parse(a.respostas || '{}'); } catch {}
  let nota = 0;
  if (a.tipo === 'pdf') {
    let gab = []; try { gab = JSON.parse(a.gabarito || '[]'); } catch {}
    for (let i = 0; i < gab.length; i++) { if (gab[i] != null && gab[i] !== '' && String(resp[i + 1]) === String(gab[i])) nota++; }
  } else {
    let qids = []; try { qids = JSON.parse(a.questao_ids || '[]'); } catch {}
    if (qids.length) { const c = await pool.query('SELECT id,correta FROM questoes WHERE id = ANY($1::int[])', [qids]); c.rows.forEach((q) => { if (String(resp[q.id]) === String(q.correta)) nota++; }); }
  }
  await pool.query("UPDATE prova_respostas SET status='finalizado', finalizado_em=now(), nota=$1 WHERE id=$2", [nota, a.id]);
  a.status = 'finalizado'; a.nota = nota; return nota;
}
function fmtDTBR(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? (m[3] + '/' + m[2] + '/' + m[1] + ' às ' + m[4] + ':' + m[5]) : s; }
function janelaEntrada(a) {
  if (!a.inicio_em) return { pode: true };
  const ini = new Date(a.inicio_em + ':00-03:00').getTime();
  const now = Date.now();
  if (now < ini) return { pode: false, motivo: 'antes' };
  if (a.tolerancia_min > 0) { const fim = ini + a.tolerancia_min * 60000; if (now > fim) return { pode: false, motivo: 'encerrado' }; }
  return { pode: true };
}
async function autenticaProva(cpf, codigo) {
  cpf = soDigitos(cpf); codigo = String(codigo || '').trim().toUpperCase();
  if (cpf.length !== 11 || !codigo) return null;
  const { rows } = await pool.query(`SELECT pr.*, p.titulo,p.duracao_min,p.max_saidas,p.questao_ids,p.ativa,p.inicio_em,p.tolerancia_min,
      p.tipo,p.num_questoes,p.num_alternativas,p.gabarito,(p.pdf_dados IS NOT NULL) AS tem_pdf, k.nome
    FROM prova_respostas pr JOIN provas_online p ON p.id=pr.prova_id JOIN candidatos k ON k.id=pr.candidato_id
    WHERE k.cpf=$1 AND pr.codigo=$2 LIMIT 1`, [cpf, codigo]);
  return rows[0] || null;
}
async function refreshTempo(a) { if (a.status === 'em_andamento' && a.iniciado_em && restanteSeg(a) <= 0) await finalizarProva(a); return a; }

// Admin: gerenciar provas online
app.get('/admin/provas.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ provas: [] });
  const cid = parseInt(req.query.concurso) || 0;
  const w = cid ? 'WHERE concurso_id=$1' : ''; const p = cid ? [cid] : [];
  const { rows } = await pool.query(`SELECT id,concurso_id,titulo,duracao_min,max_saidas,questao_ids,ativa,inicio_em,tolerancia_min,tipo,num_questoes,num_alternativas,gabarito,(pdf_dados IS NOT NULL) AS tem_pdf FROM provas_online ${w} ORDER BY id DESC`, p);
  res.json({ provas: rows.map((r) => { let q = []; try { q = JSON.parse(r.questao_ids || '[]'); } catch {} let g = []; try { g = JSON.parse(r.gabarito || '[]'); } catch {} return { id: r.id, concurso_id: r.concurso_id, titulo: r.titulo, duracao_min: r.duracao_min, max_saidas: r.max_saidas, questao_ids: q, num_questoes: (r.tipo === 'pdf' ? r.num_questoes : q.length), ativa: r.ativa, inicio_em: r.inicio_em || '', tolerancia_min: r.tolerancia_min || 0, tipo: r.tipo || 'banco', num_alternativas: r.num_alternativas || 4, gabarito: g, tem_pdf: r.tem_pdf || false }; }) });
});
app.post('/admin/prova', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const b = req.body || {};
  const cid = parseInt(b.concurso_id) || 0;
  const titulo = String(b.titulo || '').trim().slice(0, 160);
  const dur = Math.max(1, parseInt(b.duracao_min) || 60);
  const maxs = Math.max(0, parseInt(b.max_saidas) || 2);
  const qids = Array.isArray(b.questao_ids) ? b.questao_ids.map((x) => parseInt(x)).filter(Boolean) : [];
  const inicio = String(b.inicio_em || '').trim().slice(0, 16) || null;
  const tol = Math.max(0, parseInt(b.tolerancia_min) || 0);
  const tipo = (b.tipo === 'pdf') ? 'pdf' : 'banco';
  const numQ = Math.max(0, Math.min(200, parseInt(b.num_questoes) || 0));
  const numA = Math.max(2, Math.min(6, parseInt(b.num_alternativas) || 4));
  const gabarito = Array.isArray(b.gabarito) ? b.gabarito.map((x) => (x === null || x === '' ? null : parseInt(x))) : [];
  if (!cid) return res.status(400).json({ erro: 'Selecione o concurso.' });
  if (!titulo) return res.status(400).json({ erro: 'Informe o título da prova.' });
  if (tipo === 'banco' && !qids.length) return res.status(400).json({ erro: 'Selecione ao menos uma questão.' });
  if (tipo === 'pdf' && numQ < 1) return res.status(400).json({ erro: 'Informe o número de questões.' });
  if (b.id) { await pool.query('UPDATE provas_online SET titulo=$1,duracao_min=$2,max_saidas=$3,questao_ids=$4,ativa=$5,inicio_em=$6,tolerancia_min=$7,tipo=$8,num_questoes=$9,num_alternativas=$10,gabarito=$11 WHERE id=$12', [titulo, dur, maxs, JSON.stringify(qids), b.ativa !== false, inicio, tol, tipo, numQ, numA, JSON.stringify(gabarito), b.id]); return res.json({ ok: true, id: b.id }); }
  const r = await pool.query('INSERT INTO provas_online (concurso_id,titulo,duracao_min,max_saidas,questao_ids,inicio_em,tolerancia_min,tipo,num_questoes,num_alternativas,gabarito) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [cid, titulo, dur, maxs, JSON.stringify(qids), inicio, tol, tipo, numQ, numA, JSON.stringify(gabarito)]);
  res.json({ ok: true, id: r.rows[0].id });
});
app.delete('/admin/prova/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  await pool.query('DELETE FROM prova_respostas WHERE prova_id=$1', [req.params.id]);
  await pool.query('DELETE FROM provas_online WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.post('/admin/prova/:id/acessos', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const pid = parseInt(req.params.id);
  const pr = await pool.query('SELECT concurso_id FROM provas_online WHERE id=$1', [pid]);
  if (!pr.rows.length) return res.status(404).json({ erro: 'Prova não encontrada.' });
  const cands = await pool.query('SELECT id FROM candidatos WHERE concurso_id=$1', [pr.rows[0].concurso_id]);
  let criados = 0;
  for (const c of cands.rows) {
    const r = await pool.query('INSERT INTO prova_respostas (prova_id,candidato_id,codigo) VALUES ($1,$2,$3) ON CONFLICT (prova_id,candidato_id) DO NOTHING', [pid, c.id, gerarCodigo()]);
    if (r.rowCount) criados++;
  }
  res.json({ ok: true, criados, total: cands.rows.length });
});
app.get('/admin/prova/:id/acessos.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({ acessos: [] });
  const { rows } = await pool.query(`SELECT k.nome,k.cpf,pr.codigo,pr.status,pr.saidas,pr.nota FROM prova_respostas pr JOIN candidatos k ON k.id=pr.candidato_id WHERE pr.prova_id=$1 ORDER BY k.nome`, [req.params.id]);
  res.json({ acessos: rows });
});
app.post('/admin/prova/:id/pdf', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const buf = decodeB64((req.body || {}).dataBase64);
  if (!buf) return res.status(400).json({ erro: 'Selecione um arquivo PDF.' });
  const mime = mimeDe(buf);
  if (mime !== 'application/pdf') return res.status(400).json({ erro: 'Envie um arquivo PDF.' });
  if (buf.length > 30 * 1024 * 1024) return res.status(400).json({ erro: 'PDF muito grande (máx. 30 MB).' });
  await pool.query('UPDATE provas_online SET pdf_mime=$1,pdf_dados=$2 WHERE id=$3', [mime, buf, req.params.id]);
  res.json({ ok: true });
});
app.get('/api/prova/pdf', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const a = await autenticaProva(req.query.cpf, req.query.codigo);
  if (!a) return res.status(401).send('Acesso inválido.');
  const { rows } = await pool.query('SELECT pdf_mime,pdf_dados FROM provas_online WHERE id=$1', [a.prova_id]);
  if (!rows.length || !rows[0].pdf_dados) return res.status(404).send('Sem PDF.');
  res.setHeader('Content-Type', rows[0].pdf_mime || 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="prova.pdf"');
  res.send(rows[0].pdf_dados);
});

app.get('/admin/prova/:id/resultados.json', exigirSenha, async (req, res) => {
  if (!pool) return res.json({});
  const pr = await pool.query('SELECT titulo,questao_ids,tipo,num_questoes,gabarito FROM provas_online WHERE id=$1', [req.params.id]);
  if (!pr.rows.length) return res.status(404).json({ erro: 'Prova não encontrada.' });
  const P = pr.rows[0];
  let questoes = [];
  if (P.tipo === 'pdf') {
    let gab = []; try { gab = JSON.parse(P.gabarito || '[]'); } catch {}
    const n = P.num_questoes || gab.length;
    for (let i = 0; i < n; i++) questoes.push({ id: i + 1, disciplina: 'Prova (PDF)', correta: gab[i] });
  } else {
    let qids = []; try { qids = JSON.parse(P.questao_ids || '[]'); } catch {}
    const qq = qids.length ? (await pool.query('SELECT id,disciplina,correta FROM questoes WHERE id = ANY($1::int[])', [qids])).rows : [];
    const byId = {}; qq.forEach((q) => byId[q.id] = q);
    questoes = qids.map((i) => byId[i]).filter(Boolean).map((q) => ({ id: q.id, disciplina: q.disciplina || 'Sem disciplina', correta: q.correta }));
  }
  const cr = await pool.query(`SELECT k.nome,k.cpf,k.cargo,pr.status,pr.saidas,pr.nota,pr.respostas FROM prova_respostas pr JOIN candidatos k ON k.id=pr.candidato_id WHERE pr.prova_id=$1 ORDER BY k.nome`, [req.params.id]);
  const candidatos = cr.rows.map((r) => { let resp = {}; try { resp = JSON.parse(r.respostas || '{}'); } catch {} return { nome: r.nome, cpf: r.cpf, cargo: r.cargo, status: r.status, saidas: r.saidas, nota: r.nota, respostas: resp }; });
  res.json({ titulo: pr.rows[0].titulo, questoes, candidatos });
});
app.post('/admin/prova/:id/zerar', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const r = await pool.query("UPDATE prova_respostas SET status='nao_iniciado', respostas='{}', saidas=0, iniciado_em=NULL, finalizado_em=NULL, nota=NULL WHERE prova_id=$1", [req.params.id]);
  res.json({ ok: true, zerados: r.rowCount });
});
app.get('/admin/prova/:id/resultados.html', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).send('Banco não configurado.');
  const pr = await pool.query('SELECT p.titulo, p.duracao_min, c.orgao, c.titulo AS edital FROM provas_online p LEFT JOIN concursos c ON c.id=p.concurso_id WHERE p.id=$1', [req.params.id]);
  if (!pr.rows.length) return res.status(404).send('Prova não encontrada.');
  const prova = pr.rows[0];
  const { rows } = await pool.query(`SELECT k.nome,k.cpf,k.cargo,pr.status,pr.saidas,pr.nota,pr.finalizado_em
    FROM prova_respostas pr JOIN candidatos k ON k.id=pr.candidato_id WHERE pr.prova_id=$1 ORDER BY pr.nota DESC NULLS LAST, k.nome`, [req.params.id]);
  const e = escapeHtml;
  const rotulo = { nao_iniciado: 'Não iniciou', em_andamento: 'Em andamento', finalizado: 'Finalizado', eliminado: 'Eliminado' };
  const linhas = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${e(r.nome)}</td><td>${e(mascaraCpf(r.cpf))}</td><td>${e(r.cargo || '')}</td><td>${e(rotulo[r.status] || r.status || '')}</td><td style="text-align:center">${r.nota != null ? r.nota : '—'}</td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resultados — ${e(prova.titulo || '')}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{color:#111;font-size:12px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4 portrait;margin:12mm}
 .barra-print{background:#0b3a5e;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
 .barra-print button{background:#fff;color:#0b3a5e;border:none;padding:9px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px}
 .folha{max-width:780px;margin:0 auto;padding:16px 18px}
 .cab{text-align:center;border-bottom:2px solid #0b3a5e;padding-bottom:8px;margin-bottom:12px}
 .cab .org{font-size:11px;color:#5b7183;text-transform:uppercase;font-weight:700}
 .cab .edital{font-size:14px;color:#0b3a5e;font-weight:700}
 .cab .doc{font-size:13px;font-weight:600;margin-top:2px}
 table{width:100%;border-collapse:collapse;font-size:11px}
 th,td{border:1px solid #b9c4cf;padding:6px 8px;text-align:left}
 th{background:#eef3f6}
 tr{break-inside:avoid}
 @media print{.barra-print{display:none} .folha{max-width:none;margin:0;padding:0}}
</style></head><body>
<div class="barra-print"><span>Resultados da prova online. Use <b>Imprimir → Salvar como PDF</b>.</span><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
<div class="folha">
  <div class="cab"><div class="org">${e(prova.orgao || '')}</div><div class="edital">${e(prova.edital || '')}</div><div class="doc">Resultados — ${e(prova.titulo || '')}</div></div>
  <p style="margin-bottom:10px">Total de candidatos: <b>${rows.length}</b> · Ordenado por nota (maior → menor).</p>
  <table><thead><tr><th>#</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Situação</th><th style="text-align:center">Nota</th></tr></thead><tbody>${linhas || '<tr><td colspan="6">Nenhum acesso/registro.</td></tr>'}</tbody></table>
</div>
</body></html>`;
  res.send(html);
});

// Candidato: ambiente de prova
app.post('/api/prova/login', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const a = await autenticaProva((req.body || {}).cpf, (req.body || {}).codigo);
  if (!a) return res.status(401).json({ erro: 'CPF ou código de acesso inválido.' });
  if (!a.ativa) return res.status(403).json({ erro: 'Esta prova não está disponível no momento.' });
  await refreshTempo(a);
  let qids = []; try { qids = JSON.parse(a.questao_ids || '[]'); } catch {}
  let respostas = {}; try { respostas = JSON.parse(a.respostas || '{}'); } catch {}
  const questoes = (a.tipo === 'pdf') ? [] : await questoesParaProva(qids);
  const jan = janelaEntrada(a);
  const podeIniciar = !!a.iniciado_em || jan.pode;
  res.json({ ok: true, nome: a.nome, titulo: a.titulo, duracao_min: a.duracao_min, max_saidas: a.max_saidas, status: a.status, saidas: a.saidas, nota: a.nota, restante_seg: restanteSeg(a), respostas, questoes, tipo: a.tipo || 'banco', num_questoes: a.num_questoes || 0, num_alternativas: a.num_alternativas || 4, tem_pdf: a.tem_pdf || false, inicio_em: a.inicio_em || '', inicio_fmt: a.inicio_em ? fmtDTBR(a.inicio_em) : '', tolerancia_min: a.tolerancia_min || 0, pode_iniciar: podeIniciar, janela_motivo: jan.motivo || '' });
});
app.post('/api/prova/iniciar', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const a = await autenticaProva((req.body || {}).cpf, (req.body || {}).codigo);
  if (!a) return res.status(401).json({ erro: 'Acesso inválido.' });
  if (!a.ativa) return res.status(403).json({ erro: 'Prova indisponível.' });
  await refreshTempo(a);
  if (a.status === 'eliminado') return res.json({ status: 'eliminado' });
  if (a.status === 'finalizado') return res.json({ status: 'finalizado', nota: a.nota });
  if (!a.iniciado_em) {
    const jan = janelaEntrada(a);
    if (!jan.pode) {
      if (jan.motivo === 'antes') return res.status(403).json({ erro: 'A prova ainda não foi liberada. Início previsto: ' + fmtDTBR(a.inicio_em) + '.' });
      return res.status(403).json({ erro: 'O período de entrada foi encerrado. Não é mais possível iniciar esta prova.' });
    }
    await pool.query("UPDATE prova_respostas SET status='em_andamento', iniciado_em=now() WHERE id=$1", [a.id]); a.iniciado_em = new Date(); a.status = 'em_andamento';
  }
  res.json({ ok: true, status: 'em_andamento', restante_seg: restanteSeg(a) });
});
app.post('/api/prova/responder', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const b = req.body || {};
  const a = await autenticaProva(b.cpf, b.codigo);
  if (!a) return res.status(401).json({ erro: 'Acesso inválido.' });
  await refreshTempo(a);
  if (a.status !== 'em_andamento') return res.status(403).json({ erro: 'Prova não está em andamento.', status: a.status });
  let respostas = {}; try { respostas = JSON.parse(a.respostas || '{}'); } catch {}
  respostas[parseInt(b.qid)] = parseInt(b.alt);
  await pool.query('UPDATE prova_respostas SET respostas=$1 WHERE id=$2', [JSON.stringify(respostas), a.id]);
  res.json({ ok: true });
});
app.post('/api/prova/saida', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const a = await autenticaProva((req.body || {}).cpf, (req.body || {}).codigo);
  if (!a) return res.status(401).json({ erro: 'Acesso inválido.' });
  await refreshTempo(a);
  if (a.status !== 'em_andamento') return res.json({ status: a.status, saidas: a.saidas });
  const novas = a.saidas + 1;
  if (novas > a.max_saidas) { await pool.query("UPDATE prova_respostas SET saidas=$1, status='eliminado', finalizado_em=now() WHERE id=$2", [novas, a.id]); return res.json({ status: 'eliminado', saidas: novas }); }
  await pool.query('UPDATE prova_respostas SET saidas=$1 WHERE id=$2', [novas, a.id]);
  res.json({ status: 'em_andamento', saidas: novas, max_saidas: a.max_saidas });
});
app.post('/api/prova/finalizar', async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Indisponível.' });
  const a = await autenticaProva((req.body || {}).cpf, (req.body || {}).codigo);
  if (!a) return res.status(401).json({ erro: 'Acesso inválido.' });
  let qids = []; try { qids = JSON.parse(a.questao_ids || '[]'); } catch {}
  if (a.status === 'eliminado') return res.json({ status: 'eliminado' });
  let nota = a.nota;
  if (a.status !== 'finalizado') nota = await finalizarProva(a);
  let respostas = {}; try { respostas = JSON.parse(a.respostas || '{}'); } catch {}
  res.json({ status: 'finalizado', nota, total: qids.length, respostas });
});

app.get('/boleto/:protocolo', async (req, res) => {
  if (!pool) return res.status(503).send('Indisponível.');
  const { rows } = await pool.query('SELECT * FROM candidatos WHERE protocolo=$1', [req.params.protocolo]);
  if (!rows.length) return res.status(404).send('Boleto não encontrado.');
  const c = rows[0];
  const concurso = await lerConcursoPorChave(String(c.concurso_id));
  const e = escapeHtml;
  const cfg = await lerConfigBB(c.concurso_id).catch(() => null);
  const valor = (Number(concurso && concurso.taxa_valor || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let qrSvg = '';
  if (c.bb_qrcode_pix) { try { qrSvg = await QRCode.toString(String(c.bb_qrcode_pix), { type: 'svg', margin: 1, width: 190 }); } catch {} }
  const pago = c.status === 'pago';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Boleto — ${e(c.protocolo)}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
 body{background:#eef2f6;color:#16242f;padding:20px}
 .b{max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbe4ec;border-radius:14px;padding:22px}
 h1{font-size:1.15rem;color:#0b3a5e;margin-bottom:2px}
 .sub{color:#5b7183;font-size:.9rem;margin-bottom:14px}
 .pago{background:#e7f6ee;color:#0f6b41;padding:10px 12px;border-radius:8px;font-weight:700;margin-bottom:14px}
 .row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eef2f6;padding:8px 0;font-size:.92rem}
 .row b{color:#0b3a5e}
 .ld{margin:16px 0;padding:12px;border:1.5px dashed #0b3a5e;border-radius:10px;text-align:center}
 .ld .num{font-size:1.05rem;font-weight:800;letter-spacing:1px;word-break:break-all}
 button{background:#0b3a5e;color:#fff;border:none;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer;margin-top:8px}
 .pix{text-align:center;margin-top:16px;border-top:1px solid #eef2f6;padding-top:16px}
 .pix svg{width:190px;height:190px}
 .hint{font-size:.82rem;color:#5b7183;margin-top:6px}
</style></head><body>
<div class="b">
  <h1>${e((cfg && cfg.bb_beneficiario_nome) || (concurso && concurso.orgao) || 'Boleto de inscrição')}</h1>
  <div class="sub">${e(concurso && concurso.titulo || '')}</div>
  ${pago ? '<div class="pago">✓ Pagamento confirmado. Não é necessário pagar novamente.</div>' : ''}
  <div class="row"><span>Pagador</span><b>${e(c.nome)}</b></div>
  <div class="row"><span>CPF</span><b>${e(mascaraCpf(c.cpf))}</b></div>
  <div class="row"><span>Inscrição</span><b>${e(c.protocolo)}</b></div>
  <div class="row"><span>Valor</span><b>${e(valor)}</b></div>
  <div class="row"><span>Banco</span><b>Banco do Brasil (001)</b></div>
  ${c.bb_linha_digitavel ? `<div class="ld"><div class="hint">Linha digitável (copie para pagar no seu banco)</div><div class="num" id="ld">${e(c.bb_linha_digitavel)}</div><button onclick="copiar()">Copiar linha digitável</button></div>` : '<div class="ld">Boleto em processamento. Recarregue em instantes.</div>'}
  ${qrSvg ? `<div class="pix"><div class="hint" style="margin-bottom:8px">Ou pague com Pix (aponte a câmera):</div>${qrSvg}</div>` : ''}
</div>
<script>function copiar(){var t=document.getElementById('ld').textContent.replace(/\\D/g,'');navigator.clipboard.writeText(t).then(function(){alert('Linha digitável copiada!');});}</script>
</body></html>`;
  res.send(html);
});

app.get('/admin', exigirSenha, (req, res) => res.send(PAINEL_HTML));

app.delete('/admin/concurso/:id', exigirSenha, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: 'Banco não configurado.' });
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Concurso inválido.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM titulos WHERE candidato_id IN (SELECT id FROM candidatos WHERE concurso_id=$1)', [id]);
    await client.query('DELETE FROM prova_respostas WHERE candidato_id IN (SELECT id FROM candidatos WHERE concurso_id=$1) OR prova_id IN (SELECT id FROM provas_online WHERE concurso_id=$1)', [id]);
    await client.query('DELETE FROM provas_online WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM candidatos WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM salas WHERE escola_id IN (SELECT id FROM escolas WHERE concurso_id=$1)', [id]);
    await client.query('DELETE FROM escolas WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM etapa_arquivos WHERE etapa_id IN (SELECT id FROM etapas WHERE concurso_id=$1)', [id]);
    await client.query('DELETE FROM etapas WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM documentos WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM edital_pdf WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM brasao WHERE concurso_id=$1', [id]);
    await client.query('DELETE FROM concursos WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Falha ao excluir: ' + e.message });
  } finally {
    client.release();
  }
});
const PAINEL_HTML = require('./painel.js');

inicializarBanco().catch((e) => console.error('Falha banco:', e.message))
  .finally(() => app.listen(PORT, () => console.log('🚀 Seletrix na porta ' + PORT + ' | ASAAS: ' + (temAsaas ? ASAAS_BASE : 'não configurado'))));
