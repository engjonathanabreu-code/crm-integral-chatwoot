from pathlib import Path
p=Path('CRM-Integral-IA-Andamentos-Importacao-Excel/app.js')
s=p.read_text()
old='''  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: {
      nome: $("newUserName").value.trim(),
      apelido: normalizeNickname($("newUserNickname").value),
      email: $("newUserEmail").value.trim(),
      password: $("newUserPassword").value,
      perfil: $("newUserRole").value,
      setor: $("newUserSector")?.value || null,
    },
  });

  if (error || data?.error) {
    message.textContent = data?.error || error?.message || "Não foi possível criar. Confirme se a Edge Function foi publicada.";
    return;
  }'''
new='''  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    message.textContent = "Sua sessão expirou. Entre novamente no CRM.";
    return;
  }

  const response = await fetch("/api/admin-user-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      nome: $("newUserName").value.trim(),
      apelido: normalizeNickname($("newUserNickname").value),
      email: $("newUserEmail").value.trim(),
      password: $("newUserPassword").value,
      perfil: $("newUserRole").value,
      setor: $("newUserSector")?.value || "Atendimento",
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    message.textContent = data?.error || "Não foi possível criar o usuário.";
    return;
  }'''
assert old in s, 'bloco admin-create-user atual nao encontrado'
s=s.replace(old,new,1)
p.write_text(s)
