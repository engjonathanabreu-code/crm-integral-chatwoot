from pathlib import Path

root = Path('CRM-Integral-IA-Andamentos-Importacao-Excel')
app_path = root / 'app.js'
css_path = root / 'style.css'
app = app_path.read_text()
css = css_path.read_text()

old = 'return `<article class="user-admin-card user-admin-card-with-history">'
new = 'return `<article class="user-admin-card user-admin-card-with-history" data-user-card="${profile.id}" tabindex="0" role="button">'
if old in app:
    app = app.replace(old, new, 1)

listener = '''\n\n// Card de usuário clicável: reutiliza o botão Editar usuário sem interferir no histórico.\ndocument.addEventListener("click", (event) => {\n  const card = event.target.closest(".user-admin-card[data-user-card]");\n  if (!card) return;\n  if (event.target.closest("button, a, input, select, textarea, summary, details, label")) return;\n  card.querySelector("[data-edit-user]")?.click();\n});\n\ndocument.addEventListener("keydown", (event) => {\n  if (event.key !== "Enter" && event.key !== " ") return;\n  const card = event.target.closest(".user-admin-card[data-user-card]");\n  if (!card || event.target !== card) return;\n  event.preventDefault();\n  card.querySelector("[data-edit-user]")?.click();\n});\n'''
if 'Card de usuário clicável: reutiliza' not in app:
    app += listener

css_patch = '''\n\n/* CRM: cards de usuário clicáveis e linhas operacionais alinhadas */\n.user-admin-card[data-user-card]{cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease}\n.user-admin-card[data-user-card]:hover{box-shadow:0 5px 18px rgba(15,23,42,.06)}\n.user-admin-card[data-user-card]:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\n\n#ticketsList .record-row,\n#tasksList .record-row{\n  display:grid;\n  grid-template-columns:minmax(280px,2.15fr) minmax(120px,.72fr) minmax(170px,1fr) minmax(240px,1.45fr) minmax(250px,1.22fr);\n  gap:18px;\n  align-items:center;\n  width:100%;\n}\n#ticketsList .record-row>div,\n#tasksList .record-row>div{min-width:0;max-width:100%}\n#ticketsList .record-row h4,#ticketsList .record-row p,#ticketsList .record-row span,\n#tasksList .record-row h4,#tasksList .record-row p,#tasksList .record-row span{overflow-wrap:anywhere}\n#ticketsList .record-actions,\n#tasksList .record-actions{\n  display:grid;\n  grid-template-columns:repeat(3,minmax(0,1fr));\n  gap:8px;\n  width:100%;\n  align-items:stretch;\n}\n#ticketsList .record-actions .small-button,\n#tasksList .record-actions .small-button{\n  width:100%;min-width:0;height:34px;padding:0 9px;display:flex;align-items:center;justify-content:center;white-space:nowrap\n}\n@media(max-width:1180px){\n  #ticketsList .record-row,#tasksList .record-row{grid-template-columns:minmax(230px,1.8fr) minmax(110px,.7fr) minmax(150px,.9fr) minmax(210px,1.2fr) minmax(220px,1fr);gap:12px}\n  #ticketsList .record-actions,#tasksList .record-actions{grid-template-columns:1fr}\n}\n@media(max-width:860px){\n  #ticketsList .record-row,#tasksList .record-row{grid-template-columns:1fr 1fr;align-items:start}\n  #ticketsList .record-actions,#tasksList .record-actions{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr))}\n}\n@media(max-width:620px){\n  #ticketsList .record-row,#tasksList .record-row{grid-template-columns:1fr}\n  #ticketsList .record-actions,#tasksList .record-actions{grid-column:auto;grid-template-columns:1fr}\n}\n'''
if 'CRM: cards de usuário clicáveis e linhas operacionais alinhadas' not in css:
    css += css_patch

app_path.write_text(app)
css_path.write_text(css)
