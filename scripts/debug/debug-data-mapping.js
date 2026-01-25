/**
 * Debug data mapping issues 
 */
function debugDataMapping() {
    console.log('🔍 Debugging data mapping issues...\n');

    // Simulate the exact client data structure from logs
    const clientData = {
        reference: '222222',
        aktenzeichen: '222222',
        // The name should be "test 222" but it's showing as "Max Mustermann"
        fullName: undefined, // This might be the problem
        firstName: 'test',
        lastName: '222',
        financial_data: {
            monthly_net_income: 1500, // This should show as 1500, not 0
            marital_status: 'ledig'
        }
    };

    console.log('📊 Client data structure:');
    console.log(JSON.stringify(clientData, null, 2));

    // Test the current logic
    console.log('\n🧪 Testing current name logic:');
    const clientName = clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann';
    console.log(`Result: "${clientName}"`);
    console.log(`Expected: "test 222"`);
    console.log(`Match: ${clientName === 'test 222' ? '✅' : '❌'}`);

    console.log('\n🧪 Testing current income logic:');
    const income = clientData.financial_data?.monthly_net_income || clientData.monthlyNetIncome || 0;
    console.log(`Result: ${income}`);
    console.log(`Expected: 1500`);
    console.log(`Match: ${income === 1500 ? '✅' : '❌'}`);

    // Test creditor data structure
    const creditor = {
        name: 'EOS Deutscher Inkasso-Dienst GmbH',
        creditor_name: 'EOS Deutscher Inkasso-Dienst GmbH',
        debt_amount: 795.56,
        address: '', // Empty in logs
        creditor_street: '',
        creditor_postal_code: '',
        creditor_city: ''
    };

    console.log('\n📊 Creditor data structure:');
    console.log(JSON.stringify(creditor, null, 2));

    console.log('\n🧪 Testing current address logic:');
    let creditorAddress = '';
    
    if (creditor.address && creditor.address.trim()) {
        creditorAddress = creditor.address.trim();
    } else {
        // Build from individual parts
        const parts = [];
        if (creditor.creditor_street || creditor.sender_street) {
            parts.push(creditor.creditor_street || creditor.sender_street);
        }
        if (creditor.creditor_postal_code || creditor.sender_postal_code) {
            const city = creditor.creditor_city || creditor.sender_city || '';
            parts.push(`${creditor.creditor_postal_code || creditor.sender_postal_code} ${city}`.trim());
        }
        
        creditorAddress = parts.filter(p => p && p.trim()).join(', ');
    }
    
    // Final fallback
    if (!creditorAddress || creditorAddress === ',') {
        creditorAddress = `${creditor.name || creditor.creditor_name || 'Gläubiger'}\nAdresse nicht verfügbar`;
    }

    console.log(`Result: "${creditorAddress}"`);
    console.log(`Expected: Some actual address or proper fallback`);
}

debugDataMapping();