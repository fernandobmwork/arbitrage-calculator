import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: { type: "string" },
    source_layout: { type: ["string", "null"] },
    event: { type: ["string", "null"] },
    competition: { type: ["string", "null"] },
    match_date: { type: ["string", "null"] },
    total_stake: { type: ["number", "null"] },
    total_profit: { type: ["number", "null"] },
    profit_percent: { type: ["number", "null"] },
    conversion_percent: { type: ["number", "null"] },
    confidence: { type: ["number", "null"] },
    warnings: { type: "array", items: { type: "string" } },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          result: { type: "string" },
          bookmaker: { type: "string" },
          bet_type: { type: "string" },
          odd: { type: ["number", "null"] },
          odd_real: { type: ["number", "null"] },
          commission_percent: { type: ["number", "null"] },
          stake: { type: ["number", "null"] },
          profit: { type: ["number", "null"] },
          freebet: { type: ["boolean", "null"] },
          distribution: { type: ["boolean", "null"] },
          fixed: { type: ["boolean", "null"] },
          notes: { type: ["string", "null"] },
        },
        required: ["result", "bookmaker", "bet_type", "odd", "odd_real", "commission_percent", "stake", "profit", "freebet", "distribution", "fixed", "notes"],
      },
    },
  },
  required: ["source", "source_layout", "event", "competition", "match_date", "total_stake", "total_profit", "profit_percent", "conversion_percent", "confidence", "warnings", "rows"],
} as const;

const instructions = `Você é um extrator especializado em prints de calculadoras de arbitragem esportiva brasileiras.

Analise a imagem inteira e identifique qual layout está sendo usado. Os layouts conhecidos incluem:
1) Super Monitor: mostra "INVESTIR", evento, competição e cartões Casa/Empate/Fora; cada cartão pode mostrar casa, odd, valor apostado e, em alguns casos, PA.
2) Calculadora ML do Super Monitor: tabela com RESULTADO, ODD, COM%, APOSTA, FIX, FREEBET e RETORNO. O nome da casa aparece junto do resultado.
3) Calculadora GOAT/Suregoat: tabela com B/L, Odd, Odd Real, Comissão %, Valor, Lucro, Freebet, Dist. e Fixo. Pode ter 3, 4, 5 ou mais linhas.

Não invente dados. Extraia somente o que estiver legível na imagem. Se um campo não estiver presente ou não puder ser lido com segurança, use null. Preserve casas decimais e valores exatamente como exibidos, convertendo vírgula decimal para número.

É obrigatório prestar atenção a:
- nome exato do evento;
- competição quando aparecer;
- data e hora quando aparecerem;
- nome da casa de aposta;
- resultado/seleção (Casa, Empate, Fora, BACK, LAY etc.);
- tipo BACK/LAY quando identificável;
- Odd e Odd Real;
- comissão;
- valor/aposta/stake;
- lucro por linha quando exibido;
- se cada linha está marcada como FREEBET;
- se está marcada como Dist. (distribuição);
- se está marcada como Fixo;
- Total Apostado/Investir;
- Lucro Total em R$;
- Lucro Total %;
- Conversão % quando existir.

No campo source use um nome curto e identificável, como "Super Monitor", "Calculadora GOAT" ou "Suregoat". source_layout deve descrever o modelo visual, por exemplo "Super Monitor - ML" ou "GOAT - 5 linhas".

Para confidence, dê um número de 0 a 1 representando sua confiança global na leitura. Em warnings coloque apenas pontos que precisam de conferência humana, especialmente números parcialmente cortados, textos ambíguos ou checkboxes que não puderam ser determinados.

Importante: um checkbox vazio significa false, um checkbox marcado significa true, e um checkbox que não pode ser visto claramente deve ser null. Nunca trate ausência de checkbox como true.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const { image } = await req.json();
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return json({ error: "Envie uma imagem em data URL." }, 400);
    }
    if (image.length > 16_000_000) {
      return json({ error: "Imagem muito grande. Reduza o print para no máximo aproximadamente 12 MB." }, 413);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) return json({ error: "OPENAI_API_KEY não configurada na Edge Function." }, 500);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instructions },
              { type: "input_image", image_url: image, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "ticket_extraction",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("OpenAI error", response.status, details);
      return json({ error: `Falha na análise da imagem (${response.status}).` }, 502);
    }

    const payload = await response.json();
    const outputText = typeof payload.output_text === "string"
      ? payload.output_text
      : payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;

    if (!outputText) return json({ error: "A IA não retornou os dados estruturados." }, 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return json({ error: "A resposta da IA não veio em formato válido." }, 502);
    }

    return json({ data: parsed });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado ao capturar bilhete." }, 500);
  }
});
