/**
 * Katalog suplemenata za „Moj stack" (100 stavki).
 *
 * Generisano jednokratno iz docs/superpowers/specs/2026-10-19-moj-stack-katalog-predlog.md;
 * od sada se menja RUČNO. Ključevi su STABILNI — upisani su u `user_supplements.catalog_key`
 * i ne preimenuju se. Novi suplement = novi unos ovde (deploy, bez migracije). Ključ koji
 * se ikad izbaci ostaje u bazi i admin ga vidi kao sirov ključ.
 *
 * ZenFlow NIJE u katalogu (prati se protokolom). Čist modul: bez `server-only`.
 */

export const SUPPLEMENT_CATEGORIES = [
  { id: 'vitamins', label: 'Vitamini' },
  { id: 'minerals', label: 'Minerali' },
  { id: 'sport', label: 'Aminokiseline i sport' },
  { id: 'fats', label: 'Masne kiseline' },
  { id: 'focus', label: 'Fokus i nootropici' },
  { id: 'sleep', label: 'San i smirenje' },
  { id: 'joints', label: 'Zglobovi, koža, kosa' },
  { id: 'gut', label: 'Imunitet i creva' },
  { id: 'metabolism', label: 'Srce i metabolizam' },
  { id: 'other', label: 'Energija i ostalo' },
] as const

export type SupplementCategory = (typeof SUPPLEMENT_CATEGORIES)[number]['id']

export interface CatalogItem {
  key: string
  label: string
  category: SupplementCategory
  /** Srpski/engleski nazivi i skraćenice za pretragu. */
  aliases: readonly string[]
}

export const SUPPLEMENT_CATALOG: readonly CatalogItem[] = [
  { key: 'vitamin_d3', label: 'Vitamin D3', category: 'vitamins', aliases: ['vitamin d', 'd3', 'holekalciferol', 'sunčani vitamin'] },
  { key: 'vitamin_c', label: 'Vitamin C', category: 'vitamins', aliases: ['c vitamin', 'askorbinska kiselina'] },
  { key: 'vitamin_b12', label: 'Vitamin B12', category: 'vitamins', aliases: ['b12', 'kobalamin', 'cijanokobalamin', 'metilkobalamin'] },
  { key: 'vitamin_b_complex', label: 'B kompleks', category: 'vitamins', aliases: ['b complex', 'vitamini b grupe'] },
  { key: 'vitamin_b6', label: 'Vitamin B6', category: 'vitamins', aliases: ['b6', 'piridoksin'] },
  { key: 'folate', label: 'Folna kiselina / folat', category: 'vitamins', aliases: ['b9', 'folat', 'metilfolat'] },
  { key: 'biotin', label: 'Biotin', category: 'vitamins', aliases: ['b7', 'vitamin h'] },
  { key: 'vitamin_k2', label: 'Vitamin K2', category: 'vitamins', aliases: ['k2', 'menahinon', 'mk-7'] },
  { key: 'multivitamin', label: 'Multivitamin', category: 'vitamins', aliases: ['multivitamini', 'multi', 'kompleks vitamina'] },
  { key: 'magnesium', label: 'Magnezijum', category: 'minerals', aliases: ['magnezium', 'magnesium', 'mg'] },
  { key: 'magnesium_glycinate', label: 'Magnezijum glicinat', category: 'minerals', aliases: ['magnezijum bisglicinat', 'mg glicinat'] },
  { key: 'magnesium_citrate', label: 'Magnezijum citrat', category: 'minerals', aliases: ['mg citrat'] },
  { key: 'magnesium_threonate', label: 'Magnezijum treonat', category: 'minerals', aliases: ['magtein', 'mg treonat', 'l-threonate'] },
  { key: 'zinc', label: 'Cink', category: 'minerals', aliases: ['zink', 'zinc', 'zn'] },
  { key: 'iron', label: 'Gvožđe', category: 'minerals', aliases: ['gvozdje', 'iron', 'fe', 'ferum'] },
  { key: 'calcium', label: 'Kalcijum', category: 'minerals', aliases: ['calcium', 'ca'] },
  { key: 'potassium', label: 'Kalijum', category: 'minerals', aliases: ['potassium', 'k'] },
  { key: 'selenium', label: 'Selen', category: 'minerals', aliases: ['selenium', 'se'] },
  { key: 'iodine', label: 'Jod', category: 'minerals', aliases: ['iodine'] },
  { key: 'chromium', label: 'Hrom', category: 'minerals', aliases: ['chromium', 'krom pikolinat'] },
  { key: 'electrolytes', label: 'Elektroliti', category: 'minerals', aliases: ['electrolytes', 'soli', 'mineralni prah'] },
  { key: 'creatine', label: 'Kreatin', category: 'sport', aliases: ['creatine', 'kreatin monohidrat', 'monohidrat'] },
  { key: 'whey_protein', label: 'Whey protein', category: 'sport', aliases: ['protein', 'surutka', 'proteini', 'whey', 'izolat'] },
  { key: 'plant_protein', label: 'Biljni protein', category: 'sport', aliases: ['vegan protein', 'protein graška', 'soja protein'] },
  { key: 'collagen', label: 'Kolagen', category: 'sport', aliases: ['collagen', 'kolagen peptidi', 'hidrolizovani kolagen'] },
  { key: 'bcaa', label: 'BCAA', category: 'sport', aliases: ['aminokiseline razgranatog lanca', 'leucin'] },
  { key: 'eaa', label: 'EAA', category: 'sport', aliases: ['esencijalne aminokiseline', 'amino kiseline'] },
  { key: 'glutamine', label: 'Glutamin', category: 'sport', aliases: ['l-glutamin', 'glutamine'] },
  { key: 'l_arginine', label: 'L-arginin', category: 'sport', aliases: ['arginin', 'arginine'] },
  { key: 'citrulline', label: 'Citrulin', category: 'sport', aliases: ['l-citrulin', 'citrulline malat'] },
  { key: 'beta_alanine', label: 'Beta-alanin', category: 'sport', aliases: ['beta alanine'] },
  { key: 'taurine', label: 'Taurin', category: 'sport', aliases: ['taurine'] },
  { key: 'glycine', label: 'Glicin', category: 'sport', aliases: ['glycine'] },
  { key: 'l_carnitine', label: 'L-karnitin', category: 'sport', aliases: ['karnitin', 'carnitine', 'acetil-l-karnitin'] },
  { key: 'nac', label: 'NAC', category: 'sport', aliases: ['n-acetil cistein', 'acetilcistein'] },
  { key: 'l_tyrosine', label: 'L-tirozin', category: 'sport', aliases: ['tirozin', 'tyrosine'] },
  { key: 'hmb', label: 'HMB', category: 'sport', aliases: ['beta-hidroksi beta-metilbutirat'] },
  { key: 'pre_workout', label: 'Pre-workout', category: 'sport', aliases: ['pred trening', 'pre workout', 'preworkout'] },
  { key: 'omega3', label: 'Omega-3', category: 'fats', aliases: ['riblje ulje', 'fish oil', 'epa', 'dha', 'omega 3'] },
  { key: 'krill_oil', label: 'Krill ulje', category: 'fats', aliases: ['krill'] },
  { key: 'algae_omega3', label: 'Omega-3 iz algi', category: 'fats', aliases: ['vegan omega', 'algae oil', 'algal'] },
  { key: 'mct_oil', label: 'MCT ulje', category: 'fats', aliases: ['mct', 'kokosovo ulje'] },
  { key: 'caffeine', label: 'Kofein', category: 'focus', aliases: ['caffeine', 'tablete kofeina'] },
  { key: 'l_theanine', label: 'L-teanin', category: 'focus', aliases: ['teanin', 'theanine'] },
  { key: 'ashwagandha', label: 'Ashwagandha', category: 'focus', aliases: ['ašvagandha', 'ashvaganda', 'withania', 'indijski žen-šen'] },
  { key: 'rhodiola', label: 'Rodiola', category: 'focus', aliases: ['rhodiola', 'rodiola roza'] },
  { key: 'lions_mane', label: 'Lion\'s mane', category: 'focus', aliases: ['lavlja griva', 'hericium', 'yamabushitake'] },
  { key: 'bacopa', label: 'Bakopa', category: 'focus', aliases: ['bacopa', 'brahmi'] },
  { key: 'ginkgo', label: 'Ginkgo biloba', category: 'focus', aliases: ['ginko', 'ginkgo'] },
  { key: 'panax_ginseng', label: 'Žen-šen', category: 'focus', aliases: ['ginseng', 'panax', 'korejski žen-šen'] },
  { key: 'alpha_gpc', label: 'Alpha-GPC', category: 'focus', aliases: ['alfa gpc', 'alpha gpc'] },
  { key: 'citicoline', label: 'Citikolin', category: 'focus', aliases: ['citicoline', 'cdp-holin'] },
  { key: 'phosphatidylserine', label: 'Fosfatidilserin', category: 'focus', aliases: ['phosphatidylserine', 'ps'] },
  { key: 'cordyceps', label: 'Kordiceps', category: 'focus', aliases: ['cordyceps'] },
  { key: 'melatonin', label: 'Melatonin', category: 'sleep', aliases: ['melatonin', 'za spavanje'] },
  { key: 'valerian', label: 'Valerijana', category: 'sleep', aliases: ['valerian', 'odoljen'] },
  { key: 'passionflower', label: 'Pasiflora', category: 'sleep', aliases: ['passiflora', 'passionflower'] },
  { key: 'chamomile', label: 'Kamilica', category: 'sleep', aliases: ['chamomile'] },
  { key: 'lemon_balm', label: 'Matičnjak', category: 'sleep', aliases: ['maticnjak', 'melisa', 'lemon balm'] },
  { key: 'five_htp', label: '5-HTP', category: 'sleep', aliases: ['5htp', 'hidroksitriptofan', 'grifonija'] },
  { key: 'gaba', label: 'GABA', category: 'sleep', aliases: ['gama-aminobuterna kiselina'] },
  { key: 'saffron', label: 'Šafran', category: 'sleep', aliases: ['safran', 'saffron'] },
  { key: 'reishi', label: 'Reishi', category: 'sleep', aliases: ['ganoderma', 'reishi gljiva'] },
  { key: 'glucosamine', label: 'Glukozamin', category: 'joints', aliases: ['glucosamine'] },
  { key: 'chondroitin', label: 'Hondroitin', category: 'joints', aliases: ['chondroitin'] },
  { key: 'msm', label: 'MSM', category: 'joints', aliases: ['metilsulfonilmetan'] },
  { key: 'hyaluronic_acid', label: 'Hijaluronska kiselina', category: 'joints', aliases: ['hyaluronic', 'hijaluron'] },
  { key: 'curcumin', label: 'Kurkumin', category: 'joints', aliases: ['kurkuma', 'curcumin', 'turmeric'] },
  { key: 'boswellia', label: 'Bosvelija', category: 'joints', aliases: ['boswellia', 'tamjan'] },
  { key: 'hair_skin_nails', label: 'Kosa, koža i nokti', category: 'joints', aliases: ['hair skin nails', 'formula za kosu'] },
  { key: 'silica', label: 'Silicijum', category: 'joints', aliases: ['silica', 'silicijum dioksid', 'bambus'] },
  { key: 'astaxanthin', label: 'Astaksantin', category: 'joints', aliases: ['astaxanthin'] },
  { key: 'probiotic', label: 'Probiotik', category: 'gut', aliases: ['probiotici', 'probiotic', 'laktobacil'] },
  { key: 'prebiotic', label: 'Prebiotik', category: 'gut', aliases: ['prebiotici', 'inulin'] },
  { key: 'psyllium', label: 'Psilijum', category: 'gut', aliases: ['psyllium', 'vlakna'] },
  { key: 'digestive_enzymes', label: 'Digestivni enzimi', category: 'gut', aliases: ['enzimi', 'varenje', 'digestive enzymes'] },
  { key: 'elderberry', label: 'Zova', category: 'gut', aliases: ['bazga', 'elderberry', 'sambucus'] },
  { key: 'echinacea', label: 'Ehinacea', category: 'gut', aliases: ['echinacea'] },
  { key: 'propolis', label: 'Propolis', category: 'gut', aliases: ['propolis'] },
  { key: 'quercetin', label: 'Kvercetin', category: 'gut', aliases: ['quercetin'] },
  { key: 'black_seed', label: 'Crni kim', category: 'gut', aliases: ['nigella', 'black seed', 'crno seme'] },
  { key: 'coq10', label: 'Koenzim Q10', category: 'metabolism', aliases: ['q10', 'coq10', 'ubikinol', 'ubiquinol'] },
  { key: 'berberine', label: 'Berberin', category: 'metabolism', aliases: ['berberine'] },
  { key: 'alpha_lipoic_acid', label: 'Alfa-lipoična kiselina', category: 'metabolism', aliases: ['ala', 'alpha lipoic'] },
  { key: 'inositol', label: 'Inozitol', category: 'metabolism', aliases: ['inositol', 'myo-inositol'] },
  { key: 'apple_cider_vinegar', label: 'Jabukovo sirće', category: 'metabolism', aliases: ['apple cider vinegar', 'acv'] },
  { key: 'green_tea_extract', label: 'Ekstrakt zelenog čaja', category: 'metabolism', aliases: ['green tea', 'egcg', 'zeleni čaj'] },
  { key: 'resveratrol', label: 'Resveratrol', category: 'metabolism', aliases: ['resveratrol'] },
  { key: 'nattokinase', label: 'Nattokinaza', category: 'metabolism', aliases: ['nattokinase'] },
  { key: 'spirulina', label: 'Spirulina', category: 'metabolism', aliases: ['spirulina'] },
  { key: 'chlorella', label: 'Hlorela', category: 'metabolism', aliases: ['chlorella'] },
  { key: 'greens_powder', label: 'Greens prah', category: 'metabolism', aliases: ['zeleni prah', 'super greens'] },
  { key: 'lutein', label: 'Lutein', category: 'metabolism', aliases: ['lutein', 'zeaksantin', 'za oči'] },
  { key: 'nmn', label: 'NMN', category: 'other', aliases: ['nikotinamid mononukleotid'] },
  { key: 'pqq', label: 'PQQ', category: 'other', aliases: ['pirokinolin hinon'] },
  { key: 'maca', label: 'Maka', category: 'other', aliases: ['maca'] },
  { key: 'shilajit', label: 'Šilađit', category: 'other', aliases: ['shilajit'] },
  { key: 'tongkat_ali', label: 'Tongkat ali', category: 'other', aliases: ['tongkat', 'longjack'] },
  { key: 'fenugreek', label: 'Piskavica', category: 'other', aliases: ['fenugreek', 'piskavica'] },
  { key: 'vitex', label: 'Konopljika', category: 'other', aliases: ['vitex', 'agnus castus', 'monk\'s pepper'] },
]

const BY_KEY = new Map(SUPPLEMENT_CATALOG.map((i) => [i.key, i]))

export function getCatalogItem(key: string): CatalogItem | undefined {
  return BY_KEY.get(key)
}

export function isCatalogKey(key: string): boolean {
  return BY_KEY.has(key)
}

/** Naziv za prikaz: kataloški naziv, sirov ključ (izbačen iz kataloga) ili slobodan unos. */
export function supplementDisplayName(catalogKey: string | null, customName: string | null): string {
  if (catalogKey !== null) return BY_KEY.get(catalogKey)?.label ?? catalogKey
  return customName ?? ''
}
