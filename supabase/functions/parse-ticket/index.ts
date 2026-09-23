const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const systemPrompt = `Você é um extrator especializado em bilhetes/calculadoras de arbitragem esportiva brasileiras. Analise o print inteiro, mesmo quando houver vários blocos, cabeçalho ou rodapé.

Objetivo: transformar o print em uma operação estruturada para uma calculadora de arbitragem.

Layouts conhecidos:
1) Super Monitor: costuma mostrar "INVESTIR", data/hora, jogo, campeonato e cartões "Casa", "Empate", "Fora". Cada cartão mostra casa de aposta, odd e valor apostado. Alguns cartões podem indicar Freebet com presente/emoji. Na parte inferior aparecem "CONVERSÃO" e "LUCRO".
2) Super Monitor em tabela: pode mostrar "CALCULADORA ML", "RESULTADO", "ODD", "APOSTA", "FIX", "FREEBET", "RETORNO" e "LUCRO %". Aqui é obrigatório capturar a coluna FREEBET quando existir e também o lucro/retorno.
3) SureGoat: pode mostrar "Odd", "Odd Real", "Valor", "Lucro", "Freebet", "Dist.", "Fixo", além de "Total Apostado" e "Lucro Total %". O checkbox Freebet deve ser convertido em freebet=true para aquela linha. Capture o valor da coluna Valor como stake e a coluna Lucro como lucro da linha.

Retorne EXATAMENTE este formato JSON:
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

Regras:
- Não invente dados. Se algo não estiver legível, use null ou string vazia e explique em notes.
- Preserve o nome da casa exatamente como aparece, inclusive Bet365, Betano, Sportingbet, Novibet, BetfairSO, BrasilbetSO etc.
- Odd deve ser número decimal, aceitando vírgula ou ponto no print.
- Valor/Aposta deve ser o valor monetário daquela linha. Para uma Freebet, o valor pode continuar sendo o valor exibido, mas freebet=true.
- Lucro deve ser capturado quando o layout mostrar lucro por linha. Se só houver lucro total, use totalProfit e deixe lucro das linhas como null.
- totalStake deve ser o total apostado exibido. Se não houver, some as apostas que não forem freebet quando isso for seguro.
- totalProfit deve ser o lucro total exibido. Não confunda com retorno bruto.
- profitPercent deve ser o percentual de lucro exibido, se houver.
- mode é back para apostas normais. Use lay apenas se o print indicar explicitamente LAY. Caso contrário unknown.
- outcome deve ser o resultado/mercado: Casa, Empate, Fora, ou o texto específico visível.
- Identifique source pelo layout, não pelo domínio sozinho.
- confidence deve ficar entre 0 e 1 e refletir a confiança na extração.
- Responda SOMENTE com o JSON, sem markdown e sem comentários.`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    return jsonResponse({ ticket });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado ao processar o print.' }, 500);
  }
});
