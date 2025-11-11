#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

// Template path
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'Nullplan_Text_Template.docx');
const OUTPUT_FILE = path.join(__dirname, 'nullplan-template-variables-clean.json');

async function analyzeTemplate() {
    console.log('Analyzing Nullplan template:', TEMPLATE_PATH);
    
    try {
        // Check if template exists
        if (!fs.existsSync(TEMPLATE_PATH)) {
            throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
        }
        
        // Read the Word document as a zip file
        const content = fs.readFileSync(TEMPLATE_PATH);
        const zip = new PizZip(content);
        
        // Extract document.xml content
        let documentXml;
        try {
            documentXml = zip.file('word/document.xml').asText();
        } catch (error) {
            throw new Error('Could not find document.xml in the Word template');
        }
        
        // Save raw XML for debugging
        fs.writeFileSync(path.join(__dirname, 'nullplan-template-raw-v2.xml'), documentXml);
        
        // Clean the XML by removing Word formatting and focus on actual text content
        const cleanedXml = cleanWordXml(documentXml);
        fs.writeFileSync(path.join(__dirname, 'nullplan-template-cleaned.txt'), cleanedXml);
        
        // Find variables using more targeted patterns
        const variables = new Set();
        
        // Pattern 1: Look for variables in angle brackets or quotes in clean text
        const patterns = [
            /«([^»]+)»/g,                    // Angle brackets (merge fields)
            /\{([^}]+)\}/g,                  // Curly braces
            /\[([^\]]+)\]/g,                 // Square brackets
            /\$\{([^}]+)\}/g,                // Dollar notation
            /\{\{([^}]+)\}\}/g,              // Double curly braces
            /%([^%]+)%/g,                    // Percent notation
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(cleanedXml)) !== null) {
                const variable = match[1].trim();
                if (variable.length > 0 && !isXmlArtifact(variable)) {
                    variables.add(variable);
                }
            }
        });
        
        // Also search the original XML for MERGEFIELD patterns
        const mergeFieldPattern = /MERGEFIELD\s+"?([^"\s\\]+)"?/gi;
        let match;
        while ((match = mergeFieldPattern.exec(documentXml)) !== null) {
            const variable = match[1].trim();
            if (variable.length > 0 && !isXmlArtifact(variable)) {
                variables.add(variable);
            }
        }
        
        // Look for docxtemplater style variables in clean text
        const docxTemplaterPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}/g;
        while ((match = docxTemplaterPattern.exec(cleanedXml)) !== null) {
            variables.add(match[1]);
        }
        
        // Manual search for common variable patterns in German templates
        const germanVariablePatterns = [
            /([A-ZÄÖÜ][a-zäöüß]*(?:\s+[A-ZÄÖÜ][a-zäöüß]*)*)\s*:/g,  // German labels ending with colon
            /"([A-ZÄÖÜ][a-zA-ZäöüßÄÖÜ\s]+)"/g,                     // Quoted German text that might be variables
        ];
        
        germanVariablePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(cleanedXml)) !== null) {
                const variable = match[1].trim();
                if (isLikelyVariable(variable)) {
                    variables.add(variable);
                }
            }
        });
        
        // Convert to array and sort
        const variableList = Array.from(variables).sort();
        
        // Create analysis report
        const report = {
            templatePath: TEMPLATE_PATH,
            analyzedAt: new Date().toISOString(),
            totalVariablesFound: variableList.length,
            variables: variableList,
            variablesByCategory: categorizeVariables(variableList),
            rawXmlLength: documentXml.length,
            cleanedTextLength: cleanedXml.length
        };
        
        // Save report
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
        
        // Print results
        console.log('\n=== NULLPLAN TEMPLATE ANALYSIS RESULTS (CLEANED) ===\n');
        console.log(`Total variables found: ${variableList.length}`);
        console.log('\nAll variables (alphabetically sorted):');
        variableList.forEach((v, i) => {
            console.log(`  ${i + 1}. "${v}"`);
        });
        
        console.log('\nVariables by category:');
        Object.entries(report.variablesByCategory).forEach(([category, vars]) => {
            if (vars.length > 0) {
                console.log(`\n${category}: (${vars.length} variables)`);
                vars.forEach(v => console.log(`  - "${v}"`));
            }
        });
        
        console.log(`\nAnalysis saved to: ${OUTPUT_FILE}`);
        console.log(`Raw XML saved to: nullplan-template-raw-v2.xml`);
        console.log(`Cleaned text saved to: nullplan-template-cleaned.txt`);
        
        // Search for specific text patterns that might contain variables
        console.log('\n=== SEARCHING FOR POTENTIAL VARIABLE CONTEXTS ===\n');
        searchForVariableContexts(cleanedXml);
        
    } catch (error) {
        console.error('Error analyzing template:', error);
        process.exit(1);
    }
}

function cleanWordXml(xml) {
    // Remove XML namespaces and complex formatting
    let cleaned = xml
        .replace(/<w:rPr>.*?<\/w:rPr>/g, '') // Remove run properties
        .replace(/<w:pPr>.*?<\/w:pPr>/g, '') // Remove paragraph properties
        .replace(/<w:r><w:t[^>]*>/g, '')     // Remove run and text start tags
        .replace(/<\/w:t><\/w:r>/g, ' ')     // Replace end tags with space
        .replace(/<w:t[^>]*>/g, '')          // Remove text start tags
        .replace(/<\/w:t>/g, ' ')            // Replace text end tags with space
        .replace(/<[^>]+>/g, ' ')            // Remove all remaining XML tags
        .replace(/&quot;/g, '"')             // Replace HTML entities
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')                // Normalize whitespace
        .trim();
    
    return cleaned;
}

function isXmlArtifact(text) {
    // Filter out XML artifacts, numbers, and formatting codes
    const artifacts = [
        /^\d+$/,                             // Pure numbers
        /^[\d\.,\-]+$/,                      // Numbers with punctuation
        /^[#\-\.\,\s]+$/,                    // Formatting characters
        /^[a-z]{1,3}$/,                      // Short lowercase (likely attributes)
        /^(true|false|left|right|center|auto|none|solid|single)$/i, // Common attributes
        /^http/i,                            // URLs
        /^urn:/i,                            // URNs
        /^rId\d+$/,                          // Relationship IDs
        /^w\d+$/,                            // Word namespace
        /position:|margin-|width:|height:/,   // CSS-like
        /^\d+pt$/,                           // Point measurements
    ];
    
    return artifacts.some(pattern => pattern.test(text));
}

function isLikelyVariable(text) {
    // Check if text looks like a variable name rather than regular content
    if (text.length < 3 || text.length > 50) return false;
    
    const likelyVariables = [
        /^[A-ZÄÖÜ][a-zA-ZäöüßÄÖÜ\s]*$/,     // German capitalized words
        /name|datum|adresse|telefon|email|betrag|summe|nummer/i, // Common German variable terms
        /kunde|mandant|gläubiger|forderung|schuld/i,             // Domain specific terms
    ];
    
    return likelyVariables.some(pattern => pattern.test(text));
}

function categorizeVariables(variables) {
    const categories = {
        kunde: [],
        mandant: [],
        gläubiger: [],
        forderung: [],
        datum: [],
        betrag: [],
        adresse: [],
        other: []
    };
    
    variables.forEach(v => {
        const lower = v.toLowerCase();
        if (lower.includes('kunde') || lower.includes('kunden')) {
            categories.kunde.push(v);
        } else if (lower.includes('mandant')) {
            categories.mandant.push(v);
        } else if (lower.includes('gläubiger') || lower.includes('creditor')) {
            categories.gläubiger.push(v);
        } else if (lower.includes('forderung') || lower.includes('schuld') || lower.includes('quote')) {
            categories.forderung.push(v);
        } else if (lower.includes('datum') || lower.includes('tag') || lower.includes('monat') || lower.includes('jahr')) {
            categories.datum.push(v);
        } else if (lower.includes('betrag') || lower.includes('summe') || lower.includes('euro') || lower.includes('€')) {
            categories.betrag.push(v);
        } else if (lower.includes('adresse') || lower.includes('straße') || lower.includes('plz') || lower.includes('ort')) {
            categories.adresse.push(v);
        } else {
            categories.other.push(v);
        }
    });
    
    return categories;
}

function searchForVariableContexts(text) {
    // Look for patterns that might indicate variable placeholders
    const patterns = [
        /"[^"]{10,}"/g,                      // Longer quoted strings
        /[A-ZÄÖÜ][a-zA-ZäöüßÄÖÜ\s]{5,}:/g,  // German labels with colons
        /\b[A-ZÄÖÜ][a-zA-ZäöüßÄÖÜ]+\b/g,     // Capitalized German words
    ];
    
    patterns.forEach((pattern, index) => {
        console.log(`\nPattern ${index + 1} matches:`);
        let match;
        const matches = [];
        while ((match = pattern.exec(text)) !== null) {
            matches.push(match[0]);
        }
        
        // Remove duplicates and show first 20
        const unique = [...new Set(matches)].slice(0, 20);
        unique.forEach(m => console.log(`  - ${m}`));
        
        if (matches.length > 20) {
            console.log(`  ... and ${matches.length - 20} more`);
        }
    });
}

// Run the analysis
analyzeTemplate();