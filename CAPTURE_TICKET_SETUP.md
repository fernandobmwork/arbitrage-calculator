# Captura universal de bilhetes

A aba **Capturar bilhete** aceita upload, arrastar/soltar e colagem de screenshots. A imagem é enviada à Edge Function `capture-ticket`, que usa visão da OpenAI para devolver um JSON estruturado e a interface mostra uma etapa de conferência antes de gravar em `bets`.

## Configuração necessária

1. Execute a migration `20260923090000_add_ticket_capture_metadata.sql` no projeto Supabase.
2. Configure o secret da Edge Function:

```bash
supabase secrets set OPENAI_API_KEY="SUA_CHAVE"
```

3. Faça o deploy da função:

```bash
supabase functions deploy capture-ticket --no-verify-jwt
```

O `config.toml` já marca `capture-ticket` como `verify_jwt = false`, seguindo as funções existentes deste projeto.

## Fluxo

- Usuário cola ou envia o print.
- A IA identifica o layout universal e extrai evento, competição, data/hora, casa, resultado, BACK/LAY, odd, odd real, comissão, valor, lucro por linha, Freebet, Dist., Fixo, total apostado, lucro total, lucro % e conversão.
- Campos ilegíveis ficam `null`; não são inventados.
- A tela mostra os dados para conferência.
- Ao clicar **Adicionar operação**, a operação é gravada na tabela `bets`, junto do snapshot em `calculator_state`.

## Layouts cobertos nesta primeira versão

- Super Monitor / Calculadora ML
- Calculadora GOAT / Suregoat
- Variações de quantidade de linhas e tamanho de tela

A arquitetura foi feita para adicionar novos layouts sem mudar o formato salvo da operação.
