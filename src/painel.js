// Painel administrativo do Seletrix (HTML servido em /admin)
module.exports = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><!-- PAINEL_VERSAO:painel-v5-janela -->
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Seletrix · Painel</title>
<link rel="icon" href="/logo.png" type="image/png">
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
 :root{--navy:#0b3a5e;--navy2:#0a2f4d;--azul:#12558a;--ouro:#c8a94b;--verde:#1f9d5b;--verde-bg:#e7f6ee;--papel:#eef2f6;--branco:#fff;--linha:#dbe4ec;--txt:#16242f;--suave:#5b7183}
 *{box-sizing:border-box;margin:0;padding:0;font-family:'Inter',-apple-system,Segoe UI,Roboto,Arial,sans-serif}
 body{background:var(--papel);color:var(--txt);line-height:1.5}
 h1,h2,h3{font-family:'Sora',sans-serif;letter-spacing:-.01em}
 .faixa{height:4px;background:linear-gradient(90deg,var(--navy),var(--azul) 55%,var(--ouro))}
 header{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
 header .brand{display:flex;align-items:center;gap:12px}
 header .logo{height:40px;width:auto}
 header .hnome{font-family:'Sora';font-weight:800;font-size:1.15rem}
 header .hsub{font-size:.72rem;opacity:.85;letter-spacing:.06em;text-transform:uppercase}
 header h1{font-size:1.05rem}
 .link-topo{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);color:#fff;text-decoration:none;font-weight:600;font-size:.88rem;padding:9px 16px;border-radius:9px}
 .link-topo:hover{background:rgba(255,255,255,.2)}
 .tabs{display:flex;gap:4px;padding:0 24px;background:var(--branco);border-bottom:1px solid var(--linha)}
 .tab{padding:15px 20px;cursor:pointer;font-weight:600;color:var(--suave);border-bottom:3px solid transparent}
 .tab.on{color:var(--navy);border-color:var(--ouro)}
 .wrap{padding:24px;max-width:1120px;margin:0 auto}
 .card{background:var(--branco);border:1px solid var(--linha);border-radius:14px;padding:22px;margin-bottom:16px;box-shadow:0 6px 20px rgba(11,58,94,.05)}
 label{display:block;font-size:.8rem;font-weight:600;color:#33454f;margin:12px 0 6px}
 input,select{width:100%;padding:11px 13px;border:1.5px solid var(--linha);border-radius:9px;font-size:.95rem;background:#fff;color:var(--txt)}
 textarea{width:100%;padding:11px 13px;border:1.5px solid var(--linha);border-radius:9px;font-size:.95rem;background:#fff;color:var(--txt);font-family:inherit;resize:vertical}
 input:focus,select:focus{outline:none;border-color:var(--azul);box-shadow:0 0 0 3px rgba(18,85,138,.12)}
 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
 @media(max-width:620px){.grid2{grid-template-columns:1fr}}
 button{background:var(--navy);color:#fff;border:none;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;font-size:.94rem;font-family:'Sora'}
 button:hover{background:var(--azul)}
 button.sec{background:#eef2f6;color:var(--navy);font-family:inherit}
 button.sec:hover{background:#e2e9f0}
 button.del{background:#fdecec;color:#a12626;padding:8px 12px;font-family:inherit}
 button.del:hover{background:#f9dcdc}
 button.mini{background:#eef2f6;color:var(--navy);padding:7px 12px;font-size:.8rem;font-family:inherit}
 button.mini:hover{background:#e2e9f0}
 .btn{display:inline-flex;align-items:center;gap:8px;background:var(--verde);color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;font-size:.9rem;font-family:'Sora'}
 .btn:hover{filter:brightness(1.05)}
 .chip{display:inline-block;background:#e8eef4;color:var(--navy);border-radius:999px;padding:5px 13px;margin:3px 4px;font-size:.84rem;font-weight:500}
 table{width:100%;border-collapse:collapse;font-size:.86rem}
 th,td{padding:11px 12px;border-bottom:1px solid #e7edf2;text-align:left;white-space:nowrap}
 th{background:#f3f6f9;color:var(--navy);font-family:'Sora';font-weight:600;position:sticky;top:0}
 tr:hover td{background:#fafcfe}
 .scroll{overflow:auto;max-height:62vh;border-radius:12px;border:1px solid var(--linha)}
 .cargo-item{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--linha)}
 .cargo-item span{flex:1}
 .ok{display:none;background:var(--verde-bg);color:#0f6b41;border:1px solid #bfe6d1;border-radius:9px;padding:11px 14px;margin-top:12px;font-size:.9rem;font-weight:600}
 .hint{font-size:.8rem;color:var(--suave);margin-top:4px}
 .total{font-weight:700;font-size:1.05rem;margin-bottom:8px;color:var(--navy)}
 .conc{border:1px solid var(--linha);border-radius:14px;padding:18px;margin-bottom:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;background:#fff;box-shadow:0 4px 14px rgba(11,58,94,.04)}
 .conc h3{font-size:1.08rem;color:var(--navy);margin-bottom:3px}
 .conc .meta{color:var(--suave);font-size:.85rem}
 .tag{padding:3px 11px;border-radius:999px;font-size:.74rem;font-weight:700}
 .tag.on{background:var(--verde-bg);color:#0f6b41}.tag.off{background:#eef1f4;color:#5b7183}
 .tag.pago{background:var(--verde-bg);color:#0f6b41}.tag.aguard{background:#fdf0d9;color:#8a5a00}.tag.insc{background:#eef1f4;color:#456}
 .row-actions{display:flex;gap:8px;align-items:center}
 .checkline{display:flex;align-items:center;gap:9px;margin-top:14px}
 .checkline input{width:auto}
 .etapa-box{border:1px solid var(--linha);border-radius:12px;padding:14px;margin-bottom:12px;background:#fff}
 .etapa-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
 .arq-item{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--linha);font-size:.88rem}
 .arq-item span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .add-arq{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
 .add-etapa{display:flex;gap:8px;margin:12px 0}
</style></head><body>
<div class="faixa"></div>
<header>
  <div class="brand"><img src="/logo.png" alt="" class="logo" id="hdr_logo"><div><div class="hnome" id="hdr_nome">Seletrix</div><div class="hsub">Painel de Gestão</div></div></div>
  <div style="display:flex;align-items:center;gap:12px">
    <select id="empresa_sel" onchange="trocarEmpresa()" style="width:auto;min-width:190px;padding:8px 10px"></select>
    <a class="link-topo" id="hdr_site" href="/" target="_blank">Ver site público ↗</a>
  </div>
</header>
<div class="tabs">
  <div class="tab on" data-t="concursos">Concursos</div>
  <div class="tab" data-t="empresas">Empresas</div>
  <div class="tab" data-t="inscritos">Inscritos</div>
  <div class="tab" data-t="relatorios">Relatórios</div>
  <div class="tab" data-t="locacao">Locação</div>
  <div class="tab" data-t="alocacao">Alocação</div>
  <div class="tab" data-t="questoes">Questões</div>
  <div class="tab" data-t="professores">Professores</div>
  <div class="tab" data-t="prova_online">Prova Online</div>
  <div class="tab" data-t="recursos">Recursos</div>
</div>
<div class="wrap">
  <section id="concursos">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="font-size:1.1rem">Meus concursos</h2>
      <button onclick="novoConcurso()">+ Novo concurso</button>
    </div>
    <div id="lista_concursos"></div>

    <div class="card" id="form_concurso" style="display:none">
      <h3 id="form_titulo">Novo concurso</h3>
      <input type="hidden" id="c_id">
      <div class="grid2">
        <div><label>Empresa</label><select id="c_empresa"></select></div>
        <div><label>Título do edital</label><input id="c_titulo" placeholder="Edital nº 01/2026"></div>
        <div><label>Órgão / Município</label><input id="c_orgao" placeholder="Câmara Municipal de ..."></div>
        <div><label>Período de inscrições</label><input id="c_periodo" placeholder="01 a 30/07/2026"></div>
        <div><label>Data da prova</label><input id="c_prova" placeholder="24/08/2026"></div>
        <div><label>Vagas</label><input id="c_vagas" placeholder="conforme edital"></div>
        <div><label>Taxa (texto exibido)</label><input id="c_taxa" placeholder="R$ 80,00"></div>
        <div><label>Valor da taxa p/ cobrança (R$) — mín. 5,00</label><input id="c_valor" inputmode="decimal" placeholder="80.00"></div>
        <div><label>Dias para pagar (vencimento)</label><input id="c_dias" inputmode="numeric" placeholder="5"></div>
      </div>
      <label>Edital em PDF</label>
      <div id="edital_atual" class="hint" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="c_pdf_file" accept="application/pdf" style="border:none;padding:0">
        <button class="sec" type="button" onclick="enviarEdital()">Enviar PDF</button>
      </div>
      <label style="margin-top:14px">Ou cole um link (opcional, se preferir)</label>
      <input id="c_pdf" placeholder="https://...">
      <label style="margin-top:16px">Brasão / logo do órgão (aparece no card da página principal)</label>
      <div id="brasao_atual" class="hint" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="c_brasao_file" accept="image/png,image/jpeg" style="border:none;padding:0">
        <button class="sec" type="button" onclick="enviarBrasao()">Enviar brasão</button>
      </div>
      <p class="hint">Imagem JPG ou PNG (quadrada fica melhor), até 2 MB.</p>
      <label style="margin-top:8px">Datas (a situação no site muda sozinha por elas)</label>
      <div class="grid2">
        <div><label>Início das inscrições</label><input id="c_data_inicio" type="date"></div>
        <div><label>Fim das inscrições</label><input id="c_data_fim" type="date"></div>
        <div><label>Encerramento do processo</label><input id="c_data_encerramento" type="date"></div>
      </div>
      <p class="hint">Hoje entre início e fim → <b>Inscrições abertas</b>. Após o fim → <b>Em andamento</b>. Após o encerramento → <b>Encerrado</b>. Em branco = fica sempre como "abertas".</p>
      <div class="checkline"><input type="checkbox" id="c_aberto"><label for="c_aberto" style="margin:0">Publicar no site (visível para os candidatos)</label></div>
      <div class="checkline"><input type="checkbox" id="c_gratuito"><label for="c_gratuito" style="margin:0">Inscrição gratuita (não gera cobrança de taxa)</label></div>
      <div style="margin-top:16px">
        <label>Cargos</label>
        <div id="lista_cargos"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="novo_cargo" placeholder="Ex.: Analista Administrativo" onkeydown="if(event.key==='Enter'){event.preventDefault();addCargo()}">
          <button class="sec" onclick="addCargo()">Adicionar</button>
        </div>
      </div>
      <div style="margin-top:18px">
        <div class="checkline"><input type="checkbox" id="c_pede_titulos" onchange="toggleTitulos()"><label for="c_pede_titulos" style="margin:0">Pedir envio de títulos (anexos) neste concurso</label></div>
        <div class="checkline"><input type="checkbox" id="c_pede_laudo" onchange="toggleLaudo()"><label for="c_pede_laudo" style="margin:0">Permitir envio de laudo / condição especial (PcD)</label></div>
        <div id="bloco_laudo" style="display:none;margin:6px 0 4px;padding:10px;border:1px solid var(--linha);border-radius:8px">
          <p class="hint" style="margin-bottom:8px">Prazo para envio do laudo (opcional — em branco = liberado enquanto ativado).</p>
          <div class="grid2">
            <div><label>Abertura</label><input id="c_laudo_inicio" type="datetime-local"></div>
            <div><label>Fechamento</label><input id="c_laudo_fim" type="datetime-local"></div>
          </div>
        </div>
        <div class="checkline"><input type="checkbox" id="c_pede_isencao" onchange="toggleIsencao()"><label for="c_pede_isencao" style="margin:0">Permitir pedido de isenção da taxa de inscrição</label></div>
        <div id="bloco_isencao" style="display:none;margin:6px 0 4px;padding:10px;border:1px solid var(--linha);border-radius:8px">
          <label>Motivos/regras da isenção (aparece para o candidato)</label>
          <textarea id="c_isencao_texto" rows="3" placeholder="Ex.: Isenção para candidatos inscritos no CadÚnico, doadores de medula, negros (Lei X), etc. Descreva as condições e o que comprovar."></textarea>
          <p class="hint" style="margin:8px 0">Prazo para o candidato enviar a comprovação (em branco = liberado enquanto ativado).</p>
          <div class="grid2">
            <div><label>Abertura</label><input id="c_isencao_inicio" type="datetime-local"></div>
            <div><label>Fechamento</label><input id="c_isencao_fim" type="datetime-local"></div>
          </div>
        </div>
        <div id="bloco_titulos" style="display:none;margin-top:10px">
          <label>Tipos de título aceitos</label>
          <div id="lista_tipos"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input id="novo_tipo" placeholder="Ex.: Pós-graduação" onkeydown="if(event.key==='Enter'){event.preventDefault();addTipo()}">
            <button class="sec" type="button" onclick="addTipo()">Adicionar</button>
          </div>
          <p class="hint">O candidato escolhe um desses tipos ao enviar cada arquivo, na Área do Candidato (PDF, JPG ou PNG · até 5 MB cada).</p>
          <label style="margin-top:12px">Envio de títulos — início</label>
          <div class="grid2">
            <div><label>Data</label><input id="c_tit_ini_data" type="date"></div>
            <div><label>Hora</label><input id="c_tit_ini_hora" type="time"></div>
          </div>
          <label style="margin-top:10px">Envio de títulos — fim</label>
          <div class="grid2">
            <div><label>Data</label><input id="c_tit_fim_data" type="date"></div>
            <div><label>Hora</label><input id="c_tit_fim_hora" type="time"></div>
          </div>
          <p class="hint">O candidato só consegue enviar títulos entre essas datas. Em branco = liberado enquanto "Pedir títulos" estiver ligado.</p>
        </div>
      </div>
      <div style="margin-top:18px;display:flex;gap:10px">
        <button onclick="salvarConcurso()">Salvar concurso</button>
        <button class="sec" onclick="fecharForm()">Cancelar</button>
      </div>
      <div class="ok" id="ok_conc">Salvo!</div>
    </div>
  </section>

  <section id="inscritos" style="display:none">
    <div class="card">
      <label>Filtrar por concurso</label>
      <select id="filtro_concurso" onchange="carregarInscritos()"></select>
      <p style="margin:14px 0" id="resumo_insc"></p>
      <p><a class="btn" id="btn_csv" href="#">⬇️ Baixar Excel (CSV)</a></p>
      <div class="scroll" style="margin-top:12px"><table>
        <thead><tr><th>Protocolo</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Status</th><th>Pagamento</th><th>Títulos</th><th>Data</th><th>Ações</th></tr></thead>
        <tbody id="linhas_insc"></tbody></table></div>
    </div>
  </section>

  <section id="relatorios" style="display:none">
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Lista de Inscritos</h2>
      <p class="hint" style="margin-bottom:14px">Gere a relação de inscritos para publicar (PDF) ou trabalhar os dados (Excel).</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="rel_concurso" onchange="relCargos();relPreview()"></select></div>
        <div><label>Cargo</label><select id="rel_cargo" onchange="relPreview()"><option value="">Todos os cargos</option></select></div>
        <div><label>Pagamento</label><select id="rel_pagamento" onchange="relPreview()"><option value="todos">Todos</option><option value="pagos">Somente pagos</option><option value="naopagos">Somente não pagos</option></select></div>
        <div><label>PcD</label><select id="rel_pcd" onchange="relPreview()"><option value="todos">Todos</option><option value="sim">Somente PcD</option><option value="nao">Exceto PcD</option></select></div>
        <div><label>Versão</label><select id="rel_versao"><option value="publica">Pública (sem CPF/contato — LGPD)</option><option value="completa">Completa (uso interno)</option></select></div>
      </div>
      <p style="margin:16px 0" id="rel_total"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button onclick="relPDF()">🖨️ Gerar PDF (publicar)</button>
        <button class="sec" onclick="relCSV()">⬇️ Baixar Excel (CSV)</button>
      </div>
      <p class="hint" style="margin-top:12px">No PDF, use <b>Imprimir → Salvar como PDF</b> na janela que abrir.</p>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Locais de Prova</h2>
      <p class="hint" style="margin-bottom:14px">Onde cada candidato faz a prova (apenas candidatos já alocados nas salas).</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="lp_concurso" onchange="lpPreview()"></select></div>
        <div><label>Organização</label><select id="lp_modo"><option value="agrupado">Agrupado por Escola → Sala</option><option value="corrido">Lista corrida (alfabética)</option></select></div>
        <div><label>Versão</label><select id="lp_versao"><option value="publica">Pública (CPF mascarado)</option><option value="completa">Completa (uso interno)</option></select></div>
      </div>
      <p style="margin:16px 0" id="lp_total"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button onclick="lpPDF()">🖨️ Gerar PDF (publicar)</button>
        <button class="sec" onclick="lpCSV()">⬇️ Baixar Excel (CSV)</button>
      </div>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Ata da Sala</h2>
      <p class="hint" style="margin-bottom:14px">Ata de abertura/encerramento + folha de ocorrências (2 páginas por sala), pronta para imprimir e assinar.</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="ata_concurso" onchange="ataSalas()"></select></div>
        <div><label>Sala</label><select id="ata_sala"><option value="">Todas as salas</option></select></div>
      </div>
      <div style="margin-top:14px"><button onclick="ataPDF()">🖨️ Gerar ata (PDF)</button></div>
      <p class="hint" style="margin-top:10px">O cabeçalho usa o nome da sala como você cadastrou (ex.: "Bloco 1 - Sala 1") + o andar/observação. Turno, data, presentes/ausentes e ocorrências ficam em branco para preencher à mão.</p>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Lista de Presença</h2>
      <p class="hint" style="margin-bottom:14px">Folha de presença por sala (Nome, CPF e espaço para assinatura). Uma folha por sala.</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="pr_concurso" onchange="fillSalas('pr_concurso','pr_sala')"></select></div>
        <div><label>Sala</label><select id="pr_sala"><option value="">Todas as salas</option></select></div>
      </div>
      <div style="margin-top:14px"><button onclick="prPDF()">🖨️ Gerar PDF</button></div>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Frente de Sala</h2>
      <p class="hint" style="margin-bottom:14px">Folha para a porta da sala: cabeçalho grande da sala + lista dos candidatos daquela sala.</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="fs_concurso" onchange="fillSalas('fs_concurso','fs_sala')"></select></div>
        <div><label>Sala</label><select id="fs_sala"><option value="">Todas as salas</option></select></div>
      </div>
      <div style="margin-top:14px"><button onclick="fsPDF()">🖨️ Gerar PDF</button></div>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Frente de Prédio</h2>
      <p class="hint" style="margin-bottom:14px">Folha para a entrada: lista alfabética (Nome + Sala) de toda a escola.</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="fp_concurso"></select></div>
      </div>
      <div style="margin-top:14px"><button onclick="fpPDF()">🖨️ Gerar PDF</button></div>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Cartões-Resposta</h2>
      <p class="hint" style="margin-bottom:14px">Gera os cartões dos candidatos alocados (1 por página), com QR Code de identificação para a correção automática. Defina questões e alternativas conforme o cargo.</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="ct_concurso" onchange="fillSalasCt()"></select></div>
        <div><label>Sala</label><select id="ct_sala"><option value="">Todas as salas</option></select></div>
        <div><label>Cargo</label><select id="ct_cargo"><option value="">Todos os cargos</option></select></div>
        <div><label>Questões</label><input id="ct_questoes" type="number" min="1" max="120" value="30"></div>
        <div><label>Alternativas</label><input id="ct_alternativas" type="number" min="2" max="6" value="4"></div>
        <div><label>Data da prova</label><input id="ct_data" type="date"></div>
        <div><label>Turno</label><input id="ct_turno" placeholder="Ex.: Manhã"></div>
      </div>
      <div style="margin-top:14px"><button onclick="ctPDF()">🖨️ Gerar cartões (PDF)</button></div>
    </div>
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:4px">Etiquetas de Malote</h2>
      <p class="hint" style="margin-bottom:14px">Etiquetas adesivas (Pimaco A4350 · 10 por folha) para identificar os malotes de prova de cada sala: escola, sala, cargos, turno, data e quantidade de candidatos.</p>
      <div class="grid2">
        <div><label>Concurso</label><select id="et_concurso"></select></div>
        <div><label>Turno</label><input id="et_turno" placeholder="Ex.: Manhã"></div>
      </div>
      <div style="margin-top:14px"><button onclick="etPDF()">🖨️ Gerar etiquetas (PDF)</button></div>
    </div>
  </section>

  <section id="locacao" style="display:none">
    <div class="card">
      <label>Concurso</label>
      <select id="loc_concurso" onchange="carregarEscolas()"></select>
      <p id="loc_resumo" class="hint" style="margin-top:10px"></p>
    </div>
    <div id="loc_lista"></div>
    <div class="card">
      <h3 style="font-size:1.05rem;color:var(--navy);margin-bottom:10px">Adicionar escola</h3>
      <div class="grid2">
        <div><label>Nome da escola</label><input id="loc_nome" placeholder="Ex.: EMEF João da Silva"></div>
        <div><label>Endereço completo</label><input id="loc_endereco" placeholder="Rua, nº, bairro, cidade/UF"></div>
      </div>
      <button style="margin-top:12px" onclick="addEscola()">+ Adicionar escola</button>
    </div>
  </section>

  <section id="alocacao" style="display:none">
    <div class="card">
      <div class="grid2">
        <div><label>Concurso</label><select id="al_concurso" onchange="alInit()"></select></div>
        <div><label>Sala destino</label><select id="al_sala"></select></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button onclick="alocar()">Alocar selecionados na sala</button>
        <button class="sec" onclick="desalocar()">Remover alocação dos selecionados</button>
      </div>
    </div>
    <div class="card">
      <div class="grid2">
        <div><label>Cargo</label><select id="al_cargo" onchange="alBuscar()"><option value="">Todos</option></select></div>
        <div><label>Situação da alocação</label><select id="al_aloc" onchange="alBuscar()"><option value="nao">Não alocados</option><option value="sim">Já alocados</option><option value="todos">Todos</option></select></div>
        <div><label>Pagamento</label><select id="al_pag" onchange="alBuscar()"><option value="todos">Todos</option><option value="pagos">Pagos</option><option value="naopagos">Não pagos</option></select></div>
        <div><label>PcD</label><select id="al_pcd" onchange="alBuscar()"><option value="todos">Todos</option><option value="sim">Só PcD</option><option value="nao">Exceto PcD</option></select></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap">
        <input id="al_busca" placeholder="Buscar por nome" style="flex:1;min-width:180px" onkeydown="if(event.key==='Enter')alBuscar()">
        <button class="sec" onclick="alBuscar()">Filtrar</button>
      </div>
      <p style="margin:12px 0" id="al_resumo"></p>
      <p><label style="display:inline-flex;align-items:center;gap:8px;font-weight:600"><input type="checkbox" id="al_todos" onclick="alMarcarTodos()" style="width:auto"> Selecionar todos os listados</label></p>
      <div class="scroll" style="max-height:55vh"><table>
        <thead><tr><th></th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Sala atual</th></tr></thead>
        <tbody id="al_linhas"></tbody></table></div>
    </div>
  </section>

  <section id="questoes" style="display:none">
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:10px">Nova questão</h2>
      <input type="hidden" id="q_id">
      <label>Enunciado</label>
      <textarea id="q_enunciado" rows="3" placeholder="Digite o enunciado da questão"></textarea>
      <label style="margin-top:12px">Alternativas (marque a correta no círculo à esquerda)</label>
      <div id="q_alts"></div>
      <button class="sec" type="button" onclick="addAlt()">+ Alternativa</button>
      <div class="grid2" style="margin-top:14px">
        <div><label>Disciplina / Matéria</label><input id="q_disciplina" placeholder="Ex.: Português"></div>
        <div><label>Nível</label><select id="q_nivel"><option value="">—</option><option>Fácil</option><option>Médio</option><option>Difícil</option></select></div>
        <div><label>Cargo</label><input id="q_cargo" placeholder="Ex.: Especialista (em branco = todos)"></div>
      </div>
      <label style="margin-top:14px">Imagem do enunciado (opcional)</label>
      <div id="q_img_atual" class="hint" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="q_img_file" accept="image/png,image/jpeg" style="border:none;padding:0">
        <button class="sec" type="button" onclick="enviarImgQuestao()">Enviar imagem</button>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button onclick="salvarQuestao()">Salvar questão</button><button class="sec" onclick="novaQuestao()">Limpar / Nova</button></div>
    </div>
    <div class="card">
      <div class="grid2">
        <div><label>Disciplina</label><input id="qf_disciplina" oninput="carregarQuestoes()"></div>
        <div><label>Nível</label><select id="qf_nivel" onchange="carregarQuestoes()"><option value="">Todos</option><option>Fácil</option><option>Médio</option><option>Difícil</option></select></div>
        <div><label>Cargo</label><input id="qf_cargo" oninput="carregarQuestoes()"></div>
        <div><label>Buscar no enunciado</label><input id="qf_busca" oninput="carregarQuestoes()"></div>
      </div>
      <div style="border-top:1px solid var(--linha);margin-top:14px;padding-top:14px">
        <h3 style="font-size:1rem;color:var(--navy);margin-bottom:8px">Montar prova (marque as questões abaixo)</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <div style="flex:1;min-width:180px"><label>Concurso (cabeçalho)</label><select id="prova_concurso"></select></div>
          <div style="flex:1;min-width:180px"><label>Título da prova</label><input id="prova_titulo" placeholder="Ex.: Prova Objetiva - Especialista"></div>
          <button onclick="gerarProva()">🖨️ Gerar prova (PDF)</button>
        </div>
        <p class="hint" id="prova_sel" style="margin-top:8px">0 questão(ões) selecionada(s).</p>
      </div>
      <p id="q_total" style="margin:12px 0"></p>
      <div id="q_lista"></div>
    </div>
  </section>

  <section id="prova_online" style="display:none">
    <div class="card">
      <h2 id="po_form_titulo" style="font-size:1.15rem;color:var(--navy);margin-bottom:10px">Nova prova online</h2>
      <input type="hidden" id="po_id">
      <div class="grid2">
        <div><label>Concurso</label><select id="po_concurso"></select></div>
        <div><label>Título da prova</label><input id="po_titulo" placeholder="Ex.: Prova Objetiva Online"></div>
        <div><label>Duração (minutos)</label><input id="po_duracao" type="number" min="1" value="60"></div>
        <div><label>Máx. de saídas antes de eliminar</label><input id="po_maxsaidas" type="number" min="0" value="2"></div>
        <div><label>Entrada abre em (data/hora)</label><input id="po_inicio" type="datetime-local"></div>
        <div><label>Entrada fecha em (data/hora)</label><input id="po_entrada_fim" type="datetime-local"></div>
        <input id="po_tolerancia" type="hidden" value="0">
        <div><label>Origem das questões</label><select id="po_tipo" onchange="toggleOrigem()"><option value="banco">Banco de questões</option><option value="pdf">PDF + gabarito</option></select></div>
      </div>
      <p class="hint" style="margin:-2px 0 10px">A prova abre e fecha para <b>entrada</b> nesses horários. Cada candidato tem a <b>duração</b> acima a partir do momento em que inicia — quem entra perto do fechamento faz o tempo cheio. Em branco = sem restrição de horário.</p>
      <label style="margin-top:14px">Cargos que fazem esta prova</label>
      <div id="po_cargos" style="border:1px solid var(--linha);border-radius:8px;padding:10px;max-height:150px;overflow:auto"><p class="hint">Selecione o concurso.</p></div>
      <div id="po_bloco_banco">
        <label style="margin-top:14px">Questões (marque as que entram na prova)</label>
        <input id="po_busca_q" placeholder="Filtrar por enunciado/disciplina" oninput="carregarQuestoesProva()" style="margin-bottom:8px">
        <div id="po_questoes" style="max-height:40vh;overflow:auto;border:1px solid var(--linha);border-radius:8px;padding:10px"></div>
        <p class="hint" id="po_selq" style="margin-top:6px">0 questão(ões) selecionada(s).</p>
      </div>
      <div id="po_bloco_pdf" style="display:none">
        <div class="grid2" style="margin-top:14px">
          <div><label>Nº de questões</label><input id="po_numq" type="number" min="1" max="200" value="30" oninput="renderGabarito()"></div>
          <div><label>Nº de alternativas</label><input id="po_numalt" type="number" min="2" max="6" value="4" oninput="renderGabarito()"></div>
        </div>
        <label style="margin-top:12px">Arquivo da prova (PDF)</label>
        <div id="po_pdf_atual" class="hint" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="po_pdf_file" accept="application/pdf" style="border:none;padding:0"><button class="sec" type="button" onclick="enviarPdfProva()">Enviar PDF</button></div>
        <label style="margin-top:14px">Gabarito (clique na alternativa correta de cada questão)</label>
        <div id="po_gabarito" style="max-height:40vh;overflow:auto;border:1px solid var(--linha);border-radius:8px;padding:10px"></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button onclick="salvarProva()">Salvar prova</button><button class="sec" onclick="novaProva()">Limpar / Nova</button></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <label style="margin:0">Provas cadastradas</label>
        <span class="hint">Link do candidato: <b id="po_link">/prova.html</b></span>
      </div>
      <div id="po_lista" style="margin-top:12px"></div>
    </div>
  </section>

  <section id="recursos" style="display:none">
    <div class="card">
      <div class="grid2">
        <div><label>Concurso</label><select id="rec_concurso" onchange="carregarFases();carregarRecursos()"></select></div>
      </div>
      <h3 style="font-size:1rem;color:var(--navy);margin:14px 0 8px">Fases de recurso (prazos)</h3>
      <p class="hint" style="margin-bottom:8px">Sugestões: <span id="rec_sugestoes"></span></p>
      <input type="hidden" id="rf_id">
      <div class="grid2">
        <div><label>Nome da fase</label><input id="rf_nome" placeholder="Ex.: Recurso — Gabarito Preliminar"></div>
        <div><label>Abertura</label><input id="rf_abertura" type="datetime-local"></div>
        <div><label>Fechamento</label><input id="rf_fechamento" type="datetime-local"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px"><button onclick="salvarFase()">Salvar fase</button><button class="sec" onclick="limparFase()">Limpar</button></div>
      <div id="rec_fases_lista" style="margin-top:14px"></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h3 style="font-size:1rem;color:var(--navy);margin:0">Recursos interpostos</h3>
        <div style="display:flex;gap:8px">
          <select id="rec_f_fase" onchange="carregarRecursos()"><option value="">Todas as fases</option></select>
          <select id="rec_f_status" onchange="carregarRecursos()"><option value="">Todos</option><option value="pendente">Pendentes</option><option value="deferido">Deferidos</option><option value="indeferido">Indeferidos</option></select>
        </div>
      </div>
      <div id="rec_lista" style="margin-top:12px"></div>
    </div>
  </section>

  <section id="empresas" style="display:none">
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:10px">Empresas</h2>
      <p class="hint" style="margin-bottom:12px">Cada empresa tem seus próprios concursos e logo. Use o seletor no topo do painel para trocar de empresa.</p>
      <input type="hidden" id="em_id">
      <div class="grid2">
        <div><label>Nome da empresa</label><input id="em_nome" placeholder="Ex.: Recrutamento Brasil"></div>
        <div><label>Subtítulo (aparece no site)</label><input id="em_subtitulo" placeholder="Ex.: Recrutamento e Seleção"></div>
        <div><label>Domínio próprio (opcional)</label><input id="em_dominio" placeholder="Ex.: recrutamentobrasil.com.br"></div>
      </div>
      <label style="margin-top:12px">Logo (PNG ou JPG · até 2 MB)</label>
      <div id="em_logo_atual" class="hint" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="em_logo_file" accept="image/png,image/jpeg" style="border:none;padding:0"><button class="sec" type="button" onclick="enviarLogoEmpresa()">Enviar logo</button></div>
      <div style="margin-top:16px;display:flex;gap:10px"><button onclick="salvarEmpresa()">Salvar empresa</button><button class="sec" onclick="novaEmpresa()">Limpar / Nova</button></div>
    </div>
    <div class="card"><div id="em_lista"></div></div>
  </section>

  <section id="professores" style="display:none">
    <div class="card">
      <h2 style="font-size:1.15rem;color:var(--navy);margin-bottom:6px">Professores</h2>
      <p class="hint" style="margin-bottom:12px">Cadastre os professores da empresa selecionada. Eles acessam em <b id="pf_link">/professor.html</b> com e-mail e senha, e cadastram questões que aparecem no seu Banco de Questões.</p>
      <input type="hidden" id="pf_id">
      <div class="grid2">
        <div><label>Nome</label><input id="pf_nome" placeholder="Ex.: Maria Silva"></div>
        <div><label>E-mail (login)</label><input id="pf_email" type="email" placeholder="maria@email.com"></div>
        <div><label>Disciplina</label><input id="pf_disciplina" placeholder="Ex.: Português"></div>
        <div><label>Senha</label><input id="pf_senha" type="password" placeholder="mín. 6 caracteres"></div>
      </div>
      <div class="checkline" style="margin-top:10px"><input type="checkbox" id="pf_ativo" checked><label for="pf_ativo" style="margin:0">Ativo (pode acessar)</label></div>
      <div style="margin-top:16px;display:flex;gap:10px"><button onclick="salvarProfessor()">Salvar professor</button><button class="sec" onclick="novoProfessor()">Limpar / Novo</button></div>
    </div>
    <div class="card"><div id="pf_lista"></div></div>
  </section>
</div>
<div id="modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:520px;width:92%;padding:20px;max-height:80vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 id="modal_titulo">Títulos anexados</h3><button class="sec" onclick="fecharModal()">Fechar</button>
    </div>
    <div id="modal_corpo"></div>
  </div>
</div>
<div id="modal_edit" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:620px;width:94%;padding:22px;max-height:88vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3>Editar inscrição</h3><button class="sec" onclick="fecharEdit()">Fechar</button>
    </div>
    <input type="hidden" id="ei_id">
    <div class="grid2">
      <div><label>Nome completo</label><input id="ei_nome"></div>
      <div><label>CPF</label><input id="ei_cpf"></div>
      <div><label>E-mail</label><input id="ei_email"></div>
      <div><label>Telefone</label><input id="ei_tel"></div>
      <div><label>Cargo</label><input id="ei_cargo"></div>
      <div><label>Sexo</label><input id="ei_sexo"></div>
      <div><label>Cidade</label><input id="ei_cidade"></div>
      <div><label>UF</label><input id="ei_uf"></div>
      <div><label>Nome social</label><input id="ei_social"></div>
      <div><label>Status de pagamento</label>
        <select id="ei_status"><option value="inscrito">Inscrito</option><option value="aguardando_pagamento">Aguardando pagamento</option><option value="pago">Pago</option></select>
      </div>
    </div>
    <div class="checkline"><input type="checkbox" id="ei_pcd"><label for="ei_pcd" style="margin:0">Pessoa com Deficiência (PcD)</label></div>
    <p class="hint">Atenção: mudar o status para "Pago" manualmente confirma a inscrição sem passar pelo ASAAS. Use apenas em casos especiais.</p>
    <div style="margin-top:16px;display:flex;gap:10px">
      <button onclick="salvarInscrito()">Salvar alterações</button>
      <button class="sec" onclick="fecharEdit()">Cancelar</button>
    </div>
  </div>
</div>
<div id="modal_pagamento" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:680px;width:94%;padding:22px;max-height:92vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3>Configuração de pagamento — <span id="pg_titulo"></span></h3><button class="sec" onclick="document.getElementById('modal_pagamento').style.display='none'">Fechar</button>
    </div>
    <input type="hidden" id="pg_cid">
    <label>Onde o boleto é gerado</label>
    <select id="pg_gateway" onchange="togglePg()"><option value="asaas">ASAAS (conta padrão)</option><option value="bb">Banco do Brasil (conta do cliente)</option></select>
    <div id="pg_bloco_bb" style="display:none;margin-top:12px;border-top:1px solid var(--linha);padding-top:12px">
      <p class="hint" style="margin-bottom:10px">Credenciais do convênio de cobrança do BB (fornecidas pela prefeitura / Portal Developers BB). Ficam guardadas com segurança e não são exibidas de volta.</p>
      <div class="grid2">
        <div><label>Ambiente</label><select id="pg_bb_ambiente"><option value="homologacao">Homologação (testes)</option><option value="producao">Produção</option></select></div>
        <div><label>Client ID</label><input id="pg_bb_client_id"></div>
        <div><label>Client Secret</label><input id="pg_bb_client_secret" type="password" placeholder="deixe em branco p/ manter"></div>
        <div><label>Chave de aplicação (gw-dev-app-key)</label><input id="pg_bb_app_key"></div>
        <div><label>Nº do Convênio</label><input id="pg_bb_convenio"></div>
        <div><label>Carteira</label><input id="pg_bb_carteira" placeholder="ex.: 17"></div>
        <div><label>Variação da carteira</label><input id="pg_bb_variacao" placeholder="ex.: 35"></div>
        <div><label>Agência</label><input id="pg_bb_agencia"></div>
        <div><label>Conta</label><input id="pg_bb_conta"></div>
        <div><label>Beneficiário (nome da prefeitura)</label><input id="pg_bb_beneficiario_nome"></div>
        <div><label>CNPJ do beneficiário</label><input id="pg_bb_beneficiario_doc"></div>
      </div>
    </div>
    <div style="margin-top:16px"><button onclick="salvarPagamento()">Salvar configuração</button></div>
  </div>
</div>
<div id="modal_isencoes" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:820px;width:94%;padding:22px;max-height:90vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3>Pedidos de isenção — <span id="is_titulo"></span></h3><button class="sec" onclick="document.getElementById('modal_isencoes').style.display='none'">Fechar</button>
    </div>
    <p class="hint">Confira a comprovação de cada candidato e decida. Ao <b>negar</b>, o boleto é gerado automaticamente para o candidato pagar até o fim das inscrições.</p>
    <div id="is_lista" style="max-height:66vh;overflow:auto;margin-top:10px"></div>
  </div>
</div>
<div id="modal_acessos" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:680px;width:94%;padding:22px;max-height:90vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3>Acessos — <span id="ac_titulo"></span></h3><button class="sec" onclick="document.getElementById('modal_acessos').style.display='none'">Fechar</button>
    </div>
    <p class="hint">Envie a cada candidato o link <b>/prova.html</b> + o CPF + o código. "Copiar lista" leva tudo para a área de transferência.</p>
    <div style="margin:10px 0"><button class="sec" onclick="copiarAcessos()">Copiar lista</button></div>
    <div id="ac_lista" style="max-height:60vh;overflow:auto"></div>
  </div>
</div>
<div id="modal_import" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:640px;width:94%;padding:22px;max-height:90vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3>Importar candidatos — <span id="imp_titulo"></span></h3><button class="sec" onclick="fecharImport()">Fechar</button>
    </div>
    <input type="hidden" id="imp_cid">
    <p class="hint">Selecione a planilha (Excel .xlsx/.xls ou .csv). A primeira linha deve conter os títulos das colunas.</p>
    <input type="file" id="imp_file" accept=".xlsx,.xls,.csv" onchange="lerImport()" style="margin-top:10px">
    <div id="imp_map" style="display:none;margin-top:14px">
      <p id="imp_info" class="hint" style="margin-bottom:8px"></p>
      <p style="font-weight:600;margin-bottom:6px">Relacione as colunas da sua planilha aos campos do sistema (Nome e CPF são obrigatórios):</p>
      <div id="imp_campos" class="grid2"></div>
      <div class="checkline" style="margin-top:10px"><input type="checkbox" id="imp_pago" checked><label for="imp_pago" style="margin:0">Marcar como pagos/confirmados (inscrição presencial já quitada)</label></div>
      <p class="hint" style="margin-top:8px">🔑 O acesso à Área do Candidato é criado automaticamente: <b>login = CPF</b> e <b>senha = data de nascimento</b> (ex.: 05/01/1990). Para isso, mapeie a coluna <b>Nascimento</b>.</p>
      <div style="margin-top:14px;display:flex;gap:10px"><button onclick="executarImport()">Importar candidatos</button></div>
    </div>
    <div id="imp_result" style="display:none;margin-top:14px;padding:12px;border-radius:8px;background:var(--verde-bg);color:#0f6b41;font-weight:600"></div>
  </div>
</div>
<div id="modal_etapas" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center">
  <div style="background:#fff;border-radius:12px;max-width:660px;width:94%;padding:22px;max-height:88vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3>Etapas &amp; Documentos — <span id="me_titulo"></span></h3><button class="sec" onclick="fecharEtapas()">Fechar</button>
    </div>
    <input type="hidden" id="me_cid">
    <p class="hint">Crie etapas (ex.: Lista de Inscritos, Locais de Prova, Gabarito) e envie os arquivos de cada uma. PDF, JPG ou PNG (até 10 MB).</p>
    <div id="me_etapas" style="margin-top:12px"></div>
    <div class="add-etapa"><input id="me_nova_etapa" placeholder="Nome da nova etapa (ex.: Locais de Prova)" onkeydown="if(event.key==='Enter'){event.preventDefault();addEtapa()}"><button onclick="addEtapa()">+ Etapa</button></div>
    <hr style="margin:18px 0;border:none;border-top:1px solid var(--linha)">
    <h3 style="font-size:1.05rem">Documentos e Retificações</h3>
    <p class="hint">Arquivos avulsos (ex.: retificação do edital), sem ser etapa.</p>
    <div id="me_docs" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
      <input id="me_doc_titulo" placeholder="Título (ex.: Retificação nº 01)" style="flex:1;min-width:180px">
      <input type="file" id="me_doc_file" accept=".pdf,.jpg,.jpeg,.png">
      <button class="sec" onclick="enviarDoc()">Enviar documento</button>
    </div>
  </div>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  let CONCURSOS = [], cargosEdit = [], tiposEdit = [], INSCRITOS = [];
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
    ['concursos','inscritos','relatorios','locacao','alocacao','questoes','prova_online','recursos','empresas','professores'].forEach(s => $(s).style.display = s === t.dataset.t ? 'block' : 'none');
    if (t.dataset.t === 'inscritos') carregarInscritos();
    if (t.dataset.t === 'relatorios') popularRelConcursos();
    if (t.dataset.t === 'locacao') popularLocConcursos();
    if (t.dataset.t === 'alocacao') popularAlConcursos();
    if (t.dataset.t === 'questoes') { if(!QALTS.length) novaQuestao(); popularProvaConcursos(); carregarQuestoes(); }
    if (t.dataset.t === 'prova_online') { popularProvaOnline(); }
    if (t.dataset.t === 'recursos') { popularRecursos(); }
    if (t.dataset.t === 'empresas') { carregarEmpresas(); }
    if (t.dataset.t === 'professores') { carregarProfessores(); }
  });
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function combinaDT(data, hora, horaPadrao){ if(!data) return ''; return data+'T'+((hora||horaPadrao)).slice(0,5); }
  function sitTag(c){
    var t = c.situacao==='abertas' ? '<span class="tag on">Inscrições abertas</span>'
      : c.situacao==='andamento' ? '<span class="tag aguard">Em andamento</span>'
      : '<span class="tag off">Encerrado</span>';
    if(!c.aberto) t += ' <span class="tag off">Oculto</span>';
    return t;
  }

  async function carregarConcursos(){
    const { concursos } = await (await fetch('/admin/concursos.json' + (EMPRESA_ID?('?empresa='+EMPRESA_ID):''))).json();
    CONCURSOS = concursos;
    $('lista_concursos').innerHTML = concursos.map(c => \`
      <div class="conc">
        <div>
          <h3>\${esc(c.titulo)} \${sitTag(c)}</h3>
          <div class="meta">\${esc(c.orgao||'')} &middot; \${c.inscritos} inscritos (\${c.pagos} pagos) &middot; taxa \${esc(c.taxa||'-')}</div>
          <div class="meta">Link: <a href="/concurso.html?c=\${esc(c.slug)}" target="_blank">/concurso.html?c=\${esc(c.slug)}</a></div>
        </div>
        <div class="row-actions"><button class="mini" onclick='abrirPagamento(\${JSON.stringify(c.id)})'>Pagamento</button><button class="mini" onclick='abrirImport(\${JSON.stringify(c.id)})'>Importar Excel</button><button class="mini" onclick='gerarLogins(\${JSON.stringify(c.id)})'>Gerar acessos</button><button class="mini" onclick='abrirEtapas(\${JSON.stringify(c.id)})'>Etapas / Docs</button><button class="mini" onclick='abrirIsencoes(\${JSON.stringify(c.id)})'>Isenções</button><button class="mini" onclick='editarConcurso(\${JSON.stringify(c.id)})'>Editar</button><button class="del" onclick='limparCandidatos(\${JSON.stringify(c.id)})'>Excluir candidatos</button><button class="del" onclick='excluirConcurso(\${JSON.stringify(c.id)})'>Excluir</button></div>
      </div>\`).join('') || '<p class="hint">Nenhum concurso ainda. Clique em "Novo concurso".</p>';
    // popular filtro de inscritos
    $('filtro_concurso').innerHTML = '<option value="">Todos os concursos</option>' + concursos.map(c=>'<option value="'+c.id+'">'+esc(c.titulo)+'</option>').join('');
  }
  function novoConcurso(){
    $('form_titulo').textContent='Novo concurso'; $('c_id').value='';
    ['c_titulo','c_orgao','c_periodo','c_prova','c_vagas','c_taxa','c_valor','c_dias','c_pdf','c_data_inicio','c_data_fim','c_data_encerramento'].forEach(id=>$(id).value='');
    $('c_dias').value='5'; $('c_aberto').checked=true; cargosEdit=[]; renderCargos();
    $('c_gratuito').checked=false; $('c_pede_titulos').checked=false; $('c_pede_laudo').checked=false; popularEmpresaSel(EMPRESA_ID); $('c_laudo_inicio').value=''; $('c_laudo_fim').value=''; toggleLaudo(); $('c_pede_isencao').checked=false; $('c_isencao_texto').value=''; $('c_isencao_inicio').value=''; $('c_isencao_fim').value=''; toggleIsencao(); tiposEdit=[]; renderTipos(); toggleTitulos();
    $('c_tit_ini_data').value=''; $('c_tit_ini_hora').value=''; $('c_tit_fim_data').value=''; $('c_tit_fim_hora').value='';
    if($('c_brasao_file')) $('c_brasao_file').value='';
    $('brasao_atual').innerHTML='<i>Salve o concurso primeiro para enviar o brasão.</i>';
    if($('c_pdf_file')) $('c_pdf_file').value='';
    $('edital_atual').innerHTML='<i>Salve o concurso primeiro; depois o botão de enviar PDF fica disponível.</i>';
    $('form_concurso').style.display='block'; $('form_concurso').scrollIntoView({behavior:'smooth'});
  }
  function editarConcurso(id){
    const c = CONCURSOS.find(x=>x.id===id); if(!c)return;
    $('form_titulo').textContent='Editar concurso'; $('c_id').value=c.id;
    $('c_titulo').value=c.titulo||''; $('c_orgao').value=c.orgao||''; $('c_periodo').value=c.periodo||'';
    $('c_prova').value=c.prova||''; $('c_vagas').value=c.vagas||''; $('c_taxa').value=c.taxa||'';
    $('c_valor').value=c.taxa_valor||0; $('c_dias').value=c.dias_vencimento||5; $('c_pdf').value=c.pdf_url||'';
    $('c_data_inicio').value=c.data_inicio||''; $('c_data_fim').value=c.data_fim||''; $('c_data_encerramento').value=c.data_encerramento||'';
    $('c_aberto').checked=!!c.aberto; cargosEdit=(c.cargos||[]).slice(); renderCargos();
    $('c_gratuito').checked=!!c.gratuito; $('c_pede_titulos').checked=!!c.pede_titulos; $('c_pede_laudo').checked=!!c.pede_laudo; popularEmpresaSel(c.empresa_id||EMPRESA_ID); $('c_laudo_inicio').value=c.laudo_inicio||''; $('c_laudo_fim').value=c.laudo_fim||''; toggleLaudo(); $('c_pede_isencao').checked=!!c.pede_isencao; $('c_isencao_texto').value=c.isencao_texto||''; $('c_isencao_inicio').value=c.isencao_inicio||''; $('c_isencao_fim').value=c.isencao_fim||''; toggleIsencao(); tiposEdit=(c.tipos_titulos||[]).slice(); renderTipos(); toggleTitulos();
    var _ti=(c.titulos_inicio||'').split('T'), _tf=(c.titulos_fim||'').split('T');
    $('c_tit_ini_data').value=_ti[0]||''; $('c_tit_ini_hora').value=(_ti[1]||'').slice(0,5);
    $('c_tit_fim_data').value=_tf[0]||''; $('c_tit_fim_hora').value=(_tf[1]||'').slice(0,5);
    if($('c_brasao_file')) $('c_brasao_file').value='';
    $('brasao_atual').innerHTML = c.brasao_url ? ('Brasão atual: <img src="'+esc(c.brasao_url)+'?t='+Date.now()+'" style="height:26px;vertical-align:middle;border-radius:4px"> — envie outro para substituir') : '<i>Nenhum brasão enviado.</i>';
    if($('c_pdf_file')) $('c_pdf_file').value='';
    $('edital_atual').innerHTML = c.pdf_url ? ('Edital atual: <a href="'+esc(c.pdf_url)+'" target="_blank">ver PDF</a> — envie outro abaixo para substituir.') : '<i>Nenhum edital enviado ainda.</i>';
    $('form_concurso').style.display='block'; $('form_concurso').scrollIntoView({behavior:'smooth'});
  }
  function fecharForm(){ $('form_concurso').style.display='none'; }
  function renderCargos(){ $('lista_cargos').innerHTML = cargosEdit.map((c,i)=>'<div class="cargo-item"><span>'+esc(c)+'</span><button class="del" onclick="removeCargo('+i+')">Remover</button></div>').join('')||'<p class="hint">Nenhum cargo.</p>'; }
  function addCargo(){ const v=$('novo_cargo').value.trim(); if(!v)return; cargosEdit.push(v); $('novo_cargo').value=''; renderCargos(); }
  function removeCargo(i){ cargosEdit.splice(i,1); renderCargos(); }
  function toggleLaudo(){ $('bloco_laudo').style.display = $('c_pede_laudo').checked ? 'block' : 'none'; }
  function toggleTitulos(){ $('bloco_titulos').style.display = $('c_pede_titulos').checked ? 'block' : 'none'; }
  function toggleIsencao(){ $('bloco_isencao').style.display = $('c_pede_isencao').checked ? 'block' : 'none'; }
  function renderTipos(){ $('lista_tipos').innerHTML = tiposEdit.map((t,i)=>'<div class="cargo-item"><span>'+esc(t)+'</span><button class="del" onclick="removeTipo('+i+')">Remover</button></div>').join('')||'<p class="hint">Nenhum tipo cadastrado.</p>'; }
  function addTipo(){ const v=$('novo_tipo').value.trim(); if(!v)return; tiposEdit.push(v); $('novo_tipo').value=''; renderTipos(); }
  function removeTipo(i){ tiposEdit.splice(i,1); renderTipos(); }
  async function salvarConcurso(){
    const payload={ id:$('c_id').value||undefined, titulo:$('c_titulo').value, orgao:$('c_orgao').value, periodo:$('c_periodo').value,
      prova:$('c_prova').value, vagas:$('c_vagas').value, taxa:$('c_taxa').value, taxa_valor:$('c_valor').value,
      dias_vencimento:$('c_dias').value, pdf_url:$('c_pdf').value, aberto:$('c_aberto').checked,
      data_inicio:$('c_data_inicio').value, data_fim:$('c_data_fim').value, data_encerramento:$('c_data_encerramento').value,
      gratuito:$('c_gratuito').checked, pede_titulos:$('c_pede_titulos').checked, pede_laudo:$('c_pede_laudo').checked, laudo_inicio:$('c_laudo_inicio').value, laudo_fim:$('c_laudo_fim').value, pede_isencao:$('c_pede_isencao').checked, isencao_texto:$('c_isencao_texto').value, isencao_inicio:$('c_isencao_inicio').value, isencao_fim:$('c_isencao_fim').value, tipos_titulos:tiposEdit, cargos:cargosEdit, empresa_id:(parseInt($('c_empresa').value)||EMPRESA_ID),
      titulos_inicio: combinaDT($('c_tit_ini_data').value, $('c_tit_ini_hora').value, '00:00'),
      titulos_fim: combinaDT($('c_tit_fim_data').value, $('c_tit_fim_hora').value, '23:59') };
    const r=await fetch('/admin/concurso',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){alert(j.erro||'Erro ao salvar');return;}
    $('c_id').value=j.id; $('form_titulo').textContent='Editar concurso';
    if(!$('edital_atual').innerHTML || $('edital_atual').innerHTML.indexOf('Salve o concurso')>-1)
      $('edital_atual').innerHTML='<i>Concurso salvo. Agora você já pode enviar o PDF do edital abaixo.</i>';
    $('ok_conc').style.display='block'; setTimeout(()=>$('ok_conc').style.display='none',2500);
    await carregarConcursos();
  }
  async function enviarEdital(){
    const id=$('c_id').value;
    if(!id){ alert('Salve o concurso primeiro; depois envie o PDF do edital.'); return; }
    const f=$('c_pdf_file').files[0];
    if(!f){ alert('Escolha um arquivo PDF no botão "Escolher arquivo".'); return; }
    if(f.type && f.type!=='application/pdf'){ alert('O arquivo precisa ser um PDF.'); return; }
    if(f.size > 15*1024*1024){ alert('PDF muito grande (máximo 15 MB).'); return; }
    $('edital_atual').innerHTML='<i>Enviando PDF...</i>';
    try{
      const b64=await new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(f);});
      const r=await fetch('/admin/concurso/'+id+'/edital',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:f.name,dataBase64:b64})});
      const j=await r.json(); if(!r.ok){ $('edital_atual').innerHTML='<i>Falha no envio.</i>'; alert(j.erro||'Erro ao enviar'); return; }
      $('c_pdf').value=j.pdf_url;
      $('edital_atual').innerHTML='Edital enviado ✓ (<a href="'+esc(j.pdf_url)+'" target="_blank">ver PDF</a>)';
      await carregarConcursos();
      alert('Edital enviado com sucesso!');
    }catch(e){ $('edital_atual').innerHTML='<i>Falha no envio.</i>'; alert('Não foi possível ler o arquivo.'); }
  }
  async function enviarBrasao(){
    const id=$('c_id').value;
    if(!id){ alert('Salve o concurso primeiro; depois envie o brasão.'); return; }
    const f=$('c_brasao_file').files[0];
    if(!f){ alert('Escolha uma imagem.'); return; }
    if(f.type && f.type!=='image/png' && f.type!=='image/jpeg'){ alert('Envie uma imagem JPG ou PNG.'); return; }
    if(f.size>2*1024*1024){ alert('Máximo 2 MB.'); return; }
    $('brasao_atual').innerHTML='<i>Enviando...</i>';
    try{
      const b64=await toB64(f);
      const r=await fetch('/admin/concurso/'+id+'/brasao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataBase64:b64})});
      const j=await r.json(); if(!r.ok){ $('brasao_atual').innerHTML='<i>Falha.</i>'; alert(j.erro||'Erro'); return; }
      $('brasao_atual').innerHTML='Brasão enviado ✓ <img src="'+j.brasao_url+'?t='+Date.now()+'" style="height:26px;vertical-align:middle;border-radius:4px;margin-left:6px">';
      await carregarConcursos();
    }catch(e){ $('brasao_atual').innerHTML='<i>Falha.</i>'; alert('Não foi possível enviar a imagem.'); }
  }

  function statusTag(s){ if(s==='pago')return '<span class="tag pago">Pago</span>'; if(s==='aguardando_pagamento')return '<span class="tag aguard">Aguardando</span>'; return '<span class="tag insc">Inscrito</span>'; }
  async function carregarInscritos(){
    const cid=$('filtro_concurso').value;
    $('btn_csv').href = '/admin/inscritos.csv' + (cid?('?concurso='+cid):'');
    const url='/admin/inscritos.json'+(cid?('?concurso='+cid):'');
    const { inscritos } = await (await fetch(url)).json();
    INSCRITOS = inscritos;
    const pagos = inscritos.filter(r=>r.status==='pago').length;
    $('resumo_insc').innerHTML = '<b>Total:</b> '+inscritos.length+' &nbsp; <b>Pagos:</b> '+pagos;
    $('linhas_insc').innerHTML = inscritos.map(r=>{
      const pag = r.invoice_url ? '<a href="'+esc(r.invoice_url)+'" target="_blank">abrir fatura</a>' : '<button class="mini" onclick="gerar('+r.id+')">Gerar cobrança</button>';
      const tit = r.titulos>0 ? '<button class="mini" onclick="verTitulos('+r.id+')">Ver ('+r.titulos+')</button>' : '<span style="color:#aaa">—</span>';
      const acoes = '<button class="mini" onclick="editarInscrito('+r.id+')">Editar</button> <button class="del" style="padding:6px 10px" onclick="excluirInscrito('+r.id+')">Excluir</button>';
      return '<tr><td>'+esc(r.protocolo)+'</td><td>'+esc(r.nome)+'</td><td>'+esc(r.cpf)+'</td><td>'+esc(r.cargo)+'</td><td>'+statusTag(r.status)+'</td><td>'+pag+'</td><td>'+tit+'</td><td>'+new Date(r.criado_em).toLocaleString('pt-BR')+'</td><td>'+acoes+'</td></tr>';
    }).join('') || '<tr><td colspan="9" style="text-align:center;color:#888;padding:18px">Nenhum inscrito.</td></tr>';
  }
  async function gerar(id){ if(!confirm('Gerar link de pagamento para este inscrito?'))return; const r=await fetch('/admin/cobranca/'+id,{method:'POST'}); const j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarInscritos(); }
  async function verTitulos(id){
    const { titulos } = await (await fetch('/admin/inscrito/'+id+'/titulos.json')).json();
    $('modal_corpo').innerHTML = titulos.length ? titulos.map(t=>'<div style="padding:9px 0;border-bottom:1px solid #eee"><b>'+esc(t.tipo||'Título')+'</b><br><a href="/admin/titulo/'+t.id+'" target="_blank">'+esc(t.filename)+'</a> <span style="color:#888">('+Math.round((t.tamanho||0)/1024)+' KB)</span></div>').join('') : '<p>Nenhum título anexado.</p>';
    $('modal').style.display='flex';
  }
  function fecharModal(){ $('modal').style.display='none'; }
  function editarInscrito(id){
    const r = INSCRITOS.find(x=>x.id===id); if(!r)return;
    $('ei_id').value=r.id; $('ei_nome').value=r.nome||''; $('ei_cpf').value=r.cpf||'';
    $('ei_email').value=r.email||''; $('ei_tel').value=r.telefone||''; $('ei_cargo').value=r.cargo||'';
    $('ei_cidade').value=r.cidade||''; $('ei_uf').value=r.uf||''; $('ei_sexo').value=r.sexo||'';
    $('ei_social').value=r.nome_social||''; $('ei_pcd').checked=!!r.pcd; $('ei_status').value=r.status||'inscrito';
    $('modal_edit').style.display='flex';
  }
  function fecharEdit(){ $('modal_edit').style.display='none'; }
  async function salvarInscrito(){
    const id=$('ei_id').value;
    const payload={ nome:$('ei_nome').value, cpf:$('ei_cpf').value, email:$('ei_email').value, telefone:$('ei_tel').value,
      cargo:$('ei_cargo').value, cidade:$('ei_cidade').value, uf:$('ei_uf').value, sexo:$('ei_sexo').value,
      nome_social:$('ei_social').value, pcd:$('ei_pcd').checked, status:$('ei_status').value };
    const r=await fetch('/admin/inscrito/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){alert(j.erro||'Erro ao salvar');return;}
    fecharEdit(); carregarInscritos();
  }
  async function excluirInscrito(id){
    if(!confirm('Excluir esta inscrição? A ação é irreversível e remove também os títulos anexados.'))return;
    const r=await fetch('/admin/inscrito/'+id,{method:'DELETE'});
    const j=await r.json(); if(!r.ok){alert(j.erro||'Erro ao excluir');return;}
    carregarInscritos();
  }

  function toB64(file){ return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsDataURL(file);}); }
  function abrirEtapas(id){ var c=CONCURSOS.find(function(x){return x.id===id;}); $('me_cid').value=id; $('me_titulo').textContent=c?c.titulo:''; $('modal_etapas').style.display='flex'; carregarEtapas(); }
  var ISENCAO_CONC=0;
  async function abrirIsencoes(id){
    var c=CONCURSOS.find(function(x){return x.id===id;});
    $('is_titulo').textContent=c?c.titulo:'';
    $('modal_isencoes').style.display='flex';
    await carregarIsencoes(id);
  }
  async function carregarIsencoes(id){
    ISENCAO_CONC=id;
    var d=await (await fetch('/admin/concurso/'+id+'/isencoes.json')).json();
    var arr=d.isencoes||[];
    if(!arr.length){ $('is_lista').innerHTML='<p class="hint">Nenhum candidato pediu isenção neste concurso.</p>'; return; }
    $('is_lista').innerHTML=arr.map(function(k){
      var badge = k.isencao_status==='aprovada' ? '<span class="tag on">Aprovada</span>'
        : k.isencao_status==='negada' ? '<span class="tag" style="background:#fde2e2;color:#b42318">Negada</span>'
        : '<span class="tag" style="background:#fff3cd;color:#8a6d1b">Pendente</span>';
      var doc = k.tem_doc
        ? '<a href="/admin/candidato/'+k.id+'/isencao" target="_blank">Ver comprovação'+(k.isencao_doc_nome?(' ('+esc(k.isencao_doc_nome)+')'):'')+'</a>'
        : '<span class="hint">Sem comprovação enviada ainda</span>';
      var acoes = (k.isencao_status==='aprovada' || k.isencao_status==='negada')
        ? '<span class="hint">Analisado'+(k.analise_em?(' em '+k.analise_em):'')+(k.isencao_obs?(' — '+esc(k.isencao_obs)):'')+'</span>'
        : '<button class="mini" onclick="decidirIsencao('+k.id+',\\'aprovar\\')">Aprovar</button> <button class="del" onclick="decidirIsencao('+k.id+',\\'negar\\')">Negar (gera boleto)</button>';
      return '<div style="border:1px solid var(--linha);border-radius:9px;padding:12px;margin-bottom:10px">'
        +'<div style="display:flex;justify-content:space-between;gap:10px"><b>'+esc(k.nome)+'</b> '+badge+'</div>'
        +'<div class="hint" style="margin:3px 0">'+esc(k.cpf)+' · '+esc(k.cargo)+' · '+esc(k.protocolo)+'</div>'
        +(k.isencao_motivo?('<div style="margin:4px 0"><b>Motivo:</b> '+esc(k.isencao_motivo)+'</div>'):'')
        +'<div style="margin:6px 0">'+doc+'</div>'
        +'<div style="margin-top:8px">'+acoes+'</div></div>';
    }).join('');
  }
  async function decidirIsencao(id,decisao){
    var obs='';
    if(decisao==='negar'){ obs=prompt('Motivo da negativa (opcional, aparece para o candidato):'); if(obs===null)return; }
    if(!confirm(decisao==='aprovar'?'Aprovar a isenção deste candidato? A inscrição será confirmada sem pagamento.':'Negar a isenção? O boleto será gerado para o candidato pagar.'))return;
    var r=await fetch('/admin/candidato/'+id+'/isencao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decisao:decisao,obs:obs||''})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    if(decisao==='negar') alert(j.boleto?'Isenção negada. Boleto gerado para o candidato.':'Isenção negada. '+(j.avisoPagamento?'O boleto sai quando o candidato acessar a área dele.':'Sem cobrança configurada.'));
    else alert('Isenção aprovada! Inscrição confirmada.');
    carregarIsencoes(ISENCAO_CONC);
  }
  function fecharEtapas(){ $('modal_etapas').style.display='none'; }
  async function carregarEtapas(){
    var id=$('me_cid').value;
    var d=await (await fetch('/admin/concurso/'+id+'/etapas.json')).json();
    $('me_etapas').innerHTML = (d.etapas&&d.etapas.length) ? d.etapas.map(function(e){
      var arqs = e.arquivos.length ? e.arquivos.map(function(a){
        return '<div class="arq-item"><span>'+esc(a.filename)+'</span><a href="/arquivo/etapa/'+a.id+'" target="_blank">ver</a><button class="del" onclick="delArq('+a.id+')">Excluir</button></div>';
      }).join('') : '<p class="hint">Nenhum arquivo nesta etapa.</p>';
      return '<div class="etapa-box"><div class="etapa-head"><b>'+esc(e.nome)+'</b><button class="del" onclick="delEtapa('+e.id+')">Excluir etapa</button></div>'
        + arqs
        + '<div class="add-arq"><input type="file" id="arq_'+e.id+'" accept=".pdf,.jpg,.jpeg,.png"><button class="sec" onclick="enviarArqEtapa('+e.id+')">Enviar arquivo</button></div></div>';
    }).join('') : '<p class="hint">Nenhuma etapa criada ainda.</p>';
    $('me_docs').innerHTML = (d.documentos&&d.documentos.length) ? d.documentos.map(function(x){
      return '<div class="arq-item"><span>'+esc(x.titulo||x.filename)+'</span><a href="/arquivo/documento/'+x.id+'" target="_blank">ver</a><button class="del" onclick="delDoc('+x.id+')">Excluir</button></div>';
    }).join('') : '<p class="hint">Nenhum documento avulso.</p>';
  }
  async function addEtapa(){
    var nome=$('me_nova_etapa').value.trim(); if(!nome){alert('Digite o nome da etapa.');return;}
    var r=await fetch('/admin/concurso/'+$('me_cid').value+'/etapa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} $('me_nova_etapa').value=''; carregarEtapas();
  }
  async function delEtapa(id){ if(!confirm('Excluir esta etapa e todos os arquivos dela?'))return; var r=await fetch('/admin/etapa/'+id,{method:'DELETE'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEtapas(); }
  async function enviarArqEtapa(id){
    var inp=document.getElementById('arq_'+id); var f=inp.files[0];
    if(!f){alert('Escolha um arquivo.');return;} if(f.size>10*1024*1024){alert('Máximo 10 MB.');return;}
    var b64=await toB64(f);
    var r=await fetch('/admin/etapa/'+id+'/arquivo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:f.name,dataBase64:b64})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEtapas();
  }
  async function delArq(id){ if(!confirm('Excluir este arquivo?'))return; var r=await fetch('/admin/arquivo/'+id,{method:'DELETE'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEtapas(); }
  async function enviarDoc(){
    var f=$('me_doc_file').files[0]; if(!f){alert('Escolha um arquivo.');return;} if(f.size>10*1024*1024){alert('Máximo 10 MB.');return;}
    var b64=await toB64(f);
    var r=await fetch('/admin/concurso/'+$('me_cid').value+'/documento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo:$('me_doc_titulo').value,filename:f.name,dataBase64:b64})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} $('me_doc_titulo').value=''; $('me_doc_file').value=''; carregarEtapas();
  }
  async function delDoc(id){ if(!confirm('Excluir este documento?'))return; var r=await fetch('/admin/documento/'+id,{method:'DELETE'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEtapas(); }

  function popularRelConcursos(){
    var opts = '<option value="">Selecione o concurso...</option>' + CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join('');
    $('rel_concurso').innerHTML = opts;
    if($('lp_concurso')) $('lp_concurso').innerHTML = opts;
    if($('ata_concurso')) $('ata_concurso').innerHTML = opts;
    if($('pr_concurso')) $('pr_concurso').innerHTML = opts;
    if($('fs_concurso')) $('fs_concurso').innerHTML = opts;
    if($('fp_concurso')) $('fp_concurso').innerHTML = opts;
    if($('ct_concurso')) $('ct_concurso').innerHTML = opts;
    if($('et_concurso')) $('et_concurso').innerHTML = opts;
    $('rel_cargo').innerHTML = '<option value="">Todos os cargos</option>';
    $('rel_total').textContent = ''; if($('lp_total')) $('lp_total').textContent='';
    if($('ata_sala')) $('ata_sala').innerHTML='<option value="">Todas as salas</option>';
    if($('pr_sala')) $('pr_sala').innerHTML='<option value="">Todas as salas</option>';
    if($('fs_sala')) $('fs_sala').innerHTML='<option value="">Todas as salas</option>';
  }
  async function fillSalas(concSel, salaSel){
    $(salaSel).innerHTML='<option value="">Todas as salas</option>';
    var id=$(concSel).value; if(!id)return;
    try{ var d=await (await fetch('/admin/concurso/'+id+'/salas.json')).json();
      $(salaSel).innerHTML='<option value="">Todas as salas</option>'+d.salas.map(function(s){return '<option value="'+s.id+'">'+esc(s.escola)+' — '+esc(s.nome)+'</option>';}).join('');
    }catch(e){}
  }
  function prPDF(){ if(!$('pr_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/presenca.html?concurso='+encodeURIComponent($('pr_concurso').value)+'&sala='+encodeURIComponent($('pr_sala').value),'_blank'); }
  function fsPDF(){ if(!$('fs_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/frente-sala.html?concurso='+encodeURIComponent($('fs_concurso').value)+'&sala='+encodeURIComponent($('fs_sala').value),'_blank'); }
  function fpPDF(){ if(!$('fp_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/frente-predio.html?concurso='+encodeURIComponent($('fp_concurso').value),'_blank'); }
  async function fillSalasCt(){
    var id=$('ct_concurso').value;
    var c=CONCURSOS.find(function(x){return String(x.id)===String(id);});
    $('ct_cargo').innerHTML='<option value="">Todos os cargos</option>'+((c&&c.cargos||[]).map(function(cg){return '<option>'+esc(cg)+'</option>';}).join(''));
    $('ct_sala').innerHTML='<option value="">Todas as salas</option>';
    if(!id)return;
    try{ var d=await (await fetch('/admin/concurso/'+id+'/salas.json')).json();
      $('ct_sala').innerHTML='<option value="">Todas as salas</option>'+d.salas.map(function(s){return '<option value="'+s.id+'">'+esc(s.escola)+' — '+esc(s.nome)+'</option>';}).join('');
    }catch(e){}
  }
  function ctPDF(){
    if(!$('ct_concurso').value){alert('Selecione o concurso.');return;}
    var u='/admin/relatorio/cartoes.html?concurso='+encodeURIComponent($('ct_concurso').value)
      +'&sala='+encodeURIComponent($('ct_sala').value)
      +'&cargo='+encodeURIComponent($('ct_cargo').value)
      +'&questoes='+encodeURIComponent($('ct_questoes').value)
      +'&alternativas='+encodeURIComponent($('ct_alternativas').value)
      +'&data='+encodeURIComponent($('ct_data').value)
      +'&turno='+encodeURIComponent($('ct_turno').value);
    window.open(u,'_blank');
  }
  function etPDF(){ if(!$('et_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/etiquetas.html?concurso='+encodeURIComponent($('et_concurso').value)+'&turno='+encodeURIComponent($('et_turno').value),'_blank'); }
  async function ataSalas(){
    if($('ata_sala')) $('ata_sala').innerHTML='<option value="">Todas as salas</option>';
    var id=$('ata_concurso').value; if(!id)return;
    try{ var d=await (await fetch('/admin/concurso/'+id+'/salas.json')).json();
      $('ata_sala').innerHTML='<option value="">Todas as salas</option>'+d.salas.map(function(s){return '<option value="'+s.id+'">'+esc(s.escola)+' — '+esc(s.nome)+'</option>';}).join('');
    }catch(e){}
  }
  function ataPDF(){ if(!$('ata_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/ata.html?concurso='+encodeURIComponent($('ata_concurso').value)+'&sala='+encodeURIComponent($('ata_sala').value),'_blank'); }
  function lpParams(){ return 'concurso='+encodeURIComponent($('lp_concurso').value)+'&modo='+$('lp_modo').value+'&versao='+$('lp_versao').value; }
  async function lpPreview(){
    if(!$('lp_concurso').value){ $('lp_total').textContent=''; return; }
    try{ var d=await (await fetch('/admin/concurso/'+$('lp_concurso').value+'/salas.json')).json();
      var tot=d.salas.reduce(function(a,s){return a+(s.ocupacao||0);},0);
      $('lp_total').innerHTML='<b>'+tot+'</b> candidato(s) alocado(s) em '+d.salas.length+' sala(s).';
    }catch(e){}
  }
  function lpPDF(){ if(!$('lp_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/locais.html?'+lpParams(),'_blank'); }
  function lpCSV(){ if(!$('lp_concurso').value){alert('Selecione o concurso.');return;} window.location.href='/admin/relatorio/locais.csv?'+lpParams(); }
  function relCargos(){
    var c = CONCURSOS.find(function(x){return String(x.id)===String($('rel_concurso').value);});
    $('rel_cargo').innerHTML = '<option value="">Todos os cargos</option>' + ((c&&c.cargos||[]).map(function(cg){return '<option>'+esc(cg)+'</option>';}).join(''));
  }
  function relParams(){
    return 'concurso='+encodeURIComponent($('rel_concurso').value)
      +'&cargo='+encodeURIComponent($('rel_cargo').value)
      +'&pagamento='+$('rel_pagamento').value
      +'&pcd='+$('rel_pcd').value
      +'&versao='+$('rel_versao').value;
  }
  async function relPreview(){
    if(!$('rel_concurso').value){ $('rel_total').textContent=''; return; }
    try{ var d=await (await fetch('/admin/relatorio/inscritos.json?'+relParams())).json();
      $('rel_total').innerHTML='<b>'+d.total+'</b> inscrito(s) encontrado(s) com os filtros atuais.';
    }catch(e){}
  }
  function relPDF(){ if(!$('rel_concurso').value){alert('Selecione o concurso.');return;} window.open('/admin/relatorio/inscritos.html?'+relParams(),'_blank'); }
  function relCSV(){ if(!$('rel_concurso').value){alert('Selecione o concurso.');return;} window.location.href='/admin/relatorio/inscritos.csv?'+relParams(); }

  var ESCOLAS=[];
  function popularLocConcursos(){
    $('loc_concurso').innerHTML='<option value="">Selecione o concurso...</option>'+CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join('');
    $('loc_lista').innerHTML=''; $('loc_resumo').textContent='';
  }
  async function carregarEscolas(){
    var id=$('loc_concurso').value; if(!id){ $('loc_lista').innerHTML=''; $('loc_resumo').textContent=''; return; }
    var d=await (await fetch('/admin/concurso/'+id+'/escolas.json')).json();
    ESCOLAS=d.escolas;
    var falta=d.inscritos-d.capacidade_total;
    var resumo='<b>Inscritos:</b> '+d.inscritos+' &nbsp; <b>Capacidade cadastrada:</b> '+d.capacidade_total+' lugares';
    if(d.capacidade_total>0||d.inscritos>0) resumo += falta>0 ? ' &nbsp; <span style="color:#a12626;font-weight:700">(faltam '+falta+' lugares)</span>' : ' &nbsp; <span style="color:#0f6b41;font-weight:700">(capacidade suficiente)</span>';
    $('loc_resumo').innerHTML=resumo;
    $('loc_lista').innerHTML = d.escolas.length ? d.escolas.map(escolaCard).join('') : '<p class="hint" style="margin:10px 0">Nenhuma escola cadastrada ainda.</p>';
  }
  function escolaCard(e){
    var salas = e.salas.length ? e.salas.map(function(s){
      return '<div class="arq-item"><span><b>'+esc(s.nome)+'</b> — '+s.capacidade+' lugares'+(s.obs?(' · '+esc(s.obs)):'')+'</span><button class="del" onclick="delSala('+s.id+')">Excluir</button></div>';
    }).join('') : '<p class="hint">Nenhuma sala cadastrada.</p>';
    return '<div class="card">'
      + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'
      +   '<div><h3 style="color:var(--navy);font-size:1.05rem">'+esc(e.nome)+'</h3>'
      +     '<div style="color:var(--suave);font-size:.85rem">'+esc(e.endereco||'')+'</div>'
      +     '<div style="color:var(--suave);font-size:.85rem">'+e.salas.length+' sala(s) · '+e.capacidade+' lugares</div></div>'
      +   '<div class="row-actions"><button class="mini" onclick="editEscola('+e.id+')">Editar</button><button class="del" onclick="delEscola('+e.id+')">Excluir</button></div>'
      + '</div>'
      + '<div style="margin-top:12px">'+salas+'</div>'
      + '<div class="add-arq" style="margin-top:10px">'
      +   '<input id="sn_'+e.id+'" placeholder="Sala (ex.: Sala 1)" style="max-width:160px">'
      +   '<input id="sc_'+e.id+'" type="number" min="1" placeholder="Capacidade" style="max-width:120px">'
      +   '<input id="so_'+e.id+'" placeholder="Andar / observação" style="max-width:190px">'
      +   '<button class="sec" onclick="addSala('+e.id+')">+ Sala</button>'
      + '</div></div>';
  }
  async function addEscola(){
    var id=$('loc_concurso').value; if(!id){alert('Selecione o concurso.');return;}
    var nome=$('loc_nome').value.trim(); if(!nome){alert('Informe o nome da escola.');return;}
    var r=await fetch('/admin/concurso/'+id+'/escola',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome,endereco:$('loc_endereco').value})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    $('loc_nome').value=''; $('loc_endereco').value=''; carregarEscolas();
  }
  async function editEscola(id){
    var e=ESCOLAS.find(function(x){return x.id===id;}); if(!e)return;
    var nome=prompt('Nome da escola:', e.nome); if(nome===null)return;
    var end=prompt('Endereço completo:', e.endereco||''); if(end===null)return;
    var r=await fetch('/admin/escola/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome,endereco:end})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEscolas();
  }
  async function delEscola(id){
    if(!confirm('Excluir esta escola e todas as suas salas?'))return;
    var r=await fetch('/admin/escola/'+id,{method:'DELETE'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEscolas();
  }
  async function addSala(escolaId){
    var nome=($('sn_'+escolaId).value||'').trim(), cap=($('sc_'+escolaId).value||''), obs=($('so_'+escolaId).value||'');
    if(!nome){alert('Informe o nome da sala.');return;}
    if(!parseInt(cap)||parseInt(cap)<=0){alert('Informe a capacidade da sala.');return;}
    var r=await fetch('/admin/escola/'+escolaId+'/sala',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome,capacidade:cap,obs:obs})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEscolas();
  }
  async function delSala(id){
    if(!confirm('Excluir esta sala?'))return;
    var r=await fetch('/admin/sala/'+id,{method:'DELETE'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarEscolas();
  }

  var AL_CANDS=[];
  function popularAlConcursos(){
    $('al_concurso').innerHTML='<option value="">Selecione o concurso...</option>'+CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join('');
    $('al_sala').innerHTML=''; $('al_linhas').innerHTML=''; $('al_resumo').textContent='';
    $('al_cargo').innerHTML='<option value="">Todos</option>';
  }
  async function alInit(){
    var id=$('al_concurso').value;
    if(!id){ $('al_sala').innerHTML=''; $('al_linhas').innerHTML=''; $('al_resumo').textContent=''; return; }
    var c=CONCURSOS.find(function(x){return String(x.id)===String(id);});
    $('al_cargo').innerHTML='<option value="">Todos</option>'+((c&&c.cargos||[]).map(function(cg){return '<option>'+esc(cg)+'</option>';}).join(''));
    await alCarregarSalas(); alBuscar();
  }
  async function alCarregarSalas(){
    var id=$('al_concurso').value; if(!id)return;
    var d=await (await fetch('/admin/concurso/'+id+'/salas.json')).json();
    $('al_sala').innerHTML = d.salas.length ? d.salas.map(function(s){return '<option value="'+s.id+'">'+esc(s.escola)+' — '+esc(s.nome)+' ('+s.ocupacao+'/'+s.capacidade+')</option>';}).join('') : '<option value="">Cadastre salas na aba Locação</option>';
  }
  function alParams(){ return 'cargo='+encodeURIComponent($('al_cargo').value)+'&pagamento='+$('al_pag').value+'&pcd='+$('al_pcd').value+'&aloc='+$('al_aloc').value+'&busca='+encodeURIComponent($('al_busca').value); }
  async function alBuscar(){
    var id=$('al_concurso').value; if(!id)return;
    var d=await (await fetch('/admin/concurso/'+id+'/candidatos.json?'+alParams())).json();
    AL_CANDS=d.candidatos; $('al_todos').checked=false;
    $('al_resumo').innerHTML='<b>'+d.candidatos.length+'</b> candidato(s) listado(s) com os filtros atuais.';
    $('al_linhas').innerHTML = d.candidatos.length ? d.candidatos.map(function(k){
      var sala = k.sala_id ? (esc(k.escola_nome||'')+' / '+esc(k.sala_nome||'')) : '<span style="color:#aaa">—</span>';
      return '<tr><td><input type="checkbox" class="alchk" value="'+k.id+'"></td><td>'+esc(k.nome)+'</td><td>'+esc(k.cpf)+'</td><td>'+esc(k.cargo)+'</td><td>'+sala+'</td></tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:#888;padding:16px">Nenhum candidato com esses filtros.</td></tr>';
  }
  function alMarcarTodos(){ var on=$('al_todos').checked; document.querySelectorAll('.alchk').forEach(function(c){c.checked=on;}); }
  function alSelecionados(){ return Array.from(document.querySelectorAll('.alchk:checked')).map(function(c){return parseInt(c.value);}); }
  async function alocar(){
    var sala=$('al_sala').value; if(!sala){alert('Selecione a sala destino.');return;}
    var ids=alSelecionados(); if(!ids.length){alert('Selecione ao menos um candidato (marque as caixas).');return;}
    var r=await fetch('/admin/alocar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sala_id:sala,candidato_ids:ids})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro ao alocar');return;}
    await alCarregarSalas(); alBuscar();
  }
  async function desalocar(){
    var ids=alSelecionados(); if(!ids.length){alert('Selecione ao menos um candidato.');return;}
    if(!confirm('Remover a alocação dos '+ids.length+' candidato(s) selecionado(s)?'))return;
    var r=await fetch('/admin/desalocar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidato_ids:ids})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    await alCarregarSalas(); alBuscar();
  }

  var QALTS=[], QCORRETA=0, QTEMIMG=false, QUESTOES=[];
  function novaQuestao(){
    $('q_id').value=''; $('q_enunciado').value=''; $('q_disciplina').value=''; $('q_nivel').value=''; $('q_cargo').value='';
    QALTS=['','','','']; QCORRETA=0; renderAlts(); if($('q_img_file'))$('q_img_file').value='';
    QTEMIMG=false; $('q_img_atual').innerHTML='<i>Salve a questão primeiro para anexar imagem.</i>';
  }
  function renderAlts(){
    $('q_alts').innerHTML = QALTS.map(function(a,i){
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">'
        +'<input type="radio" name="qcorreta" '+(QCORRETA===i?'checked':'')+' onclick="QCORRETA='+i+'" style="width:auto" title="Correta">'
        +'<input value="'+esc(a).replace(/"/g,"&quot;")+'" oninput="QALTS['+i+']=this.value" placeholder="Alternativa '+String.fromCharCode(65+i)+'" style="flex:1">'
        +'<button class="del" type="button" onclick="removeAlt('+i+')">×</button></div>';
    }).join('');
  }
  function addAlt(){ if(QALTS.length>=6){alert('Máximo 6 alternativas.');return;} QALTS.push(''); renderAlts(); }
  function removeAlt(i){ if(QALTS.length<=2){alert('Mínimo 2 alternativas.');return;} QALTS.splice(i,1); if(QCORRETA>=QALTS.length)QCORRETA=0; renderAlts(); }
  async function salvarQuestao(){
    var alts=QALTS.map(function(a){return (a||'').trim();}).filter(function(a){return a!=='';});
    if(!$('q_enunciado').value.trim()){alert('Informe o enunciado.');return;}
    if(alts.length<2){alert('Informe pelo menos 2 alternativas.');return;}
    var body={id:$('q_id').value||undefined, enunciado:$('q_enunciado').value, alternativas:QALTS, correta:QCORRETA, disciplina:$('q_disciplina').value, nivel:$('q_nivel').value, cargo:$('q_cargo').value, empresa_id:EMPRESA_ID};
    var r=await fetch('/admin/questao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    $('q_id').value=j.id; if(!QTEMIMG) $('q_img_atual').innerHTML='<i>Nenhuma imagem. Você já pode anexar.</i>';
    carregarQuestoes(); alert('Questão salva!');
  }
  function editarQuestao(id){
    var q=QUESTOES.find(function(x){return x.id===id;}); if(!q)return;
    $('q_id').value=q.id; $('q_enunciado').value=q.enunciado||''; $('q_disciplina').value=q.disciplina||''; $('q_nivel').value=q.nivel||''; $('q_cargo').value=q.cargo||'';
    QALTS=(q.alternativas&&q.alternativas.length)?q.alternativas.slice():['','']; QCORRETA=q.correta||0; renderAlts();
    QTEMIMG=q.tem_imagem; if($('q_img_file'))$('q_img_file').value='';
    $('q_img_atual').innerHTML = q.tem_imagem ? ('Imagem atual: <img src="/admin/questao/'+q.id+'/imagem?t='+Date.now()+'" style="height:60px;vertical-align:middle;border-radius:4px"> <button class="del" type="button" onclick="removerImgQuestao()">remover</button>') : '<i>Nenhuma imagem anexada.</i>';
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function delQuestao(id){ if(!confirm('Excluir esta questão?'))return; var r=await fetch('/admin/questao/'+id,{method:'DELETE'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarQuestoes(); }
  async function enviarImgQuestao(){
    var id=$('q_id').value; if(!id){alert('Salve a questão primeiro; depois anexe a imagem.');return;}
    var f=$('q_img_file').files[0]; if(!f){alert('Escolha uma imagem.');return;}
    if(f.size>3*1024*1024){alert('Máximo 3 MB.');return;}
    var b64=await toB64(f);
    var r=await fetch('/admin/questao/'+id+'/imagem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataBase64:b64})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    QTEMIMG=true; $('q_img_atual').innerHTML='Imagem anexada ✓ <img src="/admin/questao/'+id+'/imagem?t='+Date.now()+'" style="height:60px;vertical-align:middle;border-radius:4px"> <button class="del" type="button" onclick="removerImgQuestao()">remover</button>'; carregarQuestoes();
  }
  async function removerImgQuestao(){ var id=$('q_id').value; if(!id)return; if(!confirm('Remover a imagem?'))return; var r=await fetch('/admin/questao/'+id+'/imagem/remover',{method:'POST'}); await r.json(); QTEMIMG=false; $('q_img_atual').innerHTML='<i>Nenhuma imagem anexada.</i>'; carregarQuestoes(); }
  async function carregarQuestoes(){
    var p='empresa='+EMPRESA_ID+'&disciplina='+encodeURIComponent($('qf_disciplina').value)+'&nivel='+encodeURIComponent($('qf_nivel').value)+'&cargo='+encodeURIComponent($('qf_cargo').value)+'&busca='+encodeURIComponent($('qf_busca').value);
    var d=await (await fetch('/admin/questoes.json?'+p)).json();
    QUESTOES=d.questoes; $('q_total').innerHTML='<b>'+d.questoes.length+'</b> questão(ões) no banco (com os filtros atuais).';
    $('q_lista').innerHTML = d.questoes.length ? d.questoes.map(function(q){
      var alts=(q.alternativas||[]).map(function(a,i){return '<div style="font-size:.85rem'+(i===q.correta?';color:#0f6b41;font-weight:700':'')+'">'+String.fromCharCode(65+i)+') '+esc(a)+(i===q.correta?' ✓':'')+'</div>';}).join('');
      var tags=[q.concurso_titulo,q.disciplina,q.nivel].concat(q.cargos||[]).filter(Boolean).map(function(t){return '<span class="tag on">'+esc(t)+'</span>';}).join(' ') + (q.autor?(' <span class="hint">por '+esc(q.autor)+'</span>'):'');
      return '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:10px"><div style="flex:1;display:flex;gap:10px"><input type="checkbox" class="qsel" value="'+q.id+'" onchange="contarSel()" style="width:auto;margin-top:3px"><div><div style="font-weight:600">'+esc(q.enunciado)+(q.tem_imagem?' 🖼️':'')+'</div><div style="margin:4px 0">'+tags+'</div>'+alts+'</div></div><div class="row-actions"><button class="mini" onclick="editarQuestao('+q.id+')">Editar</button><button class="del" onclick="delQuestao('+q.id+')">Excluir</button></div></div></div>';
    }).join('') : '<p class="hint">Nenhuma questão cadastrada ainda.</p>';
    contarSel();
  }
  function contarSel(){ var n=document.querySelectorAll('.qsel:checked').length; if($('prova_sel')) $('prova_sel').innerHTML='<b>'+n+'</b> questão(ões) selecionada(s).'; }
  function popularProvaConcursos(){ if($('prova_concurso') && !$('prova_concurso').options.length) $('prova_concurso').innerHTML='<option value="">Selecione o concurso...</option>'+CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join(''); }
  function gerarProva(){
    var ids=Array.from(document.querySelectorAll('.qsel:checked')).map(function(c){return c.value;});
    if(!ids.length){alert('Marque ao menos uma questão.');return;}
    var u='/admin/prova.html?concurso='+encodeURIComponent($('prova_concurso').value)+'&titulo='+encodeURIComponent($('prova_titulo').value||'Prova Objetiva')+'&ids='+ids.join(',');
    window.open(u,'_blank');
  }

  var IMP_ROWS=[], IMP_HEADERS=[];
  var IMP_CAMPOS=[['nome','Nome *'],['cpf','CPF *'],['nascimento','Nascimento'],['email','E-mail'],['telefone','Telefone / WhatsApp'],['sexo','Sexo'],['cargo','Cargo'],['cidade','Cidade'],['uf','UF'],['pcd','PcD'],['nome_social','Nome social']];
  function abrirImport(id){
    var c=CONCURSOS.find(function(x){return x.id===id;});
    $('imp_cid').value=id; $('imp_titulo').textContent=c?c.titulo:'';
    $('imp_file').value=''; $('imp_map').style.display='none'; $('imp_result').style.display='none';
    IMP_ROWS=[]; IMP_HEADERS=[]; $('modal_import').style.display='flex';
  }
  function fecharImport(){ $('modal_import').style.display='none'; }
  function normHdr(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function adivinha(field, headers){
    var kw={nome:['nome completo','nome'],cpf:['cpf'],nascimento:['nasc','data nasc','nascimento'],email:['email','e-mail','mail'],telefone:['telefone','celular','whats','fone','contato'],sexo:['sexo','genero'],cargo:['cargo','vaga','funcao','função'],cidade:['cidade','municipio'],uf:['uf','estado'],pcd:['pcd','defic'],nome_social:['nome social','social']};
    var list=kw[field]||[field];
    for(var i=0;i<list.length;i++){ for(var h=0;h<headers.length;h++){ var nh=normHdr(headers[h]); if(field==='nome' && nh.indexOf('social')>=0) continue; if(nh.indexOf(normHdr(list[i]))>=0) return headers[h]; } }
    return '';
  }
  async function lerImport(){
    var f=$('imp_file').files[0]; if(!f)return;
    if(typeof XLSX==='undefined'){ alert('A biblioteca de leitura de planilhas não carregou. Verifique a internet e recarregue a página.'); return; }
    try{
      var buf=await f.arrayBuffer();
      var wb=XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true});
      var ws=wb.Sheets[wb.SheetNames[0]];
      IMP_ROWS=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      if(!IMP_ROWS.length){ alert('A planilha está vazia ou sem títulos na primeira linha.'); return; }
      IMP_HEADERS=Object.keys(IMP_ROWS[0]);
      $('imp_info').innerHTML='<b>'+IMP_ROWS.length+'</b> linha(s) encontrada(s). Colunas: '+IMP_HEADERS.map(esc).join(', ');
      $('imp_campos').innerHTML=IMP_CAMPOS.map(function(c){
        var opts='<option value="">— não importar —</option>'+IMP_HEADERS.map(function(h){return '<option value="'+esc(h).replace(/"/g,'&quot;')+'"'+(adivinha(c[0],IMP_HEADERS)===h?' selected':'')+'>'+esc(h)+'</option>';}).join('');
        return '<div><label>'+c[1]+'</label><select id="map_'+c[0]+'">'+opts+'</select></div>';
      }).join('');
      $('imp_map').style.display='block'; $('imp_result').style.display='none';
    }catch(e){ alert('Não foi possível ler a planilha: '+(e.message||e)); }
  }
  async function executarImport(){
    if(!$('map_nome').value||!$('map_cpf').value){ alert('Selecione as colunas de Nome e CPF.'); return; }
    var cands=IMP_ROWS.map(function(row){
      var o={}; IMP_CAMPOS.forEach(function(c){ var col=$('map_'+c[0]).value; o[c[0]]= col? String(row[col]==null?'':row[col]) : ''; });
      return o;
    });
    var status=$('imp_pago').checked?'pago':'inscrito';
    $('imp_result').style.display='block'; $('imp_result').style.background='#eef2f6'; $('imp_result').style.color='#333'; $('imp_result').textContent='Importando, aguarde...';
    var r=await fetch('/admin/concurso/'+$('imp_cid').value+'/importar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidatos:cands,status:status})});
    var j=await r.json();
    if(!r.ok){ $('imp_result').style.background='#fde8e8'; $('imp_result').style.color='#a12626'; $('imp_result').textContent=j.erro||'Erro na importação'; return; }
    $('imp_result').style.background='var(--verde-bg)'; $('imp_result').style.color='#0f6b41';
    $('imp_result').innerHTML='✓ Importados: <b>'+j.importados+'</b>. Ignorados (duplicados ou sem Nome/CPF válido): <b>'+j.pulados+'</b>.<br>Acessos criados (senha = data de nascimento): <b>'+(j.logins||0)+'</b>'+((j.semData||0)?(' · <b>'+j.semData+'</b> sem data de nascimento na planilha (ficaram sem acesso)'):'')+'.';
  }

  var PO_SEL={}, PO_ACESSOS=[];
  function popularProvaOnline(){
    $('po_link').textContent = location.origin + '/prova.html';
    $('po_concurso').innerHTML='<option value="">Selecione o concurso...</option>'+CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join('');
    $('po_concurso').onchange=function(){ carregarProvas(); renderCargosProva([]); carregarQuestoesProva(); };
    novaProva(); carregarQuestoesProva(); carregarProvas();
  }
  function novaProva(){ $('po_id').value=''; $('po_titulo').value=''; $('po_duracao').value='60'; $('po_maxsaidas').value='2'; $('po_inicio').value=''; $('po_entrada_fim').value=''; $('po_tolerancia').value='0'; PO_SEL={}; marcarSelProva(); atualizaSelQ(); PO_GAB=[]; $('po_numq').value='30'; $('po_numalt').value='4'; if($('po_pdf_file'))$('po_pdf_file').value=''; $('po_pdf_atual').innerHTML='<i>Nenhum PDF enviado.</i>'; PROVA_TEM_PDF=false; PO_PDF_ALVO=0; toggleOrigem(); renderCargosProva([]); marcaModoProva(); }
  function marcaModoProva(){
    var id=$('po_id').value;
    if(id){
      $('po_form_titulo').innerHTML='Editando prova <span class="tag on">#'+id+'</span> <button class="mini" type="button" onclick="novaProva()" style="margin-left:8px">Criar outra prova</button>';
    } else if(PO_PDF_ALVO && !PROVA_TEM_PDF){
      $('po_form_titulo').innerHTML='Prova <span class="tag on">#'+PO_PDF_ALVO+'</span> salva — falta enviar o PDF dela <button class="mini" type="button" onclick="novaProva()" style="margin-left:8px">Descartar e criar outra</button>';
    } else {
      $('po_form_titulo').innerHTML='Nova prova online';
    }
  }
  var PO_GAB=[], PROVA_TEM_PDF=false, PO_PDF_ALVO=0;
  function toggleOrigem(){ var t=$('po_tipo').value; $('po_bloco_banco').style.display=(t==='banco')?'block':'none'; $('po_bloco_pdf').style.display=(t==='pdf')?'block':'none'; if(t==='pdf') renderGabarito(); }
  function renderGabarito(){
    var nq=Math.max(0,Math.min(200,parseInt($('po_numq').value)||0)), na=Math.max(2,Math.min(6,parseInt($('po_numalt').value)||4));
    var base='display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1.5px solid var(--linha);border-radius:50%;font-weight:700;cursor:pointer;font-size:.85rem';
    var html='';
    for(var q=0;q<nq;q++){
      var alts='';
      for(var a=0;a<na;a++){ var s=(PO_GAB[q]===a)?';background:var(--navy);color:#fff;border-color:var(--navy)':''; alts+='<span onclick="setGab('+q+','+a+')" style="'+base+s+'">'+String.fromCharCode(65+a)+'</span>'; }
      html+='<div style="display:flex;align-items:center;gap:6px;margin:5px 0"><span style="width:30px;text-align:right;font-weight:700">'+(q+1)+'</span>'+alts+'</div>';
    }
    $('po_gabarito').innerHTML=html;
  }
  function setGab(q,a){ PO_GAB[q]=a; renderGabarito(); }
  async function enviarPdfProva(auto){
    var id=PO_PDF_ALVO||$('po_id').value; if(!id){alert('Salve a prova primeiro; depois envie o PDF.');return false;}
    var f=$('po_pdf_file').files[0]; if(!f){alert('Escolha um arquivo PDF.');return false;}
    if(f.type!=='application/pdf'){alert('Envie um arquivo PDF.');return false;}
    if(f.size>30*1024*1024){alert('PDF muito grande (máx. 30 MB).');return false;}
    var b64=await toB64(f);
    var r=await fetch('/admin/prova/'+id+'/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataBase64:b64})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return false;}
    PROVA_TEM_PDF=true;
    $('po_pdf_atual').innerHTML='PDF enviado ✓';
    // Enviado o PDF, a prova está completa: limpamos o formulário para que a
    // próxima prova NÃO seja salva por cima desta. (auto = veio do salvarProva,
    // que já cuida do aviso e da limpeza.)
    if(!auto){
      alert('PDF enviado! Prova #'+id+' concluída.\\n\\nO formulário foi limpo para você criar a próxima prova.');
      carregarProvas(); novaProva();
    }
    return true;
  }
  async function carregarQuestoesProva(){
    // Questão agora pertence a um concurso: só listamos as do concurso desta prova.
    var cid=$('po_concurso')?$('po_concurso').value:'';
    if(!cid){ $('po_questoes').innerHTML='<p class="hint">Selecione o concurso acima para ver as questões dele.</p>'; return; }
    var d=await (await fetch('/admin/questoes.json?concurso='+encodeURIComponent(cid)+'&busca='+encodeURIComponent($('po_busca_q').value))).json();
    // Se a prova tem cargos marcados, mostra só as questões daqueles cargos
    // (questão sem cargo serve para todos, então sempre aparece).
    var cgs=cargosProvaSel();
    var qs=d.questoes;
    if(cgs.length){ qs=qs.filter(function(q){
      if(!q.cargos||!q.cargos.length) return true;
      return q.cargos.some(function(c){return cgs.indexOf(c)>=0;});
    }); }
    $('po_questoes').innerHTML = qs.length ? qs.map(function(q){
      var tags=[q.disciplina,q.nivel].concat(q.cargos||[]).filter(Boolean).join(' · ');
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--linha);font-weight:400"><input type="checkbox" class="poq" value="'+q.id+'" '+(PO_SEL[q.id]?'checked':'')+' onchange="togglePoQ('+q.id+',this.checked)" style="width:auto;margin-top:3px"><span><span style="font-weight:600">'+esc(q.enunciado)+'</span>'+(tags?' <span class="hint">('+esc(tags)+')</span>':'')+'</span></label>';
    }).join('') : '<p class="hint">Nenhuma questão para este concurso'+(cgs.length?' nos cargos marcados':'')+'. Peça ao professor para cadastrar na Área do Professor.</p>';
  }
  function togglePoQ(id,on){ if(on)PO_SEL[id]=true; else delete PO_SEL[id]; atualizaSelQ(); }
  function marcarSelProva(){ document.querySelectorAll('.poq').forEach(function(c){c.checked=!!PO_SEL[c.value];}); }
  function atualizaSelQ(){ $('po_selq').innerHTML='<b>'+Object.keys(PO_SEL).length+'</b> questão(ões) selecionada(s).'; }
  async function salvarProva(){
    if(!$('po_concurso').value){alert('Selecione o concurso.');return;}
    if(!$('po_titulo').value.trim()){alert('Informe o título.');return;}
    var tipo=$('po_tipo').value;
    var body={id:$('po_id').value||undefined, concurso_id:$('po_concurso').value, titulo:$('po_titulo').value, duracao_min:$('po_duracao').value, max_saidas:$('po_maxsaidas').value, inicio_em:$('po_inicio').value, entrada_fim:$('po_entrada_fim').value, tolerancia_min:$('po_tolerancia').value, tipo:tipo, cargos:cargosProvaSel()};
    if(tipo==='banco'){
      var ids=Object.keys(PO_SEL).map(function(x){return parseInt(x);});
      if(!ids.length){alert('Selecione ao menos uma questão.');return;}
      body.questao_ids=ids;
    } else {
      var nq=parseInt($('po_numq').value)||0;
      if(nq<1){alert('Informe o número de questões.');return;}
      var faltam=[]; for(var q=0;q<nq;q++){ if(PO_GAB[q]==null) faltam.push(q+1); }
      if(faltam.length){ if(!confirm('Faltou marcar o gabarito das questões: '+faltam.join(', ')+'. Salvar mesmo assim? (elas não pontuam)')) return; }
      body.num_questoes=nq; body.num_alternativas=$('po_numalt').value; body.gabarito=PO_GAB.slice(0,nq);
    }
    var r=await fetch('/admin/prova',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    // O id NUNCA volta para o formulário: só editarProva() preenche po_id.
    // Assim, salvar de novo sempre CRIA uma prova nova, nunca sobrescreve.
    // O envio do PDF usa PO_PDF_ALVO, que guarda o alvo separadamente.
    PO_PDF_ALVO=j.id; $('po_id').value=''; marcaModoProva();
    var mandouPdf=false;
    if(tipo==='pdf' && $('po_pdf_file') && $('po_pdf_file').files[0]){ mandouPdf=await enviarPdfProva(true); }
    carregarProvas();
    var faltaPdf = (tipo==='pdf' && !mandouPdf && !PROVA_TEM_PDF);
    if(faltaPdf){
      $('po_pdf_atual').innerHTML='<b style="color:#b45309">Prova #'+PO_PDF_ALVO+' salva, mas ainda sem PDF.</b> Escolha o arquivo e clique em "Enviar PDF".';
      marcaModoProva();
      alert('Prova #'+PO_PDF_ALVO+' salva!\\n\\nAgora escolha o arquivo PDF abaixo e clique em "Enviar PDF".');
    } else {
      alert('Prova salva!'); novaProva();
    }
  }
  async function carregarProvas(){
    if(!$('po_concurso').value){ $('po_lista').innerHTML='<p class="hint">Selecione um concurso.</p>'; return; }
    var d=await (await fetch('/admin/provas.json?concurso='+$('po_concurso').value)).json();
    $('po_lista').innerHTML = d.provas.length ? d.provas.map(function(p){
      return '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">'
        +'<div><b>'+esc(p.titulo)+'</b>'+(p.tipo==='pdf'?' <span class="tag on">PDF</span>':'')+((p.cargos&&p.cargos.length)?(' '+p.cargos.map(function(c){return '<span class="tag on">'+esc(c)+'</span>';}).join(' ')):' <span class="tag">todos os cargos</span>')+'<div class="hint">'+p.num_questoes+' questões · '+p.duracao_min+' min · máx. '+p.max_saidas+' saídas'+(p.inicio_em?' · entrada '+fmtDTcurto(p.inicio_em)+(p.entrada_fim?(' até '+fmtDTcurto(p.entrada_fim)):(p.tolerancia_min?(' (+'+p.tolerancia_min+'min)'):'')):'')+'</div></div>'
        +'<div class="row-actions"><button class="mini" onclick="editarProva('+p.id+')">Editar</button><button class="mini" onclick="gerarAcessos('+p.id+')">Gerar acessos</button><button class="mini" onclick="verAcessos('+p.id+')">Ver acessos</button><button class="mini" onclick="abrirResultados('+p.id+')">Resultados PDF</button><button class="mini" onclick="excelResultados('+p.id+')">Excel</button><button class="mini" onclick="zerarProva('+p.id+')">Zerar tentativas</button><button class="del" onclick="delProva('+p.id+')">Excluir</button></div>'
        +'</div></div>';
    }).join('') : '<p class="hint">Nenhuma prova criada para este concurso.</p>';
    PROVAS_PO=d.provas;
  }
  var PROVAS_PO=[];
  function renderCargosProva(marcados){
    var c=CONCURSOS.find(function(x){return String(x.id)===String($('po_concurso').value);});
    if(!c){ $('po_cargos').innerHTML='<p class="hint">Selecione o concurso.</p>'; return; }
    var lista=c.cargos||[];
    if(!lista.length){ $('po_cargos').innerHTML='<p class="hint">Este concurso não tem cargos cadastrados.</p>'; return; }
    var sel=marcados||[];
    $('po_cargos').innerHTML=lista.map(function(cg){
      var on=sel.indexOf(cg)>=0?'checked':'';
      return '<label style="display:flex;align-items:center;gap:8px;font-weight:400;padding:4px 0"><input type="checkbox" class="pocg" value="'+esc(cg).replace(/"/g,'&quot;')+'" '+on+' onchange="carregarQuestoesProva()" style="width:auto"> '+esc(cg)+'</label>';
    }).join('')+'<p class="hint" style="margin-top:6px">Nenhum marcado = todos os cargos fazem esta prova.</p>';
  }
  function cargosProvaSel(){ return Array.from(document.querySelectorAll('.pocg:checked')).map(function(c){return c.value;}); }
  function editarProva(id){
    var p=PROVAS_PO.find(function(x){return x.id===id;}); if(!p)return;
    $('po_id').value=p.id; $('po_titulo').value=p.titulo; $('po_duracao').value=p.duracao_min; $('po_maxsaidas').value=p.max_saidas;
    $('po_inicio').value=p.inicio_em||''; $('po_entrada_fim').value=p.entrada_fim||''; $('po_tolerancia').value=p.tolerancia_min||0;
    PO_SEL={}; (p.questao_ids||[]).forEach(function(qid){PO_SEL[qid]=true;}); marcarSelProva(); atualizaSelQ();
    $('po_tipo').value=p.tipo||'banco';
    PO_PDF_ALVO=p.id;
    renderCargosProva(p.cargos||[]); marcaModoProva();
    PO_GAB=(p.gabarito||[]).slice(); $('po_numq').value=p.num_questoes||30; $('po_numalt').value=p.num_alternativas||4;
    PROVA_TEM_PDF=!!p.tem_pdf;
    $('po_pdf_atual').innerHTML=p.tem_pdf?'PDF enviado ✓ (envie outro para substituir)':'<i>Nenhum PDF enviado.</i>';
    if($('po_pdf_file'))$('po_pdf_file').value='';
    toggleOrigem();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function delProva(id){ if(!confirm('Excluir esta prova e todos os acessos/respostas dela?'))return; var r=await fetch('/admin/prova/'+id,{method:'DELETE'}); await r.json(); carregarProvas(); }
  function abrirResultados(id){ window.open('/admin/prova/'+id+'/resultados.html','_blank'); }
  async function zerarProva(id){
    if(!confirm('ZERAR todas as tentativas desta prova? Todos os candidatos voltam para "não iniciado" e perdem respostas/notas já registradas. Use para testar ou reabrir a prova.'))return;
    var r=await fetch('/admin/prova/'+id+'/zerar',{method:'POST'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    alert('Tentativas zeradas: '+j.zerados+'. A prova está pronta para ser feita novamente.');
  }
  async function excelResultados(id){
    if(typeof XLSX==='undefined'){ alert('A biblioteca de planilhas não carregou. Recarregue a página.'); return; }
    var d=await (await fetch('/admin/prova/'+id+'/resultados.json')).json();
    if(!d.questoes){ alert('Não foi possível carregar os resultados.'); return; }
    var disciplinas=[]; d.questoes.forEach(function(q){ if(disciplinas.indexOf(q.disciplina)<0) disciplinas.push(q.disciplina); });
    var rotulo={nao_iniciado:'Não iniciou',em_andamento:'Em andamento',finalizado:'Finalizado',eliminado:'Eliminado'};
    var linhas=d.candidatos.map(function(c){
      var row={'Nome':c.nome,'CPF':c.cpf,'Cargo':c.cargo||'','Situação':rotulo[c.status]||c.status,'Saídas':c.saidas||0,'Eliminado (saiu 2x+)':(c.status==='eliminado'?'SIM':''),'Saiu 1 vez':(c.status!=='eliminado'&&c.saidas===1?'SIM':'')};
      var accD={}; disciplinas.forEach(function(x){accD[x]=0;}); var total=0;
      d.questoes.forEach(function(q){ if(c.respostas[q.id]!=null && String(c.respostas[q.id])===String(q.correta)){ accD[q.disciplina]++; total++; } });
      disciplinas.forEach(function(x){ row['Acertos: '+x]=accD[x]; });
      row['Nota total (acertos)']=total;
      d.questoes.forEach(function(q,i){ var a=c.respostas[q.id]; row['Q'+(i+1)]=(a==null||a==='')?'':String.fromCharCode(65+Number(a)); });
      return row;
    });
    if(!linhas.length){ alert('Nenhum acesso gerado ainda para esta prova.'); return; }
    var ws=XLSX.utils.json_to_sheet(linhas);
    var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Resultados');
    XLSX.writeFile(wb, 'resultados_'+String(d.titulo||'prova').replace(/[^a-z0-9]/gi,'_').slice(0,40)+'.xlsx');
  }
  function fmtDTcurto(s){ var m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m?(m[3]+'/'+m[2]+' '+m[4]+':'+m[5]):s; }
  async function gerarAcessos(id){
    var p=PROVAS_PO.find(function(x){return x.id===id;});
    var cg=(p&&p.cargos&&p.cargos.length)?p.cargos.join(', '):null;
    if(!confirm('Liberar esta prova para '+(cg?('os candidatos dos cargos: '+cg):'TODOS os candidatos do concurso')+'?'))return;
    var r=await fetch('/admin/prova/'+id+'/acessos',{method:'POST'}); var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    if(j.diagnostico){
      var d=j.diagnostico;
      alert('NENHUM candidato foi encontrado com os cargos desta prova.\\n\\n'
        +'Cargos marcados na prova:\\n  • '+d.cargos_da_prova.join('\\n  • ')
        +'\\n\\nCargos que existem nos candidatos importados:\\n  • '
        +d.cargos_dos_candidatos.map(function(x){return x.cargo+'  ('+x.qtd+' candidato(s))';}).join('\\n  • ')
        +'\\n\\nOs nomes precisam ser o mesmo cargo. Corrija a lista de cargos do concurso (aba Concursos > Editar) para bater com a planilha.');
      return;
    }
    alert('Prova liberada para '+j.criados+' novo(s) candidato(s), de '+j.total+' no total.'+(j.criados<j.total?'\\n(Quem já estava liberado foi mantido.)':''));
  }
  async function verAcessos(id){
    var p=PROVAS_PO.find(function(x){return x.id===id;});
    var d=await (await fetch('/admin/prova/'+id+'/acessos.json')).json();
    PO_ACESSOS=d.acessos; $('ac_titulo').textContent=p?p.titulo:'';
    $('ac_lista').innerHTML='<table><thead><tr><th>Nome</th><th>CPF</th><th>Nascimento (senha)</th><th>Status</th><th>Nota</th></tr></thead><tbody>'
      +(d.acessos.length?d.acessos.map(function(a){return '<tr><td>'+esc(a.nome)+'</td><td>'+esc(a.cpf)+'</td><td><b>'+esc(a.nascimento||'— sem data!')+'</b></td><td>'+esc(a.status||'')+'</td><td>'+(a.nota!=null?a.nota:'')+'</td></tr>';}).join(''):'<tr><td colspan="5">Nenhum candidato liberado ainda. Clique em "Gerar acessos".</td></tr>')
      +'</tbody></table>';
    $('modal_acessos').style.display='flex';
  }
  function copiarAcessos(){
    var linhas=PO_ACESSOS.map(function(a){return a.nome+'\\tCPF: '+a.cpf+'\\tNascimento: '+(a.nascimento||'SEM DATA');}).join('\\n');
    var txt='Acesso à Prova Online — '+location.origin+'/prova.html\\n(entrar com CPF e data de nascimento)\\n\\n'+linhas;
    navigator.clipboard.writeText(txt).then(function(){alert('Lista copiada!');},function(){alert('Não foi possível copiar.');});
  }

  async function limparCandidatos(id){
    var c=CONCURSOS.find(function(x){return x.id===id;}); var nome=c?c.titulo:'';
    if(!confirm('EXCLUIR TODOS OS CANDIDATOS do concurso "'+nome+'"?\\n\\nApaga inscritos, títulos enviados, recursos e respostas de prova deles.\\nO concurso, as provas e as questões permanecem.\\n\\nNão dá para desfazer.'))return;
    var t=prompt('Para confirmar, digite EXCLUIR (em maiúsculas):');
    if(t!=='EXCLUIR'){ if(t!==null) alert('Cancelado: o texto não confere.'); return; }
    var r=await fetch('/admin/concurso/'+id+'/limpar-candidatos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmar:'EXCLUIR'})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    alert(j.excluidos+' candidato(s) excluído(s). '+j.logins+' login(s) removido(s).');
    carregarConcursos(); if(typeof carregarInscritos==='function') carregarInscritos();
  }
  async function excluirConcurso(id){
    var c=CONCURSOS.find(function(x){return x.id===id;}); var nome=c?c.titulo:'';
    if(!confirm('EXCLUIR o concurso "'+nome+'"?\\n\\nIsso apaga PERMANENTEMENTE todos os inscritos, escolas/salas, etapas, documentos, brasão, edital e provas online ligados a ele. Não dá para desfazer.'))return;
    if(!confirm('Tem certeza absoluta? Esta ação é irreversível.'))return;
    var r=await fetch('/admin/concurso/'+id,{method:'DELETE'}); var j=await r.json();
    if(!r.ok){alert(j.erro||'Erro ao excluir.');return;}
    alert('Concurso excluído.'); carregarConcursos();
  }
  var REC_SUGEST=['Recurso — Lista de Inscritos','Recurso — Locais de Prova','Recurso — Gabarito','Recurso — Resultado Preliminar','Recurso — Resultado Final'];
  function popularRecursos(){
    $('rec_concurso').innerHTML='<option value="">Selecione o concurso...</option>'+CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join('');
    $('rec_sugestoes').innerHTML=REC_SUGEST.map(function(n,i){return '<a href="#" onclick="usarSugestao('+i+');return false" style="color:var(--azul);margin-right:10px">'+esc(n)+'</a>';}).join('');
    limparFase(); $('rec_fases_lista').innerHTML=''; $('rec_lista').innerHTML='<p class="hint">Selecione um concurso.</p>';
  }
  function usarSugestao(i){ $('rf_nome').value=REC_SUGEST[i]; }
  function limparFase(){ $('rf_id').value=''; $('rf_nome').value=''; $('rf_abertura').value=''; $('rf_fechamento').value=''; }
  async function carregarFases(){
    if(!$('rec_concurso').value){ $('rec_fases_lista').innerHTML=''; return; }
    var d=await (await fetch('/admin/recurso-fases.json?concurso='+$('rec_concurso').value)).json();
    var rot={antes:'⏳ Não aberta',aberto:'🟢 Aberta',depois:'🔒 Encerrada',indefinido:'⚠️ Sem prazo definido'};
    $('rec_f_fase').innerHTML='<option value="">Todas as fases</option>'+d.fases.map(function(f){return '<option value="'+f.id+'">'+esc(f.nome)+'</option>';}).join('');
    $('rec_fases_lista').innerHTML = d.fases.length ? d.fases.map(function(f){
      return '<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><b>'+esc(f.nome)+'</b> <span class="tag on">'+rot[f.status]+'</span><div class="hint">'+(f.abertura?fmtDTcurto(f.abertura):'—')+' até '+(f.fechamento?fmtDTcurto(f.fechamento):'—')+'</div></div><div class="row-actions"><button class="mini" onclick="editarFase('+f.id+')">Editar</button><button class="del" onclick="delFase('+f.id+')">Excluir</button></div></div></div>';
    }).join('') : '<p class="hint">Nenhuma fase criada. Adicione acima (pode usar as sugestões).</p>';
    REC_FASES=d.fases;
  }
  var REC_FASES=[];
  function editarFase(id){ var f=REC_FASES.find(function(x){return x.id===id;}); if(!f)return; $('rf_id').value=f.id; $('rf_nome').value=f.nome; $('rf_abertura').value=f.abertura||''; $('rf_fechamento').value=f.fechamento||''; window.scrollTo({top:0,behavior:'smooth'}); }
  async function salvarFase(){
    if(!$('rec_concurso').value){alert('Selecione o concurso.');return;}
    if(!$('rf_nome').value.trim()){alert('Informe o nome da fase.');return;}
    var body={id:$('rf_id').value||undefined, concurso_id:$('rec_concurso').value, nome:$('rf_nome').value, abertura:$('rf_abertura').value, fechamento:$('rf_fechamento').value};
    var r=await fetch('/admin/recurso-fase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    limparFase(); carregarFases();
  }
  async function delFase(id){ if(!confirm('Excluir esta fase e TODOS os recursos interpostos nela?'))return; var r=await fetch('/admin/recurso-fase/'+id,{method:'DELETE'}); await r.json(); carregarFases(); carregarRecursos(); }
  async function carregarRecursos(){
    if(!$('rec_concurso').value){ $('rec_lista').innerHTML='<p class="hint">Selecione um concurso.</p>'; return; }
    var p='concurso='+$('rec_concurso').value+'&fase='+encodeURIComponent($('rec_f_fase').value)+'&status='+encodeURIComponent($('rec_f_status').value);
    var d=await (await fetch('/admin/recursos.json?'+p)).json();
    var rot={pendente:'⏳ Pendente',deferido:'✅ Deferido',indeferido:'❌ Indeferido'};
    $('rec_lista').innerHTML = d.recursos.length ? d.recursos.map(function(r){
      var anexo=r.tem_anexo?' · <a href="/admin/recurso/'+r.id+'/anexo" target="_blank" style="color:var(--azul)">📎 anexo</a>':'';
      return '<div class="card" style="margin-bottom:10px">'
        +'<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>'+esc(r.candidato)+'</b> <span class="hint">('+esc(r.protocolo||'')+')</span><div class="hint">'+esc(r.fase_nome||'—')+anexo+'</div></div><span class="tag on">'+rot[r.status]+'</span></div>'
        +'<div style="margin:8px 0;white-space:pre-wrap;background:var(--papel,#f4f7f9);padding:10px;border-radius:8px">'+esc(r.texto)+'</div>'
        +'<div class="grid2"><div><label>Resposta da banca</label><textarea id="resp_'+r.id+'" rows="2">'+esc(r.resposta||'')+'</textarea></div></div>'
        +'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="mini" onclick="recDeferir('+r.id+')">Deferir</button><button class="mini" onclick="recIndeferir('+r.id+')">Indeferir</button><button class="sec" onclick="recPendente('+r.id+')">Salvar como pendente</button></div>'
        +'</div>';
    }).join('') : '<p class="hint">Nenhum recurso interposto (com os filtros atuais).</p>';
  }
  function recDeferir(id){ responderRec(id,'deferido'); }
  function recIndeferir(id){ responderRec(id,'indeferido'); }
  function recPendente(id){ responderRec(id,'pendente'); }
  async function responderRec(id,status){
    var resposta=$('resp_'+id)?$('resp_'+id).value:'';
    if((status==='deferido'||status==='indeferido') && !resposta.trim()){ if(!confirm('Responder sem justificativa? Recomendo escrever a resposta ao candidato.')) return; }
    var r=await fetch('/admin/recurso/'+id+'/responder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status,resposta:resposta})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    carregarRecursos();
  }

  function togglePg(){ $('pg_bloco_bb').style.display = $('pg_gateway').value==='bb' ? 'block' : 'none'; }
  function abrirPagamento(id){
    var c=CONCURSOS.find(function(x){return x.id===id;}); if(!c)return;
    $('pg_cid').value=id; $('pg_titulo').textContent=c.titulo;
    $('pg_gateway').value=c.pagamento_gateway||'asaas';
    $('pg_bb_ambiente').value=c.bb_ambiente||'homologacao';
    $('pg_bb_client_id').value=c.bb_client_id||'';
    $('pg_bb_client_secret').value=''; $('pg_bb_client_secret').placeholder=c.bb_secret_set?'•••••• já salvo (deixe em branco p/ manter)':'';
    $('pg_bb_app_key').value=c.bb_app_key||''; $('pg_bb_convenio').value=c.bb_convenio||'';
    $('pg_bb_carteira').value=c.bb_carteira||''; $('pg_bb_variacao').value=c.bb_variacao||'';
    $('pg_bb_agencia').value=c.bb_agencia||''; $('pg_bb_conta').value=c.bb_conta||'';
    $('pg_bb_beneficiario_nome').value=c.bb_beneficiario_nome||''; $('pg_bb_beneficiario_doc').value=c.bb_beneficiario_doc||'';
    togglePg(); $('modal_pagamento').style.display='flex';
  }
  async function salvarPagamento(){
    var body={pagamento_gateway:$('pg_gateway').value, bb_ambiente:$('pg_bb_ambiente').value, bb_client_id:$('pg_bb_client_id').value,
      bb_client_secret:$('pg_bb_client_secret').value, bb_app_key:$('pg_bb_app_key').value, bb_convenio:$('pg_bb_convenio').value,
      bb_carteira:$('pg_bb_carteira').value, bb_variacao:$('pg_bb_variacao').value, bb_agencia:$('pg_bb_agencia').value,
      bb_conta:$('pg_bb_conta').value, bb_beneficiario_nome:$('pg_bb_beneficiario_nome').value, bb_beneficiario_doc:$('pg_bb_beneficiario_doc').value};
    var r=await fetch('/admin/concurso/'+$('pg_cid').value+'/pagamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    alert('Configuração de pagamento salva!'); $('modal_pagamento').style.display='none'; carregarConcursos();
  }

  var EMPRESA_ID = 0, EMPRESAS = [];
  function popularEmpresaSel(sel){ if(!$('c_empresa'))return; $('c_empresa').innerHTML = EMPRESAS.map(function(e){return '<option value="'+e.id+'">'+esc(e.nome)+'</option>';}).join(''); if(sel) $('c_empresa').value = sel; }
  function trocarEmpresa(){
    EMPRESA_ID = parseInt($('empresa_sel').value) || 0;
    try{ localStorage.setItem('seletrix_empresa', EMPRESA_ID); }catch(e){}
    aplicarIdentidade();
    carregarConcursos();
  }
  function aplicarIdentidade(){
    var e = EMPRESAS.find(function(x){return x.id===EMPRESA_ID;});
    if(!e) return;
    $('hdr_nome').textContent = e.nome;
    $('hdr_logo').src = e.tem_logo ? ('/empresa/'+e.id+'/logo?t='+Date.now()) : '/logo.png';
    if($('hdr_site')) $('hdr_site').href = '/e/' + e.slug;
  }
  async function initEmpresas(){
    var d = await (await fetch('/admin/empresas.json')).json();
    EMPRESAS = d.empresas;
    var salvo = 0; try{ salvo = parseInt(localStorage.getItem('seletrix_empresa')) || 0; }catch(e){}
    if(!EMPRESAS.some(function(x){return x.id===salvo;})) salvo = EMPRESAS.length ? EMPRESAS[0].id : 0;
    $('empresa_sel').innerHTML = EMPRESAS.map(function(e){return '<option value="'+e.id+'">'+esc(e.nome)+'</option>';}).join('');
    $('empresa_sel').value = salvo; EMPRESA_ID = salvo;
    aplicarIdentidade();
    carregarConcursos();
  }
  function novaEmpresa(){ $('em_id').value=''; $('em_nome').value=''; $('em_subtitulo').value=''; $('em_dominio').value=''; if($('em_logo_file'))$('em_logo_file').value=''; $('em_logo_atual').innerHTML='<i>Salve a empresa primeiro para enviar a logo.</i>'; }
  async function carregarEmpresas(){
    var d = await (await fetch('/admin/empresas.json')).json();
    EMPRESAS = d.empresas;
    $('em_lista').innerHTML = d.empresas.map(function(e){
      var logo = e.tem_logo ? ('<img src="/empresa/'+e.id+'/logo?t='+Date.now()+'" style="height:34px;vertical-align:middle;margin-right:8px">') : '';
      return '<div class="conc"><div>'+logo+'<b>'+esc(e.nome)+'</b><div class="meta">'+esc(e.subtitulo||'')+' &middot; '+e.concursos+' concurso(s) &middot; site: <a href="/e/'+esc(e.slug)+'" target="_blank">/e/'+esc(e.slug)+'</a>'+(e.dominio?(' &middot; 🌐 <a href="https://'+esc(e.dominio)+'" target="_blank">'+esc(e.dominio)+'</a>'):'')+'</div></div>'
        +'<div class="row-actions"><button class="mini" onclick="editarEmpresa('+e.id+')">Editar</button><button class="del" onclick="delEmpresa('+e.id+')">Excluir</button></div></div>';
    }).join('') || '<p class="hint">Nenhuma empresa.</p>';
  }
  function editarEmpresa(id){
    var e = EMPRESAS.find(function(x){return x.id===id;}); if(!e)return;
    $('em_id').value=e.id; $('em_nome').value=e.nome||''; $('em_subtitulo').value=e.subtitulo||''; $('em_dominio').value=e.dominio||'';
    $('em_logo_atual').innerHTML = e.tem_logo ? ('Logo atual: <img src="/empresa/'+e.id+'/logo?t='+Date.now()+'" style="height:40px;vertical-align:middle">') : '<i>Nenhuma logo enviada.</i>';
    if($('em_logo_file'))$('em_logo_file').value='';
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function salvarEmpresa(){
    if(!$('em_nome').value.trim()){alert('Informe o nome da empresa.');return;}
    var body={id:$('em_id').value||undefined, nome:$('em_nome').value, subtitulo:$('em_subtitulo').value, dominio:$('em_dominio').value};
    var r=await fetch('/admin/empresa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    $('em_id').value=j.id;
    if($('em_logo_file') && $('em_logo_file').files[0]) await enviarLogoEmpresa();
    alert('Empresa salva!'); carregarEmpresas(); initEmpresas();
  }
  async function enviarLogoEmpresa(){
    var id=$('em_id').value; if(!id){alert('Salve a empresa primeiro.');return;}
    var f=$('em_logo_file').files[0]; if(!f){alert('Escolha uma imagem.');return;}
    if(f.size>2*1024*1024){alert('Máximo 2 MB.');return;}
    var b64=await toB64(f);
    var r=await fetch('/admin/empresa/'+id+'/logo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataBase64:b64})});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    $('em_logo_atual').innerHTML='Logo enviada ✓ <img src="/empresa/'+id+'/logo?t='+Date.now()+'" style="height:40px;vertical-align:middle">';
    carregarEmpresas(); initEmpresas();
  }
  async function delEmpresa(id){
    if(!confirm('Excluir esta empresa?'))return;
    var r=await fetch('/admin/empresa/'+id,{method:'DELETE'}); var j=await r.json();
    if(!r.ok){alert(j.erro||'Erro');return;}
    carregarEmpresas(); initEmpresas();
  }

  async function gerarLogins(id){
    if(!confirm('Criar acesso à Área do Candidato para os candidatos deste concurso que ainda não têm?\\n\\nA senha será a DATA DE NASCIMENTO de cada um (ex.: 05011990). Quem já tem acesso não é alterado.'))return;
    var r=await fetch('/admin/concurso/'+id+'/gerar-logins',{method:'POST'});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    alert('Acessos criados: '+j.criados+' de '+j.semAcesso+' sem acesso.'+(j.semData?('\\n\\n'+j.semData+' candidato(s) sem data de nascimento cadastrada ficaram sem acesso.'):''));
  }
  var PROFESSORES=[];
  function novoProfessor(){ $('pf_id').value=''; $('pf_nome').value=''; $('pf_email').value=''; $('pf_disciplina').value=''; $('pf_senha').value=''; $('pf_senha').placeholder='mín. 6 caracteres'; $('pf_ativo').checked=true; }
  async function carregarProfessores(){
    if($('pf_link')) $('pf_link').textContent = location.origin + '/professor.html';
    var d=await (await fetch('/admin/professores.json?empresa='+EMPRESA_ID)).json();
    PROFESSORES=d.professores;
    $('pf_lista').innerHTML = d.professores.length ? d.professores.map(function(p){
      return '<div class="conc"><div><b>'+esc(p.nome)+'</b>'+(p.ativo?'':' <span class="tag">inativo</span>')+'<div class="meta">'+esc(p.email)+(p.disciplina?(' &middot; '+esc(p.disciplina)):'')+' &middot; '+p.questoes+' questão(ões)</div></div>'
        +'<div class="row-actions"><button class="mini" onclick="editarProfessor('+p.id+')">Editar</button><button class="del" onclick="delProfessor('+p.id+')">Excluir</button></div></div>';
    }).join('') : '<p class="hint">Nenhum professor cadastrado nesta empresa.</p>';
  }
  function editarProfessor(id){
    var p=PROFESSORES.find(function(x){return x.id===id;}); if(!p)return;
    $('pf_id').value=p.id; $('pf_nome').value=p.nome||''; $('pf_email').value=p.email||''; $('pf_disciplina').value=p.disciplina||'';
    $('pf_senha').value=''; $('pf_senha').placeholder='deixe em branco p/ manter a senha atual'; $('pf_ativo').checked=!!p.ativo;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function salvarProfessor(){
    var body={id:$('pf_id').value||undefined, nome:$('pf_nome').value, email:$('pf_email').value, disciplina:$('pf_disciplina').value, senha:$('pf_senha').value, ativo:$('pf_ativo').checked, empresa_id:EMPRESA_ID};
    var r=await fetch('/admin/professor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;}
    alert('Professor salvo!'); novoProfessor(); carregarProfessores();
  }
  async function delProfessor(id){
    if(!confirm('Excluir este professor? As questões dele permanecem no banco.'))return;
    var r=await fetch('/admin/professor/'+id,{method:'DELETE'}); var j=await r.json();
    if(!r.ok){alert(j.erro||'Erro');return;}
    carregarProfessores();
  }

  initEmpresas();
</script></body></html>`;
