// ═══════════════════════════════════════════════════════════════════════════════
// INSOLVENZANTRAG CHECKBOX KONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
// 
// ANLEITUNG:
// - Setze auf 'true' um Checkbox zu aktivieren ✓
// - Setze auf 'false' um Checkbox zu deaktivieren ✗
// - Basierend auf deinen bisherigen Anforderungen sind die wichtigsten bereits gesetzt
//
// GEFUNDEN: 286 Checkboxen im PDF
// ═══════════════════════════════════════════════════════════════════════════════

const checkboxConfig = {

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION II.1 - RESTSCHULDBEFREIUNGSANTRAG
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 1': true,    // ✓ "Ich stelle den Antrag auf Restschuldbefreiung" - IMMER GECHECKT

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION II.2.a) - ERKLÄRUNG ZUM RESTSCHULDBEFREIUNGSANTRAG
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 11': true,   // ✓ "bisher nicht gestellt habe" - IMMER GECHECKT (erste Bewerbung)
    'Kontrollkästchen 12': false,  // ✗ "bereits gestellt habe am" - NICHT GECHECKT

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION II.2.b) und II.2.c) - KOMPLETT LEER LASSEN (User Request)
    // ═══════════════════════════════════════════════════════════════════════════
    // Alle anderen II.2 Checkboxen bleiben auf false

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION III - ANLAGEN (ATTACHMENTS)
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 2': true,    // ✓ Personalbogen (Anlage 1)
    'Kontrollkästchen 3': true,    // ✓ Bescheinigung über das Scheitern (Anlage 2) 
    'Kontrollkästchen 4': true,    // ✓ Gründe für das Scheitern (Anlage 2A)
    'Kontrollkästchen 5': true,   // ✗ Abtretungserklärung (Anlage 3)
    'Kontrollkästchen 6': true,   // ✗ Vermögensübersicht (Anlage 4)
    'Kontrollkästchen 7': true,   // ✗ Vermögensverzeichnis (Anlage 5)
    'Kontrollkästchen 18': true,  // ✓ Gläubiger-/Forderungsverzeichnis (Anlage 6)
    'Kontrollkästchen 19': true,  // ✓ Schuldenbereinigungsplan Allgemein (Anlage 7)
    'Kontrollkästchen 20': false,  // ✗ Musterplan mit Einmalzahlung/festen Raten (Anlage 7A)
    'Kontrollkästchen 21': false,  // ✗ Erläuterungen (Anlage 7C)
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MUSTERPLAN OPTIONEN (Anlage 7A) - NUR EINE SOLLTE GECHECKT SEIN
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 31f': true,   // ✓ Musterplan mit flexiblen Raten (Anlage 7A) - USER REQUESTED
    'Kontrollkästchen 31j': false,  // ✗ Alternative flexible Option (falls vorhanden)

    // ═══════════════════════════════════════════════════════════════════════════
    // PERSONALBOGEN - GESCHLECHT (wird automatisch basierend auf formData.geschlecht gesetzt)
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 27': false,  // Geschlecht männlich (wird automatisch gesetzt)
    'Kontrollkästchen 28': false,  // Geschlecht weiblich (wird automatisch gesetzt)
    'Kontrollkästchen 29': false,  // Geschlecht divers (wird automatisch gesetzt)

    // ═══════════════════════════════════════════════════════════════════════════
    // FAMILIENSTAND (wird automatisch basierend auf formData.familienstand gesetzt)
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 23': false,  // Familienstand ledig (wird automatisch gesetzt)
    'Kontrollkästchen 24': false,  // Familienstand verheiratet (wird automatisch gesetzt)
    'Kontrollkästchen 25': false,  // Familienstand geschieden (wird automatisch gesetzt)
    'Kontrollkästchen 26': false,  // Familienstand verwitwet (wird automatisch gesetzt)

    // ═══════════════════════════════════════════════════════════════════════════
    // BERUFSSTATUS (wird automatisch basierend auf formData.berufsstatus gesetzt)
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 30': false,  // Beruf angestellt (wird automatisch gesetzt)
    'Kontrollkästchen 31': false,  // Beruf selbstständig (wird automatisch gesetzt)
    'Kontrollkästchen 32': false,  // Beruf arbeitslos (wird automatisch gesetzt)
    'Kontrollkästchen 33': false,  // Beruf rentner (wird automatisch gesetzt)

    // ═══════════════════════════════════════════════════════════════════════════
    // KINDER (wird automatisch basierend auf kinder_anzahl gesetzt)
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 35': false,  // Kinder ja (wird automatisch gesetzt)
    'Kontrollkästchen 36': false,  // Kinder nein (wird automatisch gesetzt)

    // ═══════════════════════════════════════════════════════════════════════════
    // UNTERHALTSBERECHTIGTE (wird automatisch basierend auf Kinder gesetzt)
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 22': false,  // Unterhaltsberechtigte ja (wird automatisch gesetzt)
    'Kontrollkästchen 30': false,  // Unterhaltsberechtigte nein (wird automatisch gesetzt)

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION V - VERSICHERUNG (BESTÄTIGUNG DER RICHTIGKEIT)
    // ═══════════════════════════════════════════════════════════════════════════
    // "Ich versichere die Richtigkeit und Vollständigkeit meiner Angaben zu Nummer II. 2."
    'Kontrollkästchen 298': true,   // ✓ Versicherung der Richtigkeit (V. Versicherung) - IMMER GECHECKT
    'Kontrollkästchen 299': false,  // Alternative Versicherungs-Option (falls vorhanden)
    
    // Krankenversicherung, Haftpflicht etc. (falls vorhanden, andere Sektion)
    'Kontrollkästchen 302': false,  // Krankenversicherung vorhanden (andere Sektion)
    'Kontrollkästchen 303': false,  // Krankenversicherung nicht vorhanden
    'Kontrollkästchen 304': false,  // Private Krankenversicherung
    'Kontrollkästchen 305': false,  // Keine Pflegeversicherung
    'Kontrollkästchen 306': false,  // Pflegeversicherung vorhanden
    'Kontrollkästchen 307': false,  // Haftpflichtversicherung nicht vorhanden
    'Kontrollkästchen 308': false,  // Haftpflichtversicherung vorhanden
    'Kontrollkästchen 309': false,  // Hausratversicherung nicht vorhanden
    'Kontrollkästchen 310': false,  // Hausratversicherung vorhanden
    'Kontrollkästchen 311': false,  // Weitere Versicherungen
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ALLE ANDEREN CHECKBOXEN - STANDARDMÄSSIG AUF FALSE
    // ═══════════════════════════════════════════════════════════════════════════
    // Du kannst beliebige der folgenden auf 'true' setzen, wenn du sie aktivieren möchtest:

    'Kontrollkästchen 10': false,
    'Kontrollkästchen 15': false,
    'Kontrollkästchen 16': false,
    'Kontrollkästchen 17': false,
    'Kontrollkästchen 31u': false,
    'Kontrollkästchen 31s': false,
    'Kontrollkästchen 31f': false,
    'Kontrollkästchen 31j': false,
    'Kontrollkästchen 32a': false,
    'Kontrollkästchen 34': false,
    'Kontrollkästchen 37': false,
    'Kontrollkästchen 38': false,
    'Kontrollkästchen 39': false,
    'Kontrollkästchen 40a': false,
    'Kontrollkästchen 40': false,
    'Kontrollkästchen 41a': false,
    'Kontrollkästchen 41': false,
    'Kontrollkästchen 42a': false,
    'Kontrollkästchen 42': false,
    'Kontrollkästchen 43a': false,
    'Kontrollkästchen 43': false,
    'Kontrollkästchen 44a': false,
    'Kontrollkästchen 44': false,
    'Kontrollkästchen 45a': false,
    'Kontrollkästchen 45': false,
    'Kontrollkästchen 46a': false,
    'Kontrollkästchen 46': false,
    'Kontrollkästchen 47a': false,
    'Kontrollkästchen 47': false,
    'Kontrollkästchen 48a': false,
    'Kontrollkästchen 48': false,
    'Kontrollkästchen 49a': false,
    'Kontrollkästchen 49': false,
    'Kontrollkästchen 50a': false,
    'Kontrollkästchen 50': false,
    'Kontrollkästchen 51a': false,
    'Kontrollkästchen 51': false,
    'Kontrollkästchen 52a': false,
    'Kontrollkästchen 52': false,
    'Kontrollkästchen 53a': false,
    'Kontrollkästchen 53': false,
    'Kontrollkästchen 54a': false,
    'Kontrollkästchen 54': false,
    'Kontrollkästchen 55a': false,
    'Kontrollkästchen 55': false,
    'Kontrollkästchen 56a': false,
    'Kontrollkästchen 56': false,
    'Kontrollkästchen 57a': false,
    'Kontrollkästchen 57': false,
    'Kontrollkästchen 58a': false,
    'Kontrollkästchen 58': false,
    'Kontrollkästchen 59a': false,
    'Kontrollkästchen 59': false,
    'Kontrollkästchen 60a': false,
    'Kontrollkästchen 60': false,
    'Kontrollkästchen 61a': false,
    'Kontrollkästchen 61': false,
    'Kontrollkästchen 62a': false,
    'Kontrollkästchen 62': false,
    'Kontrollkästchen 63a': false,
    'Kontrollkästchen 63': false,
    'Kontrollkästchen 64a': false,
    'Kontrollkästchen 64': false,
    'Kontrollkästchen 65a': false,
    'Kontrollkästchen 65': false,
    'Kontrollkästchen 66a': false,
    'Kontrollkästchen 66': false,
    'Kontrollkästchen 67a': false,
    'Kontrollkästchen 67': false,
    'Kontrollkästchen 68a': false,
    'Kontrollkästchen 68': false,
    'Kontrollkästchen 69a': false,
    'Kontrollkästchen 69': false,
    'Kontrollkästchen 70a': false,
    'Kontrollkästchen 70': false,
    'Kontrollkästchen 71a': false,
    'Kontrollkästchen 71': false,
    'Kontrollkästchen 72a': false,
    'Kontrollkästchen 72': false,
    'Kontrollkästchen 73a': false,
    'Kontrollkästchen 73': false,
    'Kontrollkästchen 74a': false,
    'Kontrollkästchen 74': false,
    'Kontrollkästchen 75a': false,
    'Kontrollkästchen 75': false,
    'Kontrollkästchen 76a': false,
    'Kontrollkästchen 76': false,
    'Kontrollkästchen 77a': false,
    'Kontrollkästchen 77': false,
    'Kontrollkästchen 78a': false,
    'Kontrollkästchen 78': false,
    'Kontrollkästchen 79a': false,
    'Kontrollkästchen 79': false,
    'Kontrollkästchen 80a': false,
    'Kontrollkästchen 80': false,
    'Kontrollkästchen 81a': false,
    'Kontrollkästchen 81': false,
    'Kontrollkästchen 82a': false,
    'Kontrollkästchen 82': false,
    'Kontrollkästchen 83a': false,
    'Kontrollkästchen 83': false,
    'Kontrollkästchen 84a': false,
    'Kontrollkästchen 84': false,
    'Kontrollkästchen 85a': false,
    'Kontrollkästchen 85': false,
    'Kontrollkästchen 86a': false,
    'Kontrollkästchen 86': false,
    'Kontrollkästchen 87a': false,
    'Kontrollkästchen 87': false,
    'Kontrollkästchen 88a': false,
    'Kontrollkästchen 88': false,
    'Kontrollkästchen 89a': false,
    'Kontrollkästchen 89': false,
    'Kontrollkästchen 90a': false,
    'Kontrollkästchen 90': false,
    'Kontrollkästchen 91a': false,
    'Kontrollkästchen 91': false,
    'Kontrollkästchen 92a': false,
    'Kontrollkästchen 92': false,
    'Kontrollkästchen 93a': false,
    'Kontrollkästchen 93': false,
    'Kontrollkästchen 94a': false,
    'Kontrollkästchen 94': false,
    'Kontrollkästchen 95a': false,
    'Kontrollkästchen 95': false,
    'Kontrollkästchen 96a': false,
    'Kontrollkästchen 96': false,
    'Kontrollkästchen 97a': false,
    'Kontrollkästchen 97': false,
    'Kontrollkästchen 98a': false,
    'Kontrollkästchen 98': false,
    'Kontrollkästchen 99a': false,
    'Kontrollkästchen 99': false,
    'Kontrollkästchen 100a': false,
    'Kontrollkästchen 100': false,
    'Kontrollkästchen 101a': false,
    'Kontrollkästchen 101': false,
    'Kontrollkästchen 102a': false,
    'Kontrollkästchen 102': false,
    'Kontrollkästchen 103a': false,
    'Kontrollkästchen 103': false,
    'Kontrollkästchen 104a': false,
    'Kontrollkästchen 104': false,
    'Kontrollkästchen 105a': false,
    'Kontrollkästchen 105': false,
    'Kontrollkästchen 106a': false,
    'Kontrollkästchen 106': false,
    'Kontrollkästchen 107a': false,
    'Kontrollkästchen 107': false,
    'Kontrollkästchen 108a': false,
    'Kontrollkästchen 108': false,
    'Kontrollkästchen 109a': false,
    'Kontrollkästchen 109': false,
    'Kontrollkästchen 110a': false,
    'Kontrollkästchen 110': false,
    'Kontrollkästchen 111a': false,
    'Kontrollkästchen 111': false,
    'Kontrollkästchen 112a': false,
    'Kontrollkästchen 112': false,
    'Kontrollkästchen 113a': false,
    'Kontrollkästchen 113': false,
    'Kontrollkästchen 114a': false,
    'Kontrollkästchen 114': false,
    'Kontrollkästchen 115a': false,
    'Kontrollkästchen 115': false,
    'Kontrollkästchen 116a': false,
    'Kontrollkästchen 116': false,
    'Kontrollkästchen 117a': false,
    'Kontrollkästchen 117': false,
    'Kontrollkästchen 118a': false,
    'Kontrollkästchen 118': false,
    'Kontrollkästchen 119a': false,
    'Kontrollkästchen 119': false,
    'Kontrollkästchen 120a': false,
    'Kontrollkästchen 120': false,
    'Kontrollkästchen 121a': false,
    'Kontrollkästchen 121': false,
    'Kontrollkästchen 122a': false,
    'Kontrollkästchen 122': false,
    'Kontrollkästchen 123a': false,
    'Kontrollkästchen 123': false,
    'Kontrollkästchen 124a': false,
    'Kontrollkästchen 124': false,
    'Kontrollkästchen 125a': false,
    'Kontrollkästchen 125': false,
    'Kontrollkästchen 126a': false,
    'Kontrollkästchen 126': false,
    'Kontrollkästchen 127a': false,
    'Kontrollkästchen 127': false,
    'Kontrollkästchen 128a': false,
    'Kontrollkästchen 128': false,
    'Kontrollkästchen 129a': false,
    'Kontrollkästchen 129': false,
    'Kontrollkästchen 130a': false,
    'Kontrollkästchen 130': false,
    'Kontrollkästchen 131a': false,
    'Kontrollkästchen 131': false,
    'Kontrollkästchen 132a': false,
    'Kontrollkästchen 132': false,
    'Kontrollkästchen 133a': false,
    'Kontrollkästchen 133': false,
    'Kontrollkästchen 134a': false,
    'Kontrollkästchen 134': false,
    'Kontrollkästchen 135a': false,
    'Kontrollkästchen 135': false,
    'Kontrollkästchen 136a': false,
    'Kontrollkästchen 136': false,
    'Kontrollkästchen 137a': false,
    'Kontrollkästchen 137': false,
    'Kontrollkästchen 138a': false,
    'Kontrollkästchen 138': false,
    'Kontrollkästchen 139a': false,
    'Kontrollkästchen 139': false,
    'Kontrollkästchen 140a': false,
    'Kontrollkästchen 140': false,
    'Kontrollkästchen 141a': false,
    'Kontrollkästchen 141': false,
    'Kontrollkästchen 142a': false,
    'Kontrollkästchen 142': false,
    'Kontrollkästchen 143a': false,
    'Kontrollkästchen 143': false,
    'Kontrollkästchen 144a': false,
    'Kontrollkästchen 144': false,
    'Kontrollkästchen 145a': false,
    'Kontrollkästchen 145': false,
    'Kontrollkästchen 146a': false,
    'Kontrollkästchen 146': false,
    'Kontrollkästchen 147a': false,
    'Kontrollkästchen 147': false,
    'Kontrollkästchen 148a': false,
    'Kontrollkästchen 148': false,
    'Kontrollkästchen 149a': false,
    'Kontrollkästchen 149': false,
    'Kontrollkästchen 150a': false,
    'Kontrollkästchen 150': false,
    'Kontrollkästchen 151a': false,
    'Kontrollkästchen 151': false,
    'Kontrollkästchen 152a': false,
    'Kontrollkästchen 152': false,
    'Kontrollkästchen 153a': false,
    'Kontrollkästchen 153': false,
    'Kontrollkästchen 154a': false,
    'Kontrollkästchen 154': false,
    'Kontrollkästchen 155a': false,
    'Kontrollkästchen 155': false,
    'Kontrollkästchen 156a': false,
    'Kontrollkästchen 156': false,
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HÖHERE CHECKBOX-NUMMERN (300er-Bereich) - Verschiedene PDF-Abschnitte
    // ═══════════════════════════════════════════════════════════════════════════
    'Kontrollkästchen 279': false,
    'Kontrollkästchen 280': false,
    'Kontrollkästchen 281': false,
    'Kontrollkästchen 282': false,
    'Kontrollkästchen 283': false,
    'Kontrollkästchen 284': false,
    'Kontrollkästchen 285': false,
    'Kontrollkästchen 286': false,
    'Kontrollkästchen 287': false,
    'Kontrollkästchen 288': false,
    'Kontrollkästchen 289': false,
    'Kontrollkästchen 290': false,
    'Kontrollkästchen 291': false,
    // 'Kontrollkästchen 298': false, // Bereits oben als V. Versicherung definiert
    // 'Kontrollkästchen 299': false, // Bereits oben als V. Versicherung definiert
    'Kontrollkästchen 312': false,
    'Kontrollkästchen 313': false,
    'Kontrollkästchen 314': false,
    'Kontrollkästchen 315': false,
    'Kontrollkästchen 316': false,
    'Kontrollkästchen 317': false,
    'Kontrollkästchen 318': false,
    'Kontrollkästchen 319': false,
    'Kontrollkästchen 320': false,
    'Kontrollkästchen 321': false,
    'Kontrollkästchen 322': false,
    'Kontrollkästchen 323': false,
    'Kontrollkästchen 324': false,
    'Kontrollkästchen 325': false,
    'Kontrollkästchen 326': false,
    'Kontrollkästchen 327': false,
    'Kontrollkästchen 330': false,
    'Kontrollkästchen 331': false,
    'Kontrollkästchen 332': false,
    'Kontrollkästchen 333': false,
    'Kontrollkästchen 334': false,
    'Kontrollkästchen 335': false,
    'Kontrollkästchen 336': false,
    'Kontrollkästchen 337': false,
    'Kontrollkästchen 338': false,
    'Kontrollkästchen 340': false,
    'Kontrollkästchen 341': false,
    'Kontrollkästchen 342': false,
    'Kontrollkästchen 343': false,
    'Kontrollkästchen 344': false,
    'Kontrollkästchen 345': false,
    'Kontrollkästchen 346': false,
    'Kontrollkästchen 347': false,
    'Kontrollkästchen 348': false,
    'Kontrollkästchen 349': false,
    'Kontrollkästchen 350': false,
    'Kontrollkästchen 351': false,
    'Kontrollkästchen 352': false,
    'Kontrollkästchen 353': false,
    'Kontrollkästchen 354': false,
    'Kontrollkästchen 355': false,
    'Kontrollkästchen 356': false,
    'Kontrollkästchen 357': false,
    'Kontrollkästchen 358': false,
    'Kontrollkästchen 359': false,
    'Kontrollkästchen 360': false,
    'Kontrollkästchen 361': false,
    'Kontrollkästchen 362': false,
    'Kontrollkästchen 362a': false,
    'Kontrollkästchen 366': false,
    'Kontrollkästchen 367': false,
    'Kontrollkästchen 368': false,
    'Kontrollkästchen 369': false,
    'Kontrollkästchen 370': false,
    'Kontrollkästchen 371': false,
    'Kontrollkästchen 372': false,
    'Kontrollkästchen 373': false,
    'Kontrollkästchen 374': false,
    'Kontrollkästchen 375': false,
    'Kontrollkästchen 376': false,
    'Kontrollkästchen 377': false,
    'Kontrollkästchen 378': false,
    'Kontrollkästchen 379': false,
    'Kontrollkästchen 380': false,
    'Kontrollkästchen 381': false,
    'Kontrollkästchen 382': false,
    'Kontrollkästchen 383': false,
    'Kontrollkästchen 384': false,
    'Kontrollkästchen 385': false,
    'Kontrollkästchen 386': false,
    'Kontrollkästchen 387': false
};

// ═══════════════════════════════════════════════════════════════════════════════
// VERWENDUNG IN QUICKFIELDMAPPER
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = checkboxConfig;