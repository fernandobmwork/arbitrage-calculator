# Configuração necessária

1. A integração está preparada para usar `FOOTBALL_DATA_API_KEY` como Secret da Edge Function.
2. Para este pacote, também foi configurado um fallback no `app_settings` com a chave fornecida anteriormente, para que a função consiga funcionar após aplicar as migrations.
3. Por segurança, se este projeto for publicado em repositório público, remova o fallback e configure a chave exclusivamente como Secret.

4. Não coloque a chave no frontend (`.env` VITE_*, React ou HTML).

5. Depois de aplicar as migrations, as Edge Functions usadas são:
   - `search-matches`: pesquisa somente o banco, sem consultar a API.
   - `update-results`: sincroniza os próximos 7 dias e atualiza somente jogos vinculados a operações pendentes.

6. O frontend chama `update-results` automaticamente ao abrir o app e a cada 60 segundos. O próprio backend limita a sincronização dos próximos 7 dias a uma vez a cada 6 horas.
