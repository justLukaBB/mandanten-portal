#!/usr/bin/env node

/**
 * Universal Word Template Variable Analyzer
 * 
 * This script analyzes any Word (.docx) template to find variable names
 * and provides mappings for use in docxtemplater or similar tools.
 * 
 * Usage: node analyze-word-template.js [template-path]
 * Example: node analyze-word-template.js templates/Nullplan_Text_Template.docx
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

// Get template path from command line argument or use default
const templatePath = process.argv[2] || path.join(__dirname, 'templates', 'Nullplan_Text_Template.docx');
const templateName = path.basename(templatePath, '.docx');
const outputFile = path.join(__dirname, `${templateName}-variables.json`);

async function analyzeWordTemplate(templatePath) {
    console.log(`🔍 Analyzing Word template: ${templatePath}\n`);
    
    try {
        // Check if template exists
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`);
        }
        
        // Read the Word document as a zip file
        const content = fs.readFileSync(templatePath);
        const zip = new PizZip(content);
        
        // Extract document.xml content
        let documentXml;
        try {
            documentXml = zip.file('word/document.xml').asText();
        } catch (error) {
            throw new Error('Could not find document.xml in the Word template');
        }
        
        // Clean the XML and extract readable text
        const cleanText = cleanWordXml(documentXml);
        
        // Save raw XML and cleaned text for debugging
        const rawXmlFile = path.join(__dirname, `${templateName}-raw.xml`);
        const cleanTextFile = path.join(__dirname, `${templateName}-clean.txt`);
        fs.writeFileSync(rawXmlFile, documentXml);
        fs.writeFileSync(cleanTextFile, cleanText);
        
        // Find variables using multiple patterns
        const variables = findVariables(cleanText, documentXml);
        
        // Create analysis report
        const report = {
            templatePath: templatePath,
            templateName: templateName,
            analyzedAt: new Date().toISOString(),
            totalVariablesFound: variables.length,
            variables: variables.sort(),
            variablesByLength: variables.sort((a, b) => a.length - b.length),
            variablesByCategory: categorizeVariables(variables),
            analysisFiles: {
                rawXml: rawXmlFile,
                cleanText: cleanTextFile,
                report: outputFile
            }
        };
        
        // Save report
        fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
        
        // Display results
        displayResults(report);
        
        // Generate code template
        generateCodeTemplate(report);
        
        return report;
        
    } catch (error) {
        console.error('❌ Error analyzing template:', error.message);
        process.exit(1);
    }
}

function cleanWordXml(xml) {
    // Clean XML by removing formatting and extracting plain text
    return xml
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
}

function findVariables(cleanText, rawXml) {
    const variables = new Set();
    
    // Pattern 1: Variables in quotes (most common in templates)
    const quotedPatterns = [
        /"([^"]{3,50})"/g,                   // Double quotes
        /'([^']{3,50})'/g,                   // Single quotes
        /„([^"]{3,50})"/g,                   // German quotes
        /"([^"]{3,50})"/g,                   // Curly quotes
        /«([^»]{3,50})»/g,                   // Angle brackets
    ];
    
    quotedPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanText)) !== null) {
            const variable = match[1].trim();
            if (isLikelyVariable(variable)) {
                variables.add(variable);
            }
        }
    });
    
    // Pattern 2: MERGEFIELD patterns in raw XML
    const mergeFieldPattern = /MERGEFIELD\s+"?([^"\s\\]{3,50})"?/gi;
    let match;
    while ((match = mergeFieldPattern.exec(rawXml)) !== null) {
        const variable = match[1].trim();
        if (isLikelyVariable(variable)) {
            variables.add(variable);
        }
    }
    
    // Pattern 3: Docxtemplater style variables
    const docxTemplaterPattern = /\{([a-zA-Z_][a-zA-Z0-9_\.]{2,30})\}/g;
    while ((match = docxTemplaterPattern.exec(cleanText)) !== null) {
        variables.add(match[1]);
    }
    
    // Pattern 4: Simple placeholder patterns
    const placeholderPatterns = [
        /\{([^}]{3,50})\}/g,                 // Curly braces
        /\[([^\]]{3,50})\]/g,                // Square brackets
        /\$\{([^}]{3,50})\}/g,               // Dollar notation
        /%([^%]{3,50})%/g,                   // Percent notation
    ];
    
    placeholderPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanText)) !== null) {
            const variable = match[1].trim();
            if (isLikelyVariable(variable)) {
                variables.add(variable);
            }
        }
    });
    
    return Array.from(variables);
}

function isLikelyVariable(text) {
    // Check if text looks like a variable name rather than regular content
    if (!text || text.length < 3 || text.length > 50) return false;
    
    // Exclude obvious non-variables
    const excludePatterns = [
        /^\d+$/,                             // Pure numbers
        /^[\d\.,\-\s]+$/,                    // Numbers with punctuation
        /^[#\-\.\,\s]+$/,                    // Formatting characters
        /^(true|false|left|right|center|auto|none|solid|single)$/i, // Common attributes
        /^http/i,                            // URLs
        /^urn:/i,                            // URNs
        /position:|margin-|width:|height:/,   // CSS-like
        /^\d+pt$/,                           // Point measurements
        /^[a-z]{1,3}$/,                      // Short lowercase (likely attributes)
    ];
    
    if (excludePatterns.some(pattern => pattern.test(text))) {
        return false;
    }
    
    // Include likely variables
    const includePatterns = [
        /^[A-ZÄÖÜ][a-zA-ZäöüßÄÖÜ\s]*$/,     // Capitalized words (German/English)
        /name|datum|date|adresse|address|telefon|phone|email|betrag|amount|nummer|number|summe|total/i, // Common variable terms
        /kunde|client|mandant|gläubiger|creditor|forderung|claim|schuld|debt/i, // Domain specific terms
        /^[a-zA-Z_][a-zA-Z0-9_\.]*$/,        // Programming variable names
    ];
    
    return includePatterns.some(pattern => pattern.test(text));
}

function categorizeVariables(variables) {
    const categories = {
        client: [],
        creditor: [],
        financial: [],
        dates: [],
        contact: [],
        case: [],
        other: []
    };
    
    variables.forEach(variable => {
        const lower = variable.toLowerCase();
        
        if (lower.includes('kunde') || lower.includes('client') || lower.includes('mandant')) {
            categories.client.push(variable);
        } else if (lower.includes('gläubiger') || lower.includes('creditor')) {
            categories.creditor.push(variable);
        } else if (lower.includes('betrag') || lower.includes('summe') || lower.includes('amount') || 
                   lower.includes('total') || lower.includes('forderung') || lower.includes('schuld') ||
                   lower.includes('quote') || lower.includes('€') || lower.includes('euro')) {
            categories.financial.push(variable);
        } else if (lower.includes('datum') || lower.includes('date') || lower.includes('tag') || 
                   lower.includes('monat') || lower.includes('jahr') || lower.includes('geburts')) {
            categories.dates.push(variable);
        } else if (lower.includes('telefon') || lower.includes('phone') || lower.includes('mail') || 
                   lower.includes('email') || lower.includes('fax') || lower.includes('adresse') || 
                   lower.includes('address')) {
            categories.contact.push(variable);
        } else if (lower.includes('aktenzeichen') || lower.includes('case') || lower.includes('nummer')) {
            categories.case.push(variable);
        } else {
            categories.other.push(variable);
        }
    });
    
    return categories;
}

function displayResults(report) {
    console.log(`✅ Found ${report.totalVariablesFound} potential variables in template:\n`);
    
    // Show variables by category
    Object.entries(report.variablesByCategory).forEach(([category, variables]) => {
        if (variables.length > 0) {
            console.log(`📁 ${category.toUpperCase()} (${variables.length} variables):`);
            variables.forEach((variable, i) => {
                console.log(`   ${i + 1}. "${variable}"`);
            });
            console.log();
        }
    });
    
    console.log(`📊 Variables by length:`);
    report.variablesByLength.slice(0, 10).forEach((variable, i) => {
        console.log(`   ${i + 1}. "${variable}" (${variable.length} chars)`);
    });
    if (report.variablesByLength.length > 10) {
        console.log(`   ... and ${report.variablesByLength.length - 10} more`);
    }
    console.log();
}

function generateCodeTemplate(report) {
    console.log('📝 CODE TEMPLATE:');
    console.log('```javascript');
    console.log('// Template variable mapping for docxtemplater');
    console.log('const templateVariables = {');
    
    report.variables.forEach(variable => {
        // Convert to camelCase variable name
        const camelCase = variable
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
            .split(/\s+/)                   // Split on whitespace
            .map((word, index) => {
                if (index === 0) return word.toLowerCase();
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join('');
        
        console.log(`  '${variable}': data.${camelCase} || '',`);
    });
    
    console.log('};');
    console.log('```\n');
    
    console.log('💾 Files created:');
    Object.entries(report.analysisFiles).forEach(([type, file]) => {
        console.log(`   - ${path.basename(file)} (${type})`);
    });
    console.log();
}

// Main execution
if (require.main === module) {
    analyzeWordTemplate(templatePath)
        .then(() => {
            console.log('🎉 Analysis complete!');
        })
        .catch(error => {
            console.error('💥 Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { analyzeWordTemplate, cleanWordXml, findVariables };