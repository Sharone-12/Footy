/**
 * One accent colour per club, chosen to read on the dark theme rather than to
 * match the badge exactly (Juventus is black and white; black is no use here).
 * Keyed by the team name as it appears in the data. Clubs not listed keep the
 * site's pitch green.
 */
const CLUB_COLORS: Record<string, string> = {
  Arsenal: "#EF2B2D",
  "Aston Villa": "#95BFE5",
  Chelsea: "#3D7BFF",
  Everton: "#3D7BE0",
  "Brighton & Hove Albion": "#2E8BFF",
  "Leeds United": "#FFCD00",
  "Liverpool FC": "#E63946",
  "Manchester City": "#6CABDD",
  "Manchester United": "#E8402F",
  "Newcastle United": "#E6E6E6",
  "Nottingham Forest": "#E53233",
  "Tottenham Hotspur": "#DDE3F0",
  "FC Barcelona": "#EDBB00",
  "Real Madrid": "#FEBE10",
  "Atlético Madrid": "#E8404A",
  "Athletic Club": "#EE2523",
  Sevilla: "#F43333",
  "Real Betis": "#19C06A",
  "Real Sociedad": "#3A7BFF",
  Valencia: "#FF8A1F",
  Villarreal: "#FFE667",
  Juventus: "#E8E8E8",
  Inter: "#2E90FF",
  "AC Milan": "#FB2B2D",
  "SSC Napoli": "#12A0D7",
  "AS Roma": "#F0A020",
  Lazio: "#87D8F7",
  Atalanta: "#2D7BFF",
  Fiorentina: "#A56BF0",
  "Paris Saint-Germain": "#4F7BFF",
  "Olympique de Marseille": "#2FAEE0",
  "Olympique Lyonnais": "#E8303A",
  "AS Monaco": "#E63031",
  "LOSC Lille": "#E8362B",
  "FC Bayern München": "#F03050",
  "Borussia Dortmund": "#FDE100",
  "Bayer 04 Leverkusen": "#E83A39",
  "RB Leipzig": "#F02A5A",
  "VfB Stuttgart": "#E8372F",
  "Eintracht Frankfurt": "#E8303A",
  "SV Werder Bremen": "#2DBE6C",
  "Sporting CP": "#19C06A",
  "FC Porto": "#3B7BFF",
  Galatasaray: "#FDB912",
  "Fenerbahçe": "#FFED00",
  "PSV Eindhoven": "#F03A40",
  Feyenoord: "#E8303A",
  "Club Brugge KV": "#3B8BFF",
}

export function clubColor(team: string | null | undefined): string | null {
  return (team && CLUB_COLORS[team]) || null
}
