/**
 * Address Formatter Utility
 * Formats German addresses into proper two-line format:
 * - Street address on first line
 * - Postal code and city on second line
 * 
 * Handles various input formats:
 * - "Hauptstrasse 5 12345 Berlin" -> "Hauptstrasse 5\n12345 Berlin"
 * - "12345 Berlin Hauptstrasse 5" -> "Hauptstrasse 5\n12345 Berlin"
 * - "Musterstrasse12,12345Hamburg" -> "Musterstrasse 12\n12345 Hamburg"
 */

/**
 * Format an address string into proper two-line format
 * @param {string} addressString - The raw address string
 * @returns {string} - Formatted address with line breaks
 */
// function formatAddress(addressString) {
//     if (!addressString || typeof addressString !== 'string') {
//         return "Adresse nicht verfügbar";
//     }

//     // Step 1: Normalize - add spaces around numbers and letters where needed
//     // "Musterstrasse12,12345Hamburg" -> "Musterstrasse 12, 12345 Hamburg"
//     let normalized = addressString.trim()
//         .replace(/([a-zA-ZäöüßÄÖÜ])(\d)/g, '$1 $2') // Letter followed by digit: "strasse12" -> "strasse 12"
//         .replace(/(\d)([a-zA-ZäöüßÄÖÜ])/g, '$1 $2') // Digit followed by letter: "12345Hamburg" -> "12345 Hamburg"
//         .replace(/\s+/g, ' ') // Replace multiple spaces with single space
//         .replace(/,(\S)/g, ', $1') // Add space after comma if missing
//         .replace(/(\S),/g, '$1, '); // Add space before comma if missing

//     // Remove commas for easier parsing (we've normalized spacing)
//     normalized = normalized.replace(/,/g, ' ').trim();

//     // Step 2: Find postal code (German postal codes are exactly 5 digits, may have spaces like "12 345")
//     // Pattern: 5 digits total, possibly split (e.g., "12 345" or "12345")
//     const postalCodePattern = /\b(\d{1,2}\s?\d{3,4})\b/; // Matches 12345, 12 345, etc. (with word boundaries)
//     const postalCodeMatch = normalized.match(postalCodePattern);

//     if (!postalCodeMatch) {
//         // No postal code found, return as-is
//         console.log('⚠️ No postal code found in address:', addressString);
//         return addressString;
//     }

//     const postalCodeRaw = postalCodeMatch[0].replace(/\s/g, ''); // Remove spaces: "12 345" -> "12345"
//     const postalCodeIndex = normalized.indexOf(postalCodeMatch[0]);

//     // Step 3: Determine format and extract components
//     const beforePostalCode = normalized.substring(0, postalCodeIndex).trim();
//     const afterPostalCode = normalized.substring(postalCodeIndex + postalCodeMatch[0].length).trim();

//     let street = '';
//     let city = '';

//     // Case 1: Postal code is at the start (e.g., "12345 Berlin Hauptstrasse 5")
//     if (!beforePostalCode && afterPostalCode) {
//         const afterParts = afterPostalCode.split(/\s+/).filter(p => p.length > 0);
//         if (afterParts.length >= 2) {
//             // First word after postal code is usually city, rest is street
//             city = afterParts[0];
//             street = afterParts.slice(1).join(' ');
//         } else if (afterParts.length === 1) {
//             // Only city provided
//             city = afterParts[0];
//         }
//     }
//     // Case 2: Postal code is in the middle (e.g., "Hauptstrasse 5 12345 Berlin")
//     else if (beforePostalCode && afterPostalCode) {
//         // Street is before postal code, city is after
//         street = beforePostalCode;
//         city = afterPostalCode;
//     }
//     // Case 3: Only street and postal code (e.g., "Hauptstrasse 5 12345")
//     else if (beforePostalCode && !afterPostalCode) {
//         street = beforePostalCode;
//     }

//     // Step 4: Normalize street address (clean up spacing)
//     street = street.replace(/\s+/g, ' ').trim();

//     // Step 5: Format postal code to exactly 5 digits (pad with zeros if needed, but typically it's already 5)
//     let formattedPostalCode = postalCodeRaw;
//     if (formattedPostalCode.length < 5) {
//         formattedPostalCode = formattedPostalCode.padStart(5, '0');
//     } else if (formattedPostalCode.length > 5) {
//         formattedPostalCode = formattedPostalCode.substring(0, 5);
//     }

//     // Step 6: Build final formatted address
//     if (street && city) {
//         const formatted = `${street}\n${formattedPostalCode} ${city}`;
//         console.log(`✅ Formatted address: "${addressString}" -> "${formatted.replace(/\n/g, '\\n')}"`);
//         return formatted;
//     } else if (city) {
//         // Only postal code + city
//         const formatted = `${formattedPostalCode} ${city}`;
//         console.log(`✅ Formatted address (postal+city only): "${addressString}" -> "${formatted}"`);
//         return formatted;
//     } else if (street) {
//         // Only street + postal code
//         const formatted = `${street}\n${formattedPostalCode}`;
//         console.log(`✅ Formatted address (street+postal only): "${addressString}" -> "${formatted.replace(/\n/g, '\\n')}"`);
//         return formatted;
//     } else {
//         // Fallback: return original
//         console.log('⚠️ Could not properly parse address, returning as-is:', addressString);
//         return addressString;
//     }
// }

function formatAddress(addressString) {
    if (!addressString || typeof addressString !== 'string') {
        return "Adresse nicht verfügbar";
    }

    // Normalize spacing and remove unwanted commas/spaces
    const cleaned = addressString
        .replace(/\s+/g, ' ') // collapse multiple spaces
        .replace(/,\s*/g, ', ') // normalize commas
        .trim();

    // Match pattern: Street + number, optional comma, postal code + city
    // e.g. "Steindamm 71, 20099 Hamburg"
    const match = cleaned.match(/^(.+?),?\s*(\d{5})\s+(.+)$/);

    if (match) {
        const [, street, postalCode, city] = match;
        return `${street}\n${postalCode} ${city}`;
    }

    // If it doesn’t match the pattern, just return as-is (with nice spacing)
    return cleaned;
}


module.exports = {
    formatAddress
};

