#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const xml2js = require('xml2js');

// Template path
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'Nullplan_Text_Template.docx');
const OUTPUT_FILE = path.join(__dirname, 'nullplan-template-variables.json');

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
        fs.writeFileSync(path.join(__dirname, 'nullplan-template-raw.xml'), documentXml);
        console.log('Raw XML saved to nullplan-template-raw.xml');
        
        // Find all variable patterns
        const variables = new Set();
        
        // Pattern 1: Variables between quotes (both &quot; and regular quotes)
        const quotedPatterns = [
            /&quot;([^&]+?)&quot;/g,  // HTML entity quotes
            /"([^"]+?)"/g,              // Regular double quotes
            /'([^']+?)'/g,              // Single quotes
            /„([^"]+?)"/g,              // German quotes
            /"([^"]+?)"/g,              // Curly quotes
            /"([^"]+?)"/g               // Other curly quotes
        ];
        
        quotedPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(documentXml)) !== null) {
                const variable = match[1].trim();
                if (variable.length > 0) {
                    variables.add(variable);
                }
            }
        });
        
        // Pattern 2: Variables in merge fields (MERGEFIELD patterns)
        const mergeFieldPattern = /MERGEFIELD\s+([^\s\\]+)/g;
        let match;
        while ((match = mergeFieldPattern.exec(documentXml)) !== null) {
            variables.add(match[1]);
        }
        
        // Pattern 3: Variables in simple field codes
        const fieldCodePattern = /«([^»]+)»/g;
        while ((match = fieldCodePattern.exec(documentXml)) !== null) {
            variables.add(match[1]);
        }
        
        // Convert to array and sort
        const variableList = Array.from(variables).sort();
        
        // Create analysis report
        const report = {
            templatePath: TEMPLATE_PATH,
            analyzedAt: new Date().toISOString(),
            totalVariablesFound: variableList.length,
            variables: variableList,
            variablesByCategory: categorizeVariables(variableList)
        };
        
        // Save report
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
        
        // Print results
        console.log('\n=== NULLPLAN TEMPLATE ANALYSIS RESULTS ===\n');
        console.log(`Total variables found: ${variableList.length}`);
        console.log('\nAll variables (alphabetically sorted):');
        variableList.forEach((v, i) => {
            console.log(`  ${i + 1}. "${v}"`);
        });
        
        console.log('\nVariables by category:');
        Object.entries(report.variablesByCategory).forEach(([category, vars]) => {
            console.log(`\n${category}: (${vars.length} variables)`);
            vars.forEach(v => console.log(`  - "${v}"`));
        });
        
        console.log(`\nAnalysis saved to: ${OUTPUT_FILE}`);
        
        // Also extract some context around each variable
        console.log('\n=== VARIABLE CONTEXT ===\n');
        variableList.slice(0, 10).forEach(variable => {
            const contexts = findVariableContext(documentXml, variable);
            if (contexts.length > 0) {
                console.log(`\n"${variable}":`);
                contexts.forEach((context, i) => {
                    console.log(`  Context ${i + 1}: ...${context}...`);
                });
            }
        });
        
    } catch (error) {
        console.error('Error analyzing template:', error);
        process.exit(1);
    }
}

function categorizeVariables(variables) {
    const categories = {
        kunde: [],
        objekt: [],
        vertrag: [],
        daten: [],
        text: [],
        other: []
    };
    
    variables.forEach(v => {
        const lower = v.toLowerCase();
        if (lower.includes('kunde') || lower.includes('kunden')) {
            categories.kunde.push(v);
        } else if (lower.includes('objekt') || lower.includes('liegenschaft')) {
            categories.objekt.push(v);
        } else if (lower.includes('vertrag') || lower.includes('miete') || lower.includes('nebenkosten')) {
            categories.vertrag.push(v);
        } else if (lower.includes('datum') || lower.includes('date') || lower.includes('tag') || lower.includes('monat') || lower.includes('jahr')) {
            categories.daten.push(v);
        } else if (lower.includes('text') || lower.includes('inhalt')) {
            categories.text.push(v);
        } else {
            categories.other.push(v);
        }
    });
    
    return categories;
}

function findVariableContext(xml, variable) {
    const contexts = [];
    const searchPatterns = [
        `&quot;${variable}&quot;`,
        `"${variable}"`,
        `'${variable}'`,
        `„${variable}"`,
        `"${variable}"`,
        `«${variable}»`
    ];
    
    searchPatterns.forEach(pattern => {
        let index = xml.indexOf(pattern);
        while (index !== -1) {
            const start = Math.max(0, index - 50);
            const end = Math.min(xml.length, index + pattern.length + 50);
            const context = xml.substring(start, end).replace(/\s+/g, ' ').trim();
            contexts.push(context);
            index = xml.indexOf(pattern, index + 1);
        }
    });
    
    return contexts.slice(0, 3); // Return up to 3 contexts
}

// Run the analysis
analyzeTemplate();