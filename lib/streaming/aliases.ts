/**
 * International team and competition aliases for stream matching.
 *
 * Stream providers frequently list international fixtures under abbreviations
 * (e.g. "ENG vs CRO", "ESP vs GER"), localized names ("Hrvatska", "Deutschland",
 * "España"), or general competition names ("Nations League", "UNL", "World Cup Qualifiers").
 */

export const INTERNATIONAL_ALIASES: Record<string, string[]> = {
  // Europe
  england: ["eng", "three lions", "england national team"],
  croatia: ["cro", "hrvatska", "croatia national team"],
  spain: ["esp", "espana", "españa", "la roja", "spain national team"],
  germany: ["ger", "deu", "deutschland", "die mannschaft", "germany national team"],
  france: ["fra", "les bleus", "france national team"],
  italy: ["ita", "italia", "gli azzurri", "azzurri", "italy national team"],
  portugal: ["por", "selecao das quinas", "portugal national team"],
  netherlands: ["ned", "holland", "the netherlands", "oranje", "netherlands national team"],
  belgium: ["bel", "red devils", "belgium national team"],
  czechia: ["cze", "czech republic", "czech rep", "czech", "cesko"],
  denmark: ["den", "danmark", "denmark national team"],
  sweden: ["swe", "sverige", "sweden national team"],
  norway: ["nor", "norge", "norway national team"],
  poland: ["pol", "polska", "poland national team"],
  switzerland: ["sui", "schweiz", "suisse", "switzerland national team"],
  austria: ["aut", "österreich", "oesterreich", "austria national team"],
  scotland: ["sco", "scotland national team"],
  wales: ["wal", "cymru", "wales national team"],
  ireland: ["irl", "republic of ireland", "rep of ireland", "ireland national team"],
  "northern ireland": ["nir", "northern ireland national team"],
  turkey: ["tur", "turkiye", "türkiye", "turkey national team"],
  greece: ["gre", "hellas", "greece national team"],
  serbia: ["srb", "srbija", "serbia national team"],
  hungary: ["hun", "magyarorszag", "hungary national team"],
  ukraine: ["ukr", "ukraine national team"],
  romania: ["rou", "rom", "romania national team"],
  slovakia: ["svk", "slovakia national team"],
  slovenia: ["svn", "slo", "slovenia national team"],
  "bosnia and herzegovina": ["bih", "bosnia", "bosnia & herzegovina", "bosnia-herzegovina"],
  georgia: ["geo", "georgia national team"],
  albania: ["alb", "albania national team"],
  finland: ["fin", "suomi", "finland national team"],
  iceland: ["isl", "island", "iceland national team"],

  // Americas
  brazil: ["bra", "brasil", "selecao", "brazil national team"],
  argentina: ["arg", "albiceleste", "argentina national team"],
  uruguay: ["uru", "los charruas", "uruguay national team"],
  colombia: ["col", "los cafeteros", "colombia national team"],
  chile: ["chi", "la roja", "chile national team"],
  "united states": ["usa", "usmnt", "united states of america"],
  mexico: ["mex", "el tri", "mexico national team"],
  canada: ["can", "canada national team"],
  ecuador: ["ecu", "ecuador national team"],
  peru: ["per", "peru national team"],
  paraguay: ["par", "paraguay national team"],
  venezuela: ["ven", "venezuela national team"],

  // Africa, Asia & Oceania
  japan: ["jpn", "samurai blue", "japan national team"],
  "south korea": ["kor", "korea republic", "korea", "south korea national team"],
  morocco: ["mar", "atlas lions", "morocco national team"],
  senegal: ["sen", "senegal national team"],
  nigeria: ["nga", "super eagles", "nigeria national team"],
  ghana: ["gha", "black stars", "ghana national team"],
  "ivory coast": ["civ", "cote d'ivoire", "cote divoire", "ivory coast national team"],
  egypt: ["egy", "the pharaohs", "egypt national team"],
  cameroon: ["cmr", "indomitable lions", "cameroon national team"],
  algeria: ["dza", "alg", "algeria national team"],
  tunisia: ["tun", "tunisia national team"],
  australia: ["aus", "socceroos", "australia national team"],
  "saudi arabia": ["ksa", "saudi", "saudi arabia national team"],
}

export const INTERNATIONAL_COMPETITIONS: Record<string, string[]> = {
  "uefa nations league": [
    "nations league",
    "unl",
    "uefa nations",
    "nations league a",
    "nations league b",
    "uefa nations league a",
    "uefa nations league b",
  ],
  "world cup": ["fifa world cup", "world cup", "mundial", "wc", "fifa wc"],
  "world cup qualification": [
    "world cup qualifiers",
    "world cup qualifying",
    "wc qualification",
    "wc qualifiers",
    "fifa world cup qualification",
    "world cup prelims",
    "wcq",
  ],
  "european championship": [
    "euro",
    "euros",
    "uefa euro",
    "euro 2024",
    "euro 2028",
    "euro qualifiers",
    "uefa european championship",
  ],
  "copa america": ["copa américa", "conmebol copa america"],
  "africa cup of nations": ["afcon", "african cup of nations", "can", "africa cup"],
  "international friendly": [
    "friendlies",
    "international friendly",
    "friendly",
    "club friendly",
    "intl friendly",
    "international friendlies",
  ],
  "concacaf nations league": ["concacaf", "concacaf nl"],
  "afc asian cup": ["asian cup", "afc cup"],
}

/** Check if a target normalized string matches an alias form, guarding against 3-letter substring collisions. */
export function matchesAliasTarget(target: string, aliasNorm: string): boolean {
  if (target === aliasNorm) return true
  if (aliasNorm.length <= 3) {
    return target.split(" ").includes(aliasNorm)
  }
  return target.includes(aliasNorm) || aliasNorm.includes(target)
}

/** Check if two normalized strings match an alias, guarding against 3-letter code substring collisions. */
export function isAliasMatch(normA: string, normB: string, aliasNorm: string): boolean {
  return matchesAliasTarget(normA, aliasNorm) && matchesAliasTarget(normB, aliasNorm)
}
