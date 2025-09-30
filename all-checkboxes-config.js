// ALLE CHECKBOXEN DES INSOLVENZANTRAG PDFs
// Gefunden: 286 Checkboxen
// 
// ANLEITUNG:
// - Setze auf 'true' um Checkbox zu aktivieren
// - Setze auf 'false' um Checkbox zu deaktivieren
// - Du kannst beliebige Checkboxen ein/ausschalten

const allCheckboxSettings = {
    'Kontrollkästchen 1': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 2': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 3': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 4': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 5': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 6': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 7': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 10': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 11': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 15': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 16': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 17': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 18': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 19': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 20': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 21': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 22': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 23': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 24': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 25': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 26': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 27': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 28': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 29': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 30': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 31u': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 31s': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 31f': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 31j': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 32': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 32a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 33': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 34': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 35': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 36': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 37': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 38': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 39': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 40a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 40': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 41a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 41': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 42a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 42': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 43a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 43': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 44a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 44': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 45a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 45': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 46a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 46': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 47a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 47': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 48a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 48': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 49a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 49': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 50a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 50': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 51a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 51': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 52a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 52': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 53a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 53': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 54a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 54': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 55a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 55': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 56a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 56': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 57a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 57': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 58a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 58': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 59a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 59': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 60a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 60': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 61': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 63': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 64': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 62': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 65': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 66': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 67': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 68': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 69': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 71': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 72': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 73': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 74': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 75': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 76': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 77': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 78': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 79': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 80': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 81': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 82': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 83': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 85': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 87': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 89': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 84': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 86': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 88': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 90': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 91': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 92': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 93': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 94': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 95': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 96': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 97': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 98': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 99': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 100': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 101': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 102': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 103': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 104': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 105': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 106': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 107': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 108': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 109': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 110': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 111': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 112': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 113': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 114': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 115': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 116': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 117': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 118': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 119': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 120': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 121': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 122': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 123': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 124': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 125': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 126': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 127': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 128': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 129': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 130': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 131': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 132': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 133': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 134': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 135': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 136': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 137': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 138': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 138a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 139': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 139a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 140': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 140a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 141': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 142': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 143': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 144': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 145': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 146': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 147': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 148': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 149': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 150': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 151': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 152': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 153': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 154': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 155': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 156': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 157': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 158': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 159': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 270': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 271': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 272': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 273': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 274': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 275': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 276': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 277': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 278': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 279': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 280': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 281': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 282': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 283': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 284': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 285': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 286': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 287': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 288': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 289': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 290': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 291': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 298': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 299': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 302': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 303': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 304': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 305': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 306': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 307': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 308': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 309': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 310': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 311': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 312': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 313': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 314': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 315': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 316': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 317': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 318': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 319': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 320': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 321': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 322': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 323': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 324': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 325': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 326': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 327': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 330': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 331': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 332': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 333': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 334': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 335': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 336': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 337': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 338': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 340': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 341': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 342': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 343': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 344': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 345': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 346': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 347': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 348': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 349': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 350': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 351': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 352': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 353': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 354': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 355': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 356': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 357': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 358': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 359': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 360': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 361': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 362': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 362a': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 366': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 367': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 368': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 369': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 370': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 371': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 372': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 373': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 374': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 375': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 376': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 377': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 378': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 379': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 380': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 381': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 382': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 383': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 384': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 385': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 386': false, // ✗ Aktuell nicht gecheckt
    'Kontrollkästchen 387': false, // ✗ Aktuell nicht gecheckt
};

// VERWENDUNG:
// const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
// 
// // In der fillWithRealFields Funktion:
// Object.entries(allCheckboxSettings).forEach(([checkboxName, shouldCheck]) => {
//     try {
//         const checkbox = form.getCheckBox(checkboxName);
//         if (shouldCheck) {
//             checkbox.check();
//             console.log(`✅ Checked: ${checkboxName}`);
//         } else {
//             checkbox.uncheck();
//             console.log(`✗ Unchecked: ${checkboxName}`);
//         }
//     } catch (error) {
//         console.log(`⚠️  Checkbox not found: ${checkboxName}`);
//     }
// });

module.exports = allCheckboxSettings;
