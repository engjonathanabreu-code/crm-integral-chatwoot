#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "CRM Integral - Publicação no Supabase"
echo
read -p "Cole o Project Reference do Supabase: " PROJECT_REF
if [ -z "$PROJECT_REF" ]; then
  echo "Project Reference não informado."
  exit 1
fi
npx supabase login
npx supabase link --project-ref "$PROJECT_REF"
npx supabase db push
npx supabase functions deploy admin-create-user --no-verify-jwt
echo
echo "Supabase publicado com sucesso."
