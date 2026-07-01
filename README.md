# Seletrix — Sistema de Inscrições (Fatia 1)

Página pública com o edital + formulário de inscrição, banco de dados PostgreSQL
e painel `/admin` (protegido por senha) com exportação dos inscritos em Excel (CSV).

## O que editar
- **Edital** (órgão, datas, taxa, link do PDF): bloco `EDITE AQUI` em `public/index.html`.
- **Cargos**: lista `CARGOS` no `<script>` ao final de `public/index.html`.

## Como publicar no Render
1. Suba estes arquivos no repositório `seletrix-backend` (GitHub).
2. No Render, no serviço `seletrix-backend` → **Settings**:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Crie um banco grátis: Render → **New** → **PostgreSQL** (plano Free). Copie a **Internal Database URL**.
4. No serviço → **Environment** → adicione:
   - `DATABASE_URL` = (a URL copiada do Postgres)
   - `ADMIN_PASSWORD` = (uma senha sua para acessar o painel)
5. Salve. O Render publica automaticamente. A tabela é criada sozinha no primeiro acesso.

## Endereços
- Inscrição (público): `/`
- Painel de inscritos (senha): `/admin`  — usuário: `admin`, senha: a que você definiu
- Exportar Excel: botão no painel, ou `/admin/inscritos.csv`

## Observação (LGPD)
O sistema coleta dados pessoais (CPF etc.). Use a senha do painel, mantenha o
acesso restrito e trate os dados apenas para fins do processo seletivo.
