// Painel administrativo do Seletrix (HTML servido em /admin)
module.exports = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Seletrix · Painel</title>
<link rel="icon" href="/logo.png" type="image/png">
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
  <div class="brand"><img src="/logo.png" alt="Seletrix" class="logo"><div><div class="hnome">Seletrix</div><div class="hsub">Painel de Gestão</div></div></div>
  <a class="link-topo" href="/" target="_blank">Ver site público ↗</a>
</header>
<div class="tabs">
  <div class="tab on" data-t="concursos">Concursos</div>
  <div class="tab" data-t="inscritos">Inscritos</div>
  <div class="tab" data-t="relatorios">Relatórios</div>
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
    ['concursos','inscritos','relatorios'].forEach(s => $(s).style.display = s === t.dataset.t ? 'block' : 'none');
    if (t.dataset.t === 'inscritos') carregarInscritos();
    if (t.dataset.t === 'relatorios') popularRelConcursos();
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
    const { concursos } = await (await fetch('/admin/concursos.json')).json();
    CONCURSOS = concursos;
    $('lista_concursos').innerHTML = concursos.map(c => \`
      <div class="conc">
        <div>
          <h3>\${esc(c.titulo)} \${sitTag(c)}</h3>
          <div class="meta">\${esc(c.orgao||'')} &middot; \${c.inscritos} inscritos (\${c.pagos} pagos) &middot; taxa \${esc(c.taxa||'-')}</div>
          <div class="meta">Link: <a href="/concurso.html?c=\${esc(c.slug)}" target="_blank">/concurso.html?c=\${esc(c.slug)}</a></div>
        </div>
        <div class="row-actions"><button class="mini" onclick='abrirEtapas(\${JSON.stringify(c.id)})'>Etapas / Docs</button><button class="mini" onclick='editarConcurso(\${JSON.stringify(c.id)})'>Editar</button></div>
      </div>\`).join('') || '<p class="hint">Nenhum concurso ainda. Clique em "Novo concurso".</p>';
    // popular filtro de inscritos
    $('filtro_concurso').innerHTML = '<option value="">Todos os concursos</option>' + concursos.map(c=>'<option value="'+c.id+'">'+esc(c.titulo)+'</option>').join('');
  }
  function novoConcurso(){
    $('form_titulo').textContent='Novo concurso'; $('c_id').value='';
    ['c_titulo','c_orgao','c_periodo','c_prova','c_vagas','c_taxa','c_valor','c_dias','c_pdf','c_data_inicio','c_data_fim','c_data_encerramento'].forEach(id=>$(id).value='');
    $('c_dias').value='5'; $('c_aberto').checked=true; cargosEdit=[]; renderCargos();
    $('c_gratuito').checked=false; $('c_pede_titulos').checked=false; tiposEdit=[]; renderTipos(); toggleTitulos();
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
    $('c_gratuito').checked=!!c.gratuito; $('c_pede_titulos').checked=!!c.pede_titulos; tiposEdit=(c.tipos_titulos||[]).slice(); renderTipos(); toggleTitulos();
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
  function toggleTitulos(){ $('bloco_titulos').style.display = $('c_pede_titulos').checked ? 'block' : 'none'; }
  function renderTipos(){ $('lista_tipos').innerHTML = tiposEdit.map((t,i)=>'<div class="cargo-item"><span>'+esc(t)+'</span><button class="del" onclick="removeTipo('+i+')">Remover</button></div>').join('')||'<p class="hint">Nenhum tipo cadastrado.</p>'; }
  function addTipo(){ const v=$('novo_tipo').value.trim(); if(!v)return; tiposEdit.push(v); $('novo_tipo').value=''; renderTipos(); }
  function removeTipo(i){ tiposEdit.splice(i,1); renderTipos(); }
  async function salvarConcurso(){
    const payload={ id:$('c_id').value||undefined, titulo:$('c_titulo').value, orgao:$('c_orgao').value, periodo:$('c_periodo').value,
      prova:$('c_prova').value, vagas:$('c_vagas').value, taxa:$('c_taxa').value, taxa_valor:$('c_valor').value,
      dias_vencimento:$('c_dias').value, pdf_url:$('c_pdf').value, aberto:$('c_aberto').checked,
      data_inicio:$('c_data_inicio').value, data_fim:$('c_data_fim').value, data_encerramento:$('c_data_encerramento').value,
      gratuito:$('c_gratuito').checked, pede_titulos:$('c_pede_titulos').checked, tipos_titulos:tiposEdit, cargos:cargosEdit,
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
    $('rel_concurso').innerHTML = '<option value="">Selecione o concurso...</option>' + CONCURSOS.map(function(c){return '<option value="'+c.id+'">'+esc(c.titulo)+'</option>';}).join('');
    $('rel_cargo').innerHTML = '<option value="">Todos os cargos</option>';
    $('rel_total').textContent = '';
  }
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

  carregarConcursos();
</script></body></html>`;
