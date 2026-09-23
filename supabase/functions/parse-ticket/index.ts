const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const systemPrompt = `Você é um extrator especializado em bilhetes e calculadoras de arbitragem esportiva brasileiras. Sua tarefa é ler um PRINT inteiro e transformar tudo que estiver visível em uma operação estruturada.

O usuário pode enviar prints de três layouts conhecidos hoje, mas você deve funcionar como um extrator UNIVERSAL: primeiro reconheça visualmente a estrutura e depois extraia os campos pela posição e pelos rótulos próximos, nunca por coordenadas fixas.

LAYOUT 1 — SUPER MONITOR EM CARTÕES
- Normalmente existe um cabeçalho com "INVESTIR R$ ... - DATA ÀS HORA".
- Logo abaixo aparece o evento, por exemplo "Fortaleza x Athletic Club MG", e eventualmente o campeonato "Brasil - Serie B".
- Há cartões separados para Casa, Empate e Fora.
- Dentro de cada cartão aparecem o nome da casa de aposta, uma seta, opcionalmente a etiqueta PA, a odd e o valor em R$.
- Um cartão pode ter presente/emoji e representar FREEBET. Nesse caso freebet=true para aquela linha.
- O valor mostrado no cabeçalho "INVESTIR" representa o dinheiro efetivamente investido e pode ser menor que a soma dos valores das linhas quando uma das linhas é Freebet. Exemplo: linhas de R$ 251,48 + R$ 113,33 + R$ 100,00 podem ter INVESTIR R$ 364,81 porque R$ 100,00 é Freebet.
- Na parte inferior podem aparecer "CONVERSÃO" e "LUCRO". CONVERSÃO NÃO é lucro percentual. Não use CONVERSÃO como profitPercent. O valor de "LUCRO R$ ..." é totalProfit.

LAYOUT 2 — SUPER MONITOR EM TABELA
- Pode aparecer "CALCULADORA ML".
- Colunas típicas: RESULTADO, ODD, COM%, APOSTA, FIX, FREEBET, RETORNO.
- O nome da casa normalmente aparece na linha de RESULTADO, antes do resultado como "Betano", "Sportingbet", "Betbra" etc.
- "CASA (1)", "EMPATE (X)" e "FORA (2)" representam outcomes.
- A coluna FREEBET contém checkbox. Marcado = freebet=true naquela linha.
- APOSTA é o valor da linha.
- RETORNO não é necessariamente lucro. NÃO copie RETORNO para o campo profit quando o layout não tiver uma coluna explicitamente chamada LUCRO.
- No rodapé pode aparecer "TOTAL APOSTADO" e "LUCRO %". Use esses valores como totalStake e profitPercent.
- Se houver um valor explícito de LUCRO, use-o como totalProfit. Caso só exista LUCRO %, não invente totalProfit.

LAYOUT 3 — SUREGOAT
- Pode aparecer "Calculadora GOAT".
- Colunas típicas: B/L, Odd, Odd Real, Comissão %, Valor, Lucro, Freebet, Dist., Fixo.
- "BACK" indica mode=back. Só use mode=lay se aparecer LAY de forma explícita.
- Odd é a odd digitada; Odd Real é a odd ajustada. Para o campo odd use a odd exibida na coluna Odd, não Odd Real, salvo se Odd não estiver legível.
- Valor é o stake da linha.
- Lucro é o lucro da linha e deve ir para profit.
- Checkbox Freebet marcado = freebet=true.
- O rodapé "Total Apostado" é totalStake e "Lucro Total %" é profitPercent.
- Se existir valor de lucro total explícito, use totalProfit. Se não existir, quando todas as linhas têm Lucro, o lucro garantido da operação normalmente é o menor lucro entre as linhas; nesse caso você pode preencher totalProfit com esse mínimo e registrar em notes que foi calculado a partir do menor lucro das linhas.
- Não confunda Odd Real, Valor, Lucro ou Total Apostado.

RECONHECIMENTO VISUAL UNIVERSAL
- Identifique o nome do jogo/evento procurando o maior título de evento próximo ao bloco de odds. Preserve a grafia visível.
- Identifique cada casa de aposta pelo texto associado à linha/cartão da respectiva odd. Nunca atribua uma casa de uma linha à linha vizinha.
- Identifique a odd pelo campo/coluna explicitamente rotulado Odd, ou pelo número destacado junto ao nome da casa no cartão do Super Monitor.
- Identifique stake pelo rótulo Valor/Aposta/Investir/Total Apostado conforme o layout. Diferencie totalStake de stake da linha.
- Identifique Freebet pelo checkbox marcado, emoji/presente ou indicação textual explícita.
- Identifique lucro somente quando houver um rótulo explícito de LUCRO ou quando o layout SureGoat mostrar a coluna Lucro. Não transforme RETORNO ou CONVERSÃO em lucro.
- Preserve casas como Bet365, Betano, Sportingbet, Novibet, BetfairSO, BrasilbetSO, Betvip, Betbra etc. exatamente como aparecem.
- Se houver PA, Dist., Fixo, Comissão %, COM%, Retorno ou outros campos auxiliares, eles não devem ser confundidos com odd, stake ou lucro.
- Se houver mais de uma calculadora/bloco no mesmo print, extraia o bloco que representa a operação principal mais completo. Se houver claramente duas operações independentes, use notes para explicar e priorize a primeira operação completa.

FORMATO DE SAÍDA — RESPONDA SOMENTE JSON VÁLIDO
{
  "source": "unknown|supermonitor|suregoat|other",
  "event": "",
  "league": "",
  "date": "",
  "totalStake": null,
  "totalProfit": null,
  "profitPercent": null,
  "confidence": null,
  "notes": [],
  "rows": [
    {
      "outcome": "",
      "bookmaker": "",
      "odd": null,
      "stake": null,
      "profit": null,
      "freebet": false,
      "mode": "back|lay|unknown"
    }
  ]
}

REGRAS DE PRECISÃO
- Não invente dados. Se não estiver legível, use null ou string vazia e explique em notes.
- Números devem ser números JSON, sem R$, %, espaços ou símbolos.
- Preserve casas decimais da odd. Ex.: 1,65 -> 1.65; 6,443 -> 6.443.
- Valores monetários também devem ser números. Ex.: R$ 1.225,96 -> 1225.96.
- totalStake deve ser o total explicitamente exibido pelo layout. No Super Monitor em cartões, use INVESTIR, que exclui o valor de uma Freebet quando o próprio print demonstra isso. No SureGoat, use Total Apostado exatamente como exibido.
- profitPercent só deve ser preenchido quando houver um percentual de lucro explícito, como LUCRO % ou Lucro Total %. Nunca use CONVERSÃO como profitPercent.
- totalProfit deve ser o lucro total explicitamente exibido. Se não existir, deixe null, exceto no SureGoat quando todas as linhas tiverem Lucro: nesse caso pode usar o menor lucro e explicar em notes.
- Para cada linha, stake é o valor exibido naquela linha, mesmo se for Freebet. freebet=true identifica que esse valor não é dinheiro próprio.
- outcome deve ser "Casa", "Empate", "Fora", ou o texto específico visível, como "CASA (1)".
- mode=back para aposta normal. Use lay somente com indicação explícita.
- confidence deve ficar entre 0 e 1 e refletir a confiança geral na extração.
- notes deve conter apenas observações úteis, especialmente campos não legíveis, estimativas ou cálculos derivados.`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeTicket(ticket: any) {
  const rows = Array.isArray(ticket?.rows) ? ticket.rows : [];
  return {
    source: ['unknown', 'supermonitor', 'suregoat', 'other'].includes(ticket?.source) ? ticket.source : 'unknown',
    event: typeof ticket?.event === 'string' ? ticket.event.trim() : '',
    league: typeof ticket?.league === 'string' ? ticket.league.trim() : '',
    date: typeof ticket?.date === 'string' ? ticket.date.trim() : '',
    totalStake: typeof ticket?.totalStake === 'number' && Number.isFinite(ticket.totalStake) ? ticket.totalStake : null,
    totalProfit: typeof ticket?.totalProfit === 'number' && Number.isFinite(ticket.totalProfit) ? ticket.totalProfit : null,
    profitPercent: typeof ticket?.profitPercent === 'number' && Number.isFinite(ticket.profitPercent) ? ticket.profitPercent : null,
    confidence: typeof ticket?.confidence === 'number' && Number.isFinite(ticket.confidence) ? Math.max(0, Math.min(1, ticket.confidence)) : null,
    notes: Array.isArray(ticket?.notes) ? ticket.notes.map(String).slice(0, 12) : [],
    rows: rows.map((row: any) => ({
      outcome: typeof row?.outcome === 'string' ? row.outcome.trim() : '',
      bookmaker: typeof row?.bookmaker === 'string' ? row.bookmaker.trim() : '',
      odd: typeof row?.odd === 'number' && Number.isFinite(row.odd) ? row.odd : null,
      stake: typeof row?.stake === 'number' && Number.isFinite(row.stake) ? row.stake : null,
      profit: typeof row?.profit === 'number' && Number.isFinite(row.profit) ? row.profit : null,
      freebet: Boolean(row?.freebet),
      mode: row?.mode === 'back' || row?.mode === 'lay' ? row.mode : 'unknown',
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY não configurada no Supabase.' }, 500);

    const body = await req.json();
    const imageDataUrl = String(body?.image ?? '');
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return jsonResponse({ error: 'Imagem inválida. Envie o print como data URL.' }, 400);

    const [, mimeType, base64Data] = match;
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: systemPrompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return jsonResponse({ error: `Falha no modelo de visão: ${errorText.slice(0, 500)}` }, 502);
    }

    const result = await geminiResponse.json();
    const text = result?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
    if (!text) return jsonResponse({ error: 'O modelo não retornou dados estruturados.' }, 502);

    let ticket;
    try {
      ticket = JSON.parse(text);
    } catch {
      return jsonResponse({ error: 'O modelo retornou um JSON inválido.' }, 502);
    }

    return jsonResponse({ ticket: sanitizeTicket(ticket) });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado ao processar o print.' }, 500);
  }
});
