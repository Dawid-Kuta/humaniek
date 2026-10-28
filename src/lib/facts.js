// Labels for the `facts` keys written by scripts/build-anatomy-data.mjs
// (English Wikipedia infobox fields), in display order.
export const FACT_LABELS = {
  origin: 'Przyczep początkowy',
  insertion: 'Przyczep końcowy',
  action: 'Czynność',
  nerve: 'Unerwienie',
  artery: 'Unaczynienie',
  vein: 'Odpływ żylny',
  lymph: 'Odpływ chłonki',
  antagonist: 'Antagoniści',
  articulations: 'Połączenia stawowe',
  muscleOrigins: 'Przyczepy początkowe mięśni',
  muscleInsertions: 'Przyczepy końcowe mięśni',
  ligFrom: 'Przyczep (od)',
  ligTo: 'Przyczep (do)',
  roots: 'Korzenie (segmenty rdzenia)',
  branchOf: 'Odchodzi od',
  branches: 'Gałęzie',
  innervates: 'Unerwia',
  supplies: 'Zaopatruje',
  tributaries: 'Dopływy',
  drainsFrom: 'Zbiera krew z',
  drainsTo: 'Uchodzi do',
  bones: 'Kości',
  movements: 'Ruchy',
  system: 'Układ',
  partOf: 'Część',
  precursor: 'Rozwija się z',
}

export const FACT_ORDER = Object.keys(FACT_LABELS)

// Sentences picked from the Polish Wikipedia article (key -> heading).
export const PL_FACT_LABELS = {
  attachments: 'Przyczepy',
  function: 'Czynność',
  nerve: 'Unerwienie',
  artery: 'Unaczynienie',
}

export const SIDE_LABELS = { l: 'Strona lewa', r: 'Strona prawa' }
