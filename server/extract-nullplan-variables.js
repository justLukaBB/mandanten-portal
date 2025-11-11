#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

// Template path
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'Nullplan_Text_Template.docx');
const OUTPUT_FILE = path.join(__dirname, 'nullplan-exact-variables.json');

async function extractVariables() {
    console.log('Extracting exact variables from Nullplan template:', TEMPLATE_PATH);
    
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
        
        // Clean the XML and extract text
        const cleanText = cleanWordXml(documentXml);
        
        // Manual extraction based on what we saw in the template
        const variables = [
            'Adresse des Creditors',
            'Name Mandant',
            'Aktenzeichen der Forderung',
            'Gläuibgeranzahl',
            'Schuldsumme Insgesamt',
            'Heutiges Datum',
            'Geburtstag',
            'Familienstand',
            'Mandant Name',
            'Einkommen',
            'Forderungsnummer in der Forderungsliste',
            'Forderungssumme',
            'Quote des Gläubigers',
            'Datum in 14 Tagen',
            'Aktenzeichen',
            'Bankverbindungen',
            'Bochum Telefon',
            'Deutsche Bank',
            'Mail',
            'Telefax',
            'Öffnungszeiten'
        ];
        
        // Verify these variables exist in the template
        const foundVariables = [];
        const missingVariables = [];
        
        variables.forEach(variable => {
            const quotedVariable = `"${variable}"`;
            if (cleanText.includes(quotedVariable)) {
                foundVariables.push(variable);
            } else {
                missingVariables.push(variable);
            }
        });
        
        // Create mapping for the code
        const variableMapping = {
            // Client/Mandant information
            'Name Mandant': 'clientName',
            'Mandant Name': 'clientName', // Same as above, different format
            'Geburtstag': 'birthDate',
            'Familienstand': 'maritalStatus',
            'Einkommen': 'income',
            
            // Creditor information
            'Adresse des Creditors': 'creditorAddress',
            'Gläuibgeranzahl': 'creditorCount',
            
            // Case information
            'Aktenzeichen': 'caseNumber',
            'Aktenzeichen der Forderung': 'claimCaseNumber',
            
            // Financial information
            'Schuldsumme Insgesamt': 'totalDebt',
            'Forderungssumme': 'claimAmount',
            'Forderungsnummer in der Forderungsliste': 'claimNumber',
            'Quote des Gläubigers': 'creditorQuote',
            
            // Dates
            'Heutiges Datum': 'currentDate',
            'Datum in 14 Tagen': 'dateIn14Days',
            
            // Contact information
            'Bochum Telefon': 'phone',
            'Mail': 'email',
            'Telefax': 'fax',
            'Öffnungszeiten': 'openingHours',
            'Bankverbindungen': 'bankDetails',
            'Deutsche Bank': 'bankName'
        };
        
        // Create the report
        const report = {
            templatePath: TEMPLATE_PATH,
            analyzedAt: new Date().toISOString(),
            totalVariablesFound: foundVariables.length,
            foundVariables: foundVariables.sort(),
            missingVariables: missingVariables,
            variableMapping: variableMapping,
            codeVariableNames: Object.values(variableMapping).filter((v, i, arr) => arr.indexOf(v) === i).sort()
        };
        
        // Save report
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
        
        // Print results
        console.log('\n=== NULLPLAN TEMPLATE EXACT VARIABLES ===\n');
        console.log(`Found ${foundVariables.length} variables in template:`);
        foundVariables.forEach((v, i) => {
            const mappedName = variableMapping[v] || 'NOT_MAPPED';
            console.log(`  ${i + 1}. "${v}" -> ${mappedName}`);
        });
        
        if (missingVariables.length > 0) {
            console.log(`\nMissing ${missingVariables.length} variables (not found in template):`);
            missingVariables.forEach((v, i) => {
                console.log(`  ${i + 1}. "${v}"`);
            });
        }
        
        console.log('\n=== CODE VARIABLE NAMES TO USE ===\n');
        const codeVars = Object.values(variableMapping).filter((v, i, arr) => arr.indexOf(v) === i).sort();
        codeVars.forEach((v, i) => {
            console.log(`  ${i + 1}. ${v}`);
        });
        
        console.log(`\nReport saved to: ${OUTPUT_FILE}`);
        
        // Show template variable to code mapping
        console.log('\n=== TEMPLATE TO CODE MAPPING ===\n');
        console.log('const templateVariables = {');
        Object.entries(variableMapping).forEach(([templateVar, codeVar]) => {
            console.log(`  '${templateVar}': data.${codeVar} || '',`);
        });
        console.log('};');
        
    } catch (error) {
        console.error('Error extracting variables:', error);
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

// Run the extraction
extractVariables();