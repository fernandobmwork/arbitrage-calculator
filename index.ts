import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const FD_BASE = "https://api.football-data.org/v4";
const COMPETITIONS = ["CL", "PPL", "PL", "DED", "BL1", "FL1", "SA", "PD", "ELC", "BSA", "WC", "EC"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function mapStatus(status: string): "upcoming" | "live" | "finished" {
  if (status === "FINISHED") return "finished";
  if (["LIVE", "IN_PLAY", "PAUSED"].includes(status)) return "live";
  return "upcoming";
}

function outcome(home: number | null, away: number | null): "home" | "draw" | "away" | null {
  if (home == null || away == null) return null;
  return home > away ? "home" : away > home ? "away" : "draw";
}

function getGreenBookmakers(bet: any, result: "home" | "draw" | "away"): string {
  const state = bet.calculator_state || {};
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const rowIsLay = Array.isArray(state.rowIsLay) ? state.rowIsLay : [];
  const n = Number(state.numOutcomes || rows.length || 3);
  const bookmakers = bet.bookmakers || {};
  const resultIndex = result === "home" ? 0 : result === "draw" ? 1 : 2;
  const greens: string[] = [];

  for (let i = 0; i < Math.min(n, rows.length); i++) {
    const lay = Boolean(rowIsLay[i]);
    // Back wins when its selected outcome happens; lay wins when its selected outcome does not happen.
    const wins = lay ? i !== resultIndex : i === resultIndex;
    if (wins) {
      const name = String(bookmakers[`row${i + 1}`] || rows[i]?.bookmaker || `Linha ${i + 1}`).trim();
      if (name && !greens.includes(name)) greens.push(name);
    }
  }
  return greens.join(", ");
}

async function getApiKey(supabase: any) {
  const envKey = Deno.env.get("FOOTBALL_DATA_API_KEY")?.trim();
  if (envKey) return envKey;
  // Backward-compatible fallback for the existing project; move this to the Edge Function secret.
  const { data } = await supabase.from("app_settings").select("value").eq("key", "football_data_api_key").maybeSingle();
  return String(data?.value || "").trim();
}

async function fdFetch(path: string, apiKey: string) {
  return fetch(`${FD_BASE}${path}`, { headers: { "X-Auth-Token": apiKey } });
}

async function syncNextSevenDays(supabase: any, apiKey: string) {
  const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "fixtures_last_sync_at").maybeSingle();
  const last = setting?.value ? new Date(setting.value) : new Date(0);
  const now = new Date();
  if (now.getTime() - last.getTime() < 6 * 60 * 60 * 1000) return { skipped: true, inserted: 0, updated: 0 };

  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await fdFetch(`/matches?competitions=${encodeURIComponent(COMPETITIONS.join(","))}&dateFrom=${from}&dateTo=${to}&status=SCHEDULED`, apiKey);
  if (res.status === 429) return { skipped: false, rateLimited: true, inserted: 0, updated: 0 };
  if (!res.ok) throw new Error(`football-data.org respondeu ${res.status} ao sincronizar fixtures`);
  const payload = await res.json();

  let inserted = 0;
  let updated = 0;
  for (const m of (payload.matches || [])) {
    const record = {
      external_match_id: m.id,
      competition_code: m.competition?.code || null,
      season: m.season?.startDate ? Number(String(m.season.startDate).slice(0, 4)) : null,
      home_team: m.homeTeam?.shortName || m.homeTeam?.name || "",
      away_team: m.awayTeam?.shortName || m.awayTeam?.name || "",
      home_team_id: m.homeTeam?.id || null,
      away_team_id: m.awayTeam?.id || null,
      league: m.competition?.name || "",
      match_date: m.utcDate || null,
      status: mapStatus(m.status),
      score_home: m.score?.fullTime?.home ?? null,
      score_away: m.score?.fullTime?.away ?? null,
      result: m.status === "FINISHED" ? outcome(m.score?.fullTime?.home, m.score?.fullTime?.away) : null,
      last_api_update: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from("matches").select("id").eq("external_match_id", m.id).maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from("matches").update(record).eq("id", existing.id);
      if (!error) updated++;
    } else {
      const { error } = await supabase.from("matches").insert(record);
      if (!error) inserted++;
    }
  }

  await supabase.from("app_settings").upsert({ key: "fixtures_last_sync_at", value: now.toISOString() });
  return { skipped: false, inserted, updated };
}

async function updatePendingResults(supabase: any, apiKey: string) {
  const { data: bets, error } = await supabase
    .from("bets")
    .select("id, match_id, bookmakers, calculator_state")
    .eq("status", "pending")
    .not("match_id", "is", null);
  if (error) throw error;
  if (!bets?.length) return { updated: 0, apiCalls: 0 };

  const matchIds = [...new Set(bets.map((b: any) => b.match_id).filter(Boolean))];
  const { data: matches } = await supabase.from("matches").select("*").in("id", matchIds);
  const now = Date.now();
  const readyWithoutApi = (matches || []).filter((m: any) => m.external_match_id && m.status === "finished" && m.result);
  const due = (matches || []).filter((m: any) => {
    if (!m.external_match_id || !m.match_date || (m.status === "finished" && m.result)) return false;
    const start = new Date(m.match_date).getTime();
    // Only start result polling 90 minutes before kickoff and continue until finished.
    return start <= now + 90 * 60 * 1000;
  });

  let apiMatches: any[] = [];
  let apiCalls = 0;
  if (due.length) {
    const ids = due.map((m: any) => m.external_match_id).join(",");
    const res = await fdFetch(`/matches?ids=${encodeURIComponent(ids)}`, apiKey);
    apiCalls = 1;
    if (res.status === 429) return { updated: 0, apiCalls, rateLimited: true };
    if (!res.ok) throw new Error(`football-data.org respondeu ${res.status} ao atualizar resultados`);
    const payload = await res.json();
    apiMatches = payload.matches || [];
  }
  const byExternal = new Map<number, any>(apiMatches.map((m: any) => [Number(m.id), m]));
  let updated = 0;

  const pendingByMatch = new Map<string, any[]>();
  for (const bet of bets || []) {
    if (!bet.match_id) continue;
    const list = pendingByMatch.get(bet.match_id) || [];
    list.push(bet);
    pendingByMatch.set(bet.match_id, list);
  }

  const processFinished = async (match: any, finalResult: "home" | "draw" | "away") => {
    const linked = pendingByMatch.get(match.id) || [];
    for (const bet of linked) {
      const bookmakerGreen = getGreenBookmakers(bet, finalResult);
      const winningOutcome = finalResult === "home" ? "Casa" : finalResult === "away" ? "Fora" : "Empate";
      await supabase.from("bets").update({
        status: "won",
        winning_outcome: winningOutcome,
        bookmaker_green: bookmakerGreen || null,
      }).eq("id", bet.id).eq("status", "pending");
    }
  };

  for (const match of readyWithoutApi as any[]) {
    await processFinished(match, match.result);
    updated++;
  }

  for (const match of due as any[]) {
    const apiMatch = byExternal.get(Number(match.external_match_id));
    if (!apiMatch) continue;
    const mapped = mapStatus(apiMatch.status);
    const homeScore = apiMatch.score?.fullTime?.home ?? null;
    const awayScore = apiMatch.score?.fullTime?.away ?? null;
    const finalResult = apiMatch.status === "FINISHED" ? outcome(homeScore, awayScore) : null;

    const { error: matchUpdateError } = await supabase.from("matches").update({
      status: mapped,
      score_home: homeScore,
      score_away: awayScore,
      result: finalResult,
      last_api_update: new Date().toISOString(),
    }).eq("id", match.id);
    if (matchUpdateError || !finalResult) continue;

    await processFinished(match, finalResult);
    updated++;
  }

  return { updated, apiCalls };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const apiKey = await getApiKey(supabase);
    if (!apiKey) return json({ error: "FOOTBALL_DATA_API_KEY não configurada.", updated: 0 }, 500);

    const sync = await syncNextSevenDays(supabase, apiKey);
    const result = await updatePendingResults(supabase, apiKey);
    return json({ ok: true, sync, ...result });
  } catch (err) {
    return json({ error: (err as Error).message, updated: 0 }, 500);
  }
});
