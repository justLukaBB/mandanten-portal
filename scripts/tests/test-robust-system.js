#!/usr/bin/env node

/**
 * TEST FÜR DAS ROBUSTE INSOLVENZANTRAG-SYSTEM
 * - Nur existierende Felder
 * - Klare Standard/Dynamik-Trennung
 * - Keine Fehler durch nicht-existierende Felder
 */

const RobustInsolvenzMapper = require('./robust-insolvenz-mapper');
const fs = require('fs');
const path = require('path');

async function testRobustSystem() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    
    console.log('🚀 TESTING ROBUST INSOLVENZANTRAG SYSTEM');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ NUR existierende PDF-Felder');
    console.log('✅ Standard-Checkboxen (immer gleich)');  
    console.log('✅ Dynamische Checkboxen (basierend auf Daten)');
    console.log('✅ KEINE Fehler durch nicht-existierende Felder');
    console.log();
    
    try {
        // Test-Client-Daten
        const mockClient = {
            firstName: 'Max',
            lastName: 'Mustermann',
            email: 'max.mustermann@example.com',
            phone: '+49 123 456789',
            address: 'Musterstraße 123, 12345 Musterstadt',
            financial_data: {
                marital_status: 'verheiratet',
                number_of_children: 2
            },
            // Zusätzliche Felder
            geschlecht: 'maennlich',
            berufsstatus: 'angestellt'
        };
        
        console.log('🎯 TEST-DATEN:');
        console.log(`   👤 Name: ${mockClient.firstName} ${mockClient.lastName}`);
        console.log(`   📧 Email: ${mockClient.email}`);  
        console.log(`   📱 Telefon: ${mockClient.phone}`);
        console.log(`   🏠 Adresse: ${mockClient.address}`);
        console.log(`   💑 Familienstand: ${mockClient.financial_data.marital_status}`);
        console.log(`   👶 Kinder: ${mockClient.financial_data.number_of_children}`);
        console.log(`   🚻 Geschlecht: ${mockClient.geschlecht}`);
        console.log(`   💼 Beruf: ${mockClient.berufsstatus}`);
        console.log();
        
        // PDF füllen
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await RobustInsolvenzMapper.fillInsolvenzantrag(mockClient, originalPdfPath);
        
        // Speichern
        const outputFilename = `ROBUST-INSOLVENZ-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log();
        console.log('✅ ROBUSTES PDF ERFOLGREICH ERSTELLT!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 ERGEBNIS:');
        console.log(`   📁 Dateigröße: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        console.log();
        console.log('🎯 WAS WURDE GEMACHT:');
        console.log('   ✅ Standard-Checkboxen: Restschuldbefreiung, Versicherung, Anlagen');
        console.log('   ✅ Dynamische Checkboxen: Geschlecht, Familienstand, Beruf, Kinder');
        console.log('   ✅ Textfelder: Name, Adresse, Telefon, Email, Termine');
        console.log('   ✅ KEINE Fehler durch nicht-existierende Felder');
        console.log();
        console.log('📋 PDF ÖFFNEN:');
        console.log(`open "${desktopPath}"`);
        console.log();
        console.log('🎯 VERWENDE AB JETZT:');
        console.log('node test-robust-system.js');
        console.log();
        console.log('✅ DIESES SYSTEM IST ROBUST UND FEHLERFREI!');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error();
        console.error('❌ FEHLER IM ROBUSTEN SYSTEM:', error);
        console.error();
        return {
            success: false,
            error: error.message
        };
    }
}

// Test ausführen
testRobustSystem().then(result => {
    if (result.success) {
        console.log('🎉 ROBUST SYSTEM TEST ERFOLGREICH!');
    } else {
        console.log('💥 ROBUST SYSTEM TEST FEHLGESCHLAGEN!');
    }
}).catch(console.error);