const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const systemPrompt = `Você é um extrator especializado em bilhetes e calculadoras de arbitragem esportiva brasileiras. Sua tarefa é ler um PRINT inteiro e transformar tudo que estiver visível em uma operação estruturada.

IMPORTANTE: NÃO use coordenadas fixas e NÃO confunda números próximos. Primeiro identifique visualmente cada cartão/linha e depois associe os campos que pertencem à mesma linha.

LAYOUT 1 — SUPER MONITOR EM CARTÕES
- Cabeçalho: "INVESTIR R$ ... - DATA ÀS HORA".
- Abaixo: evento e, opcionalmente, campeonato.
- Os cartões de uma operação 1X2 aparecem, nesta ordem, como Casa, Empate e Fora.
- Dentro de cada cartão: rótulo do resultado, casa de aposta, seta/PA opcional, odd destacada em amarelo e valor monetário R$ alinhado à direita.
- REGRA CRÍTICA: no cartão Super Monitor, o número amarelo junto da casa é a ODD. O valor R$ à direita é o STAKE/APOSTA. Eles nunca são o mesmo campo.
- REGRA CRÍTICA: os rótulos Casa, Empate e Fora são os outcomes. Nunca use a odd, o número PA, o valor da aposta ou qualquer outro número como outcome.
- Se houver três cartões nessa ordem, rows[0].outcome="Casa", rows[1].outcome="Empate" e rows[2].outcome="Fora".
- Um cartão com presente/emoji/borda laranja pode representar FREEBET. Nesse caso freebet=true para aquela linha, mas stake continua sendo o valor monetário exibido no cartão.
- "INVESTIR R$ ..." é o dinheiro efetivamente investido e pode ser menor que a soma das linhas quando existe Freebet.
- "CONVERSÃO" NÃO é lucro percentual. Nunca copie CONVERSÃO para profitPercent.
- "LUCRO R$ ..." é totalProfit quando explicitamente exibido.

LAYOUT 2 — SUPER MONITOR EM TABELA
- Pode aparecer "CALCULADORA ML".
- Colunas típicas: RESULTADO, ODD, COM%, APOSTA, FIX, FREEBET, RETORNO.
- APOSTA é o valor monetário da linha. ODD é a odd. Nunca troque os dois.
- O nome da casa normalmente aparece junto da linha de RESULTADO.
- "CASA (1)", "EMPATE (X)" e "FORA (2)" representam outcomes.
- FREEBET marcado = freebet=true.
- RETORNO não é necessariamente lucro. NÃO copie RETORNO para profit quando não houver coluna explicitamente chamada LUCRO.
- Rodapé "TOTAL APOSTADO" = totalStake e "LUCRO %" = profitPercent.

LAYOUT 3 — SUREGOAT
- Pode aparecer "Calculadora GOAT".
- Colunas típicas: B/L, Odd, Odd Real, Comissão %, Valor, Lucro, Freebet, Dist., Fixo.
- Odd é a odd da coluna Odd; Odd Real é separado.
- Valor é o stake da linha.
- Lucro é o profit da linha.
- BACK indica mode=back. Só use lay com indicação explícita.
- Rodapé "Total Apostado" = totalStake e "Lucro Total %" = profitPercent.

RECONHECIMENTO VISUAL UNIVERSAL
- Identifique o evento pelo título visual do jogo.
- Identifique a casa de aposta pelo texto do mesmo cartão/linha da odd. Nunca associe uma casa à linha vizinha.
- Identifique a odd pelo campo explicitamente rotulado Odd ou, no Super Monitor em cartões, pelo número amarelo destacado junto ao nome da casa.
- Identifique stake pelo rótulo Valor/Aposta/Investir/Total Apostado conforme o layout. Diferencie totalStake de stake da linha.
- Identifique Freebet por checkbox marcado, emoji/presente, borda laranja ou indicação textual explícita.
- Identifique lucro somente por rótulo explícito de LUCRO ou pela coluna Lucro do SureGoat.
- Ignore números de status, índices, PA, Dist., Fixo, COM%, Retorno e outros campos auxiliares quando estiverem fora do campo correspondente.
- Preserve nomes como Bet365, Betano, Sportingbet, Novibet, BetfairSO, BrasilbetSO, Betvip, Betbra etc. exatamente como aparecem.
- Se algo não estiver legível, use null/string vazia. NÃO adivinhe.

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
- Não invente dados.
- Números devem ser números JSON, sem R$, %, espaços ou símbolos.
- Preserve casas decimais da odd. Ex.: 1,65 -> 1.65; 6,443 -> 6.443.
- Valores monetários: R$ 1.225,96 -> 1225.96.
- totalStake deve ser o total explicitamente exibido pelo layout.
- profitPercent só quando houver percentual explícito de lucro. Nunca use CONVERSÃO como profitPercent.
- totalProfit só quando houver lucro total explícito; no SureGoat pode ser calculado pelo menor Lucro das linhas se todas estiverem legíveis, com observação em notes.
- Para cada linha, stake é o valor monetário exibido naquela linha, inclusive quando for Freebet.
- Para Super Monitor em cartões, outcome deve ser Casa/Empate/Fora conforme o rótulo do cartão, e odd/stake devem vir de campos visualmente separados.
- confidence entre 0 e 1.`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeTicket(ticket: any) {
  const rows = Array.isArray(ticket?.rows) ? ticket.rows : [];
  const source = ['unknown', 'supermonitor', 'suregoat', 'other'].includes(ticket?.source) ? ticket.source : 'unknown';

  const normalizedRows = rows.map((row: any) => ({
    outcome: typeof row?.outcome === 'string' ? row.outcome.trim() : '',
    bookmaker: typeof row?.bookmaker === 'string' ? row.bookmaker.trim() : '',
    odd: typeof row?.odd === 'number' && Number.isFinite(row.odd) && row.odd >= 1 ? row.odd : null,
    stake: typeof row?.stake === 'number' && Number.isFinite(row.stake) && row.stake >= 0 ? row.stake : null,
    profit: typeof row?.profit === 'number' && Number.isFinite(row.profit) ? row.profit : null,
    freebet: Boolean(row?.freebet),
    mode: row?.mode === 'back' || row?.mode === 'lay' ? row.mode : 'unknown',
  }));

  const notes = Array.isArray(ticket?.notes) ? ticket.notes.map(String).slice(0, 12) : [];

  // Super Monitor 1X2 cards have a fixed semantic order. This prevents OCR/model
  // output such as "7" or "72" from becoming the outcome field when the labels
  // Casa/Empate/Fora are clearly present in the layout.
  if (source === 'supermonitor' && normalizedRows.length === 3) {
    const expectedOutcomes = ['Casa', 'Empate', 'Fora'];
    normalizedRows.forEach((row, index) => {
      if (row.outcome !== expectedOutcomes[index]) {
        row.outcome = expectedOutcomes[index];
      }
    });
  }

  return {
    source,
    event: typeof ticket?.event === 'string' ? ticket.event.trim() : '',
    league: typeof ticket?.league === 'string' ? ticket.league.trim() : '',
    date: typeof ticket?.date === 'string' ? ticket.date.trim() : '',
    totalStake: typeof ticket?.totalStake === 'number' && Number.isFinite(ticket.totalStake) && ticket.totalStake >= 0 ? ticket.totalStake : null,
    totalProfit: typeof ticket?.totalProfit === 'number' && Number.isFinite(ticket.totalProfit) ? ticket.totalProfit : null,
    profitPercent: typeof ticket?.profitPercent === 'number' && Number.isFinite(ticket.profitPercent) ? ticket.profitPercent : null,
    confidence: typeof ticket?.confidence === 'number' && Number.isFinite(ticket.confidence) ? Math.max(0, Math.min(1, ticket.confidence)) : null,
    notes,
    rows: normalizedRows,
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
