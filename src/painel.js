// Painel administrativo do Seletrix (HTML servido em /admin)
module.exports = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Seletrix · Painel</title>
<style>
 :root{--tinta:#0f3a4f;--verde:#1b8a5a;--linha:#dde6ea;--suave:#5e7280;--papel:#f5f7f8;--ambar:#e8a23d}
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
 input,select{width:100%;padding:10px 12px;border:1.5px solid var(--linha);border-radius:8px;font-size:.95rem;background:#fff}
 input:focus,select:focus{outline:none;border-color:#2e6f8e}
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
 .scroll{overflow:auto;max-height:62vh;border-radius:10px;border:1px solid var(--linha)}
 .cargo-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--linha)}
 .cargo-item span{flex:1}
 .ok{display:none;background:#e7f6ee;color:#0f6b41;border:1px solid #bfe6d1;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:.9rem}
 .hint{font-size:.8rem;color:var(--suave);margin-top:4px}
 .conc{border:1px solid var(--linha);border-radius:12px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
 .conc h3{font-size:1.05rem;margin-bottom:3px}
 .conc .meta{color:var(--suave);font-size:.85rem}
 .tag{padding:3px 10px;border-radius:999px;font-size:.75rem;font-weight:700}
 .tag.on{background:#e7f6ee;color:#0f6b41}.tag.off{background:#eef1f4;color:#607}
 .tag.pago{background:#e7f6ee;color:#0f6b41}.tag.aguard{background:#fff4e0;color:#8a5a00}.tag.insc{background:#eef1f4;color:#456}
 .row-actions{display:flex;gap:8px;align-items:center}
 .checkline{display:flex;align-items:center;gap:9px;margin-top:14px}
 .checkline input{width:auto}
</style></head><body>
<header><h1>Seletrix — Painel de gestão</h1><a class="btn" href="/" target="_blank">Ver site público ↗</a></header>
<div class="tabs">
  <div class="tab on" data-t="concursos">Concursos</div>
  <div class="tab" data-t="inscritos">Inscritos</div>
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
      <div class="checkline"><input type="checkbox" id="c_aberto"><label for="c_aberto" style="margin:0">Inscrições abertas (aparece no site público)</label></div>
      <div style="margin-top:16px">
        <label>Cargos</label>
        <div id="lista_cargos"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="novo_cargo" placeholder="Ex.: Analista Administrativo" onkeydown="if(event.key==='Enter'){event.preventDefault();addCargo()}">
          <button class="sec" onclick="addCargo()">Adicionar</button>
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
        <thead><tr><th>Protocolo</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Status</th><th>Pagamento</th><th>Data</th></tr></thead>
        <tbody id="linhas_insc"></tbody></table></div>
    </div>
  </section>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  let CONCURSOS = [], cargosEdit = [];
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
    ['concursos','inscritos'].forEach(s => $(s).style.display = s === t.dataset.t ? 'block' : 'none');
    if (t.dataset.t === 'inscritos') carregarInscritos();
  });
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

  async function carregarConcursos(){
    const { concursos } = await (await fetch('/admin/concursos.json')).json();
    CONCURSOS = concursos;
    $('lista_concursos').innerHTML = concursos.map(c => \`
      <div class="conc">
        <div>
          <h3>\${esc(c.titulo)} \${c.aberto?'<span class="tag on">Aberto</span>':'<span class="tag off">Fechado</span>'}</h3>
          <div class="meta">\${esc(c.orgao||'')} &middot; \${c.inscritos} inscritos (\${c.pagos} pagos) &middot; taxa \${esc(c.taxa||'-')}</div>
          <div class="meta">Link: <a href="/concurso.html?c=\${esc(c.slug)}" target="_blank">/concurso.html?c=\${esc(c.slug)}</a></div>
        </div>
        <div class="row-actions"><button class="mini" onclick='editarConcurso(\${JSON.stringify(c.id)})'>Editar</button></div>
      </div>\`).join('') || '<p class="hint">Nenhum concurso ainda. Clique em "Novo concurso".</p>';
    // popular filtro de inscritos
    $('filtro_concurso').innerHTML = '<option value="">Todos os concursos</option>' + concursos.map(c=>'<option value="'+c.id+'">'+esc(c.titulo)+'</option>').join('');
  }
  function novoConcurso(){
    $('form_titulo').textContent='Novo concurso'; $('c_id').value='';
    ['c_titulo','c_orgao','c_periodo','c_prova','c_vagas','c_taxa','c_valor','c_dias','c_pdf'].forEach(id=>$(id).value='');
    $('c_dias').value='5'; $('c_aberto').checked=true; cargosEdit=[]; renderCargos();
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
    $('c_aberto').checked=!!c.aberto; cargosEdit=(c.cargos||[]).slice(); renderCargos();
    if($('c_pdf_file')) $('c_pdf_file').value='';
    $('edital_atual').innerHTML = c.pdf_url ? ('Edital atual: <a href="'+esc(c.pdf_url)+'" target="_blank">ver PDF</a> — envie outro abaixo para substituir.') : '<i>Nenhum edital enviado ainda.</i>';
    $('form_concurso').style.display='block'; $('form_concurso').scrollIntoView({behavior:'smooth'});
  }
  function fecharForm(){ $('form_concurso').style.display='none'; }
  function renderCargos(){ $('lista_cargos').innerHTML = cargosEdit.map((c,i)=>'<div class="cargo-item"><span>'+esc(c)+'</span><button class="del" onclick="removeCargo('+i+')">Remover</button></div>').join('')||'<p class="hint">Nenhum cargo.</p>'; }
  function addCargo(){ const v=$('novo_cargo').value.trim(); if(!v)return; cargosEdit.push(v); $('novo_cargo').value=''; renderCargos(); }
  function removeCargo(i){ cargosEdit.splice(i,1); renderCargos(); }
  async function salvarConcurso(){
    const payload={ id:$('c_id').value||undefined, titulo:$('c_titulo').value, orgao:$('c_orgao').value, periodo:$('c_periodo').value,
      prova:$('c_prova').value, vagas:$('c_vagas').value, taxa:$('c_taxa').value, taxa_valor:$('c_valor').value,
      dias_vencimento:$('c_dias').value, pdf_url:$('c_pdf').value, aberto:$('c_aberto').checked, cargos:cargosEdit };
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

  function statusTag(s){ if(s==='pago')return '<span class="tag pago">Pago</span>'; if(s==='aguardando_pagamento')return '<span class="tag aguard">Aguardando</span>'; return '<span class="tag insc">Inscrito</span>'; }
  async function carregarInscritos(){
    const cid=$('filtro_concurso').value;
    $('btn_csv').href = '/admin/inscritos.csv' + (cid?('?concurso='+cid):'');
    const url='/admin/inscritos.json'+(cid?('?concurso='+cid):'');
    const { inscritos } = await (await fetch(url)).json();
    const pagos = inscritos.filter(r=>r.status==='pago').length;
    $('resumo_insc').innerHTML = '<b>Total:</b> '+inscritos.length+' &nbsp; <b>Pagos:</b> '+pagos;
    $('linhas_insc').innerHTML = inscritos.map(r=>{
      const pag = r.invoice_url ? '<a href="'+esc(r.invoice_url)+'" target="_blank">abrir fatura</a>' : '<button class="mini" onclick="gerar('+r.id+')">Gerar cobrança</button>';
      return '<tr><td>'+esc(r.protocolo)+'</td><td>'+esc(r.nome)+'</td><td>'+esc(r.cpf)+'</td><td>'+esc(r.cargo)+'</td><td>'+statusTag(r.status)+'</td><td>'+pag+'</td><td>'+new Date(r.criado_em).toLocaleString('pt-BR')+'</td></tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:#888;padding:18px">Nenhum inscrito.</td></tr>';
  }
  async function gerar(id){ if(!confirm('Gerar link de pagamento para este inscrito?'))return; const r=await fetch('/admin/cobranca/'+id,{method:'POST'}); const j=await r.json(); if(!r.ok){alert(j.erro||'Erro');return;} carregarInscritos(); }

  carregarConcursos();
</script></body></html>`;
