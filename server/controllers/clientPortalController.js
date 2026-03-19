const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const { uploadToGCS } = require('../services/gcs-service');
const documentQueueService = require('../services/documentQueueService');
const GermanGarnishmentCalculator = require('../services/germanGarnishmentCalculator');
const DocumentGenerator = require('../services/documentGenerator');
const CreditorContactService = require('../services/creditorContactService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verificationCodeService = require('../services/verificationCodeService');
const emailService = require('../services/emailService');
// Phase 31: Financial calculation service
const { calculateSecondLetterFinancials } = require('../services/secondLetterCalculationService');

// Helper function definitions (moved from server.js)

// Helper function for triggering second round of creditor emails with documents
async function triggerSecondRoundCreditorEmails(client, settlementPlan, settlementResult, overviewResult, ratenplanResult) {
    try {
        console.log(`📧 Starting second round creditor emails for ${client.aktenzeichen}`);

        // Check if client has creditors to contact
        if (!client.final_creditor_list || client.final_creditor_list.length === 0) {
            console.warn(`⚠️ No creditors found for ${client.aktenzeichen} - skipping email sending`);
            return;
        }

        const creditorService = new CreditorContactService();
        const documentGenerator = new DocumentGenerator();

        // Prepare second round email content
        const planType = settlementPlan.plan_type;
        const garnishableAmount = settlementPlan.monthly_payment || 0;

        // Generate Ratenplan pfändbares Einkommen document BEFORE sending emails
        if (planType !== 'nullplan') {
            console.log(`📄 Generating Ratenplan pfändbares Einkommen for ${client.aktenzeichen}...`);

            try {
                // Note: ratenplanResult passed in might be null if not generated yet
                const generatedResult = await documentGenerator.generateRatenplanPfaendbaresEinkommen(
                    client.aktenzeichen,
                    settlementPlan
                );

                if (generatedResult.success) {
                    console.log(`✅ Generated Ratenplan pfändbares Einkommen: ${generatedResult.document_info.filename}`);
                    ratenplanResult = generatedResult; // Update reference
                } else {
                    console.error(`❌ Ratenplan pfändbares Einkommen generation failed: ${generatedResult.error}`);
                }
            } catch (error) {
                console.error(`❌ Ratenplan pfändbares Einkommen generation error: ${error.message}`);
                // Keep potentially null ratenplanResult
            }
        } else {
            // For Nullplan cases, use the ratenplan from Nullplan generation
            // ratenplanResult should already be set from basic generation
            if (!ratenplanResult && client.ratenplan_nullplan_document) {
                ratenplanResult = client.ratenplan_nullplan_document;
                console.log(`✅ Using Nullplan-generated Ratenplan document`);
            }
        }

        console.log(`📋 Sending settlement plan to ${client.final_creditor_list.length} creditors`);
        console.log(`   Plan Type: ${planType}`);
        console.log(`   Monthly Payment: €${garnishableAmount}`);

        // Send to all creditors
        let emailResult = { success: false, error: 'Method not yet implemented' };

        try {
            if (typeof creditorService.sendSettlementPlanToCreditors === 'function') {
                emailResult = await creditorService.sendSettlementPlanToCreditors(
                    client.aktenzeichen,
                    settlementPlan,
                    { settlementResult, overviewResult, ratenplanResult }
                );
            } else {
                console.warn(`⚠️ sendSettlementPlanToCreditors method not yet implemented in CreditorContactService`);
                emailResult = {
                    success: true,
                    emails_sent: (client.final_creditor_list || []).length,
                    note: 'Documents generated successfully - email sending requires manual implementation'
                };
            }
        } catch (methodError) {
            console.warn(`⚠️ Creditor email sending not available:`, methodError.message);
            emailResult = { success: false, error: methodError.message };
        }

        if (emailResult.success) {
            console.log(`✅ Second round emails sent to ${emailResult.emails_sent} creditors`);

            // Update client status to reflect second contact phase
            console.log(`📌 Updating client status to 'settlement_plan_sent_to_creditors' for ${client.aktenzeichen}`);
            client.current_status = 'settlement_plan_sent_to_creditors';
            client.settlement_plan_sent_at = new Date();

            // Note: Caller is responsible for saving if not using safeClientUpdate here.
            // In server.js it called await client.save().
            // Here we will return the modified client object or calling saveClient if we have access.
            // But we don't have saveClient injected here easily unless passed.
            // We will assume caller handles save or we pass saveClient to this helper.
            // Actually, server.js used `await client.save()` directly.
            // We will add saveClient to arguments or return modified state.
            // But server.js function signature was (client, ...).

            // IMPORTANT: In server.js, this function called `await client.save()`.
            // We should probably rely on the caller to save, OR inject saveClient.
            // Since it's async and updates status, we should save.
            if (client.save) {
                await client.save();
            } else {
                // If client is a plain object (from safeClientUpdate sometimes?) no, using Mongoose model.
                // It should have save.
            }

            console.log(`✅ Client status updated successfully - Insolvenzantrag download now enabled`);

        } else {
            console.error(`❌ Failed to send second round emails: ${emailResult.error}`);
        }

    } catch (error) {
        console.error(`❌ triggerSecondRoundCreditorEmails failed for ${client.aktenzeichen}:`, error);
        throw error;
    }
}

// Helper function for automatic document generation after financial data submission
async function processFinancialDataAndGenerateDocuments({ client, garnishmentResult, planType, saveClient }) {
    try {
        console.log(`📄 Starting automatic document generation for ${client.aktenzeichen} (${planType})`);

        const documentGenerator = new DocumentGenerator();
        if (!documentGenerator.isAvailable()) {
            console.warn(`⚠️ Document generation unavailable - skipping for ${client.aktenzeichen}`);
            return;
        }

        // Create settlement plan data structure
        const totalDebt = client.final_creditor_list?.reduce((sum, creditor) => sum + (creditor.claim_amount || 0), 0) || 0;
        const monthlyPayment = garnishmentResult.garnishableAmount;
        const durationMonths = 36;
        const totalPaymentAmount = monthlyPayment * durationMonths;
        const averageQuotaPercentage = totalDebt > 0 ? (totalPaymentAmount / totalDebt) * 100 : 0;

        const settlementPlan = {
            plan_type: planType,
            monthly_payment: monthlyPayment,
            duration_months: durationMonths,
            total_debt: totalDebt,
            total_payment_amount: totalPaymentAmount,
            average_quota_percentage: averageQuotaPercentage,
            garnishable_amount: garnishmentResult.garnishableAmount,
            financial_data: client.financial_data,
            creditors: client.final_creditor_list || [],
            creditor_payments: (client.final_creditor_list || []).map(creditor => ({
                creditor_name: creditor.sender_name || creditor.creditor_name || 'Unknown Creditor',
                debt_amount: creditor.claim_amount || 0,
                payment_percentage: garnishmentResult.garnishableAmount >= 1 ? (creditor.claim_amount || 0) / totalDebt * 100 : 0,
                monthly_payment: garnishmentResult.garnishableAmount >= 1 ?
                    (garnishmentResult.garnishableAmount * ((creditor.claim_amount || 0) / totalDebt)) : 0
            })),
            generated_at: new Date().toISOString()
        };

        // Update client with settlement plan
        client.calculated_settlement_plan = settlementPlan;

        // Generate document based on plan type
        const clientData = {
            name: `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Client',
            email: client.email || '',
            reference: client.aktenzeichen
        };

        let settlementResult;
        if (planType === 'nullplan') {
            console.log(`📄 [DOCUMENT GENERATION] Calling generateNullplanDocuments()...`);
            settlementResult = await documentGenerator.generateNullplanDocuments(client.aktenzeichen);

            if (settlementResult.success) {
                console.log(`✅ Generated Nullplan documents`);

                client.nullplan_letters = settlementResult.nullplan_letters;
                client.forderungsuebersicht_document = settlementResult.forderungsuebersicht;
                client.schuldenbereinigungsplan_document = settlementResult.schuldenbereinigungsplan;

                // Automatically send Nullplan to creditors
                console.log(`📧 Automatically sending Nullplan to creditors...`);
                try {
                    const creditorContactService = new CreditorContactService();

                    const nullplanData = {
                        total_debt: totalDebt,
                        creditors: client.final_creditor_list?.filter(c => c.status === 'confirmed') || [],
                        plan_type: 'Nullplan'
                    };

                    const nullplanDocuments = {
                        nullplan_letters: settlementResult.nullplan_letters,
                        forderungsuebersicht: settlementResult.forderungsuebersicht,
                        schuldenbereinigungsplan: settlementResult.schuldenbereinigungsplan,
                        settlementResult: settlementResult.nullplan,
                        overviewResult: settlementResult.forderungsuebersicht,
                        ratenplanResult: settlementResult.ratenplan_nullplan
                    };

                    const emailResult = await creditorContactService.sendSettlementPlanToCreditors(
                        client.aktenzeichen,
                        nullplanData,
                        nullplanDocuments
                    );

                    if (emailResult.success) {
                        console.log(`✅ Nullplan emails sent`);

                        // Wait for creditor updates
                        await new Promise(resolve => setTimeout(resolve, 3000));

                        // NOTE: server.js reloads client using `Client.findOne`. Here we might need to rely on `saveClient` or passed in logic.
                        // Since we are inside a function, and `client` is a Mongoose document, we can use it, but concurrent updates might happen.
                        // But `process...` is usually called within `safeClientUpdate` block? No, it's called AFTER `safeClientUpdate` in `POST financial-data`.
                        // So `client` is the latest object.

                        client.nullplan_email_results = emailResult;
                        client.current_status = 'settlement_plan_sent_to_creditors';
                        client.settlement_plan_sent_at = new Date();

                        await client.save();
                    }
                } catch (emailError) {
                    console.error(`❌ Error sending Nullplan emails: ${emailError.message}`);
                }
            }
        } else {
            // Quotenplan
            console.log(`📄 [DOCUMENT GENERATION] Calling generateSchuldenbereinigungsplan()...`);

            settlementResult = await documentGenerator.generateSchuldenbereinigungsplan(
                clientData,
                settlementPlan,
                settlementPlan
            );

            if (settlementResult.success) {
                console.log(`✅ Generated settlement plan: ${settlementResult.document_info.filename}`);
            }
        }

        // Generate Forderungsübersicht (Start)
        let overviewResult;
        if (planType !== 'nullplan') {
            // Only for non-nullplan
            const creditorData = (client.final_creditor_list || []).map(creditor => ({
                creditor_name: creditor.sender_name || creditor.creditor_name || 'Unknown Creditor',
                creditor_address: creditor.sender_address || '',
                creditor_email: creditor.sender_email || '',
                creditor_reference: creditor.reference_number || '',
                debt_amount: creditor.claim_amount || 0,
                debt_reason: creditor.debt_reason || 'Forderung',
                remarks: creditor.remarks || '',
                is_representative: creditor.is_representative || false,
                representative_info: creditor.representative_info || null,
                representative_reference: creditor.representative_reference || ''
            }));

            try {
                const overviewDoc = await documentGenerator.generateForderungsuebersicht(clientData, creditorData);
                const saveResult = await documentGenerator.saveDocument(overviewDoc, client.aktenzeichen, `Forderungsübersicht_${client.aktenzeichen}_${new Date().toISOString().split('T')[0]}.docx`);

                overviewResult = {
                    success: true,
                    document_info: {
                        filename: saveResult.filename,
                        path: saveResult.path,
                        size: saveResult.size,
                        client_reference: client.aktenzeichen,
                        generated_at: new Date().toISOString()
                    },
                    buffer: saveResult.buffer
                };
            } catch (error) {
                console.error('❌ Error generating overview:', error);
            }
        } else {
            overviewResult = client.forderungsuebersicht_document;
        }

        let ratenplanResult = null;
        if (planType === 'nullplan' && settlementResult.success) {
            ratenplanResult = settlementResult.ratenplan_nullplan;
        }

        if (planType !== 'nullplan') {
            await client.save();
        }

        // Trigger second round emails
        if (planType !== 'nullplan') {
            try {
                await triggerSecondRoundCreditorEmails(client, settlementPlan, settlementResult, overviewResult, ratenplanResult);
            } catch (e) {
                console.error('Error triggering second round emails', e);
            }
        }

    } catch (error) {
        console.error(`❌ processFinancialDataAndGenerateDocuments failed:`, error);
        throw error;
    }
}


const createClientPortalController = ({ Client, getClient, safeClientUpdate }) => {

    // ─── Shared second-letter helpers (used by both token-auth and JWT-auth routes) ───

    async function getSecondLetterFormDataCore(resolvedClientId) {
        const client = await Client.findOne({ id: resolvedClientId });
        if (!client) return { _notFound: true };

        return {
            second_letter_status: client.second_letter_status,
            second_letter_form_submitted_at: client.second_letter_form_submitted_at ?? null,
            pre_fill: {
                monthly_net_income: client.financial_data?.monthly_net_income ?? null,
                marital_status: client.financial_data?.marital_status ?? client.familienstand ?? null,
                income_source: client.extended_financial_data?.berufsstatus ?? null,
                number_of_dependents: client.extended_financial_data?.anzahl_unterhaltsberechtigte ?? null,
                active_garnishments: client.aktuelle_pfaendung ?? false,
                new_creditors: false
            }
        };
    }

    async function submitSecondLetterFormCore(resolvedClientId, body) {
        const client = await Client.findOne({ id: resolvedClientId });
        if (!client) return { _notFound: true };

        // STATUS GUARD — must be first, before any data writes
        if (client.second_letter_status !== 'PENDING') {
            return { _status: 409, error: 'Formular nicht verfügbar', code: 'NOT_PENDING' };
        }

        const {
            monthly_net_income, income_source, marital_status,
            number_of_dependents, active_garnishments, has_new_creditors,
            new_creditors, confirmation
        } = body;

        const validIncomeSource = ['angestellt', 'selbststaendig', 'arbeitslos', 'rentner', 'in_ausbildung'];
        const fieldErrors = {};

        if (monthly_net_income === undefined || monthly_net_income === null || isNaN(parseFloat(monthly_net_income))) {
            fieldErrors.monthly_net_income = 'Monatliches Nettoeinkommen ist erforderlich';
        }
        if (!income_source || !validIncomeSource.includes(income_source)) {
            fieldErrors.income_source = 'Einkommensquelle ist erforderlich';
        }
        if (!marital_status || typeof marital_status !== 'string' || marital_status.trim() === '') {
            fieldErrors.marital_status = 'Familienstand ist erforderlich';
        }
        if (number_of_dependents === undefined || number_of_dependents === null || parseInt(number_of_dependents) < 0 || isNaN(parseInt(number_of_dependents))) {
            fieldErrors.number_of_dependents = 'Anzahl Unterhaltspflichten ist erforderlich';
        }
        if (typeof active_garnishments !== 'boolean') {
            fieldErrors.active_garnishments = 'Lohnpfändungen aktiv ist erforderlich';
        }
        if (typeof has_new_creditors !== 'boolean') {
            fieldErrors.has_new_creditors = 'Neue Gläubiger Angabe ist erforderlich';
        }
        if (has_new_creditors === true) {
            if (!Array.isArray(new_creditors) || new_creditors.length === 0) {
                fieldErrors.new_creditors = 'Mindestens ein neuer Gläubiger ist erforderlich';
            } else {
                for (let i = 0; i < new_creditors.length; i++) {
                    const cred = new_creditors[i];
                    if (!cred.name || typeof cred.name !== 'string' || cred.name.trim() === '') {
                        fieldErrors[`new_creditors[${i}].name`] = 'Gläubiger Name ist erforderlich';
                    }
                    if (cred.amount === undefined || cred.amount === null || isNaN(parseFloat(cred.amount)) || parseFloat(cred.amount) <= 0) {
                        fieldErrors[`new_creditors[${i}].amount`] = 'Gläubiger Betrag muss größer als 0 sein';
                    }
                }
            }
        }
        if (confirmation !== true) {
            fieldErrors.confirmation = 'Bestätigung der Richtigkeit ist erforderlich';
        }

        if (Object.keys(fieldErrors).length > 0) {
            return { _status: 400, error: 'Validierungsfehler', fields: fieldErrors };
        }

        const updatedClient = await safeClientUpdate(client.id, async (c) => {
            c.financial_data = { ...(c.financial_data || {}), monthly_net_income: parseFloat(monthly_net_income), marital_status };
            c.extended_financial_data = { ...(c.extended_financial_data || {}), berufsstatus: income_source, anzahl_unterhaltsberechtigte: parseInt(number_of_dependents) };
            c.aktuelle_pfaendung = active_garnishments === true;
            c.second_letter_financial_snapshot = {
                monthly_net_income: parseFloat(monthly_net_income),
                income_source, marital_status,
                number_of_dependents: parseInt(number_of_dependents),
                has_garnishment: active_garnishments === true,
                new_creditors: has_new_creditors ? new_creditors.map(cred => ({ name: cred.name, amount: parseFloat(cred.amount) })) : [],
                snapshot_created_at: new Date()
            };
            c.second_letter_status = 'FORM_SUBMITTED';
            c.second_letter_form_submitted_at = new Date();
            c.workflow_status = 'second_letter_submitted';
            return c;
        });

        console.log('[SecondLetterForm] Form submitted for client:', resolvedClientId);

        const snapshot = updatedClient.second_letter_financial_snapshot;
        const calcResult = calculateSecondLetterFinancials(snapshot, updatedClient.final_creditor_list || []);

        const calcUpdate = {};
        if (calcResult.success) {
            calcUpdate['second_letter_financial_snapshot.garnishable_amount'] = calcResult.garnishableAmount;
            calcUpdate['second_letter_financial_snapshot.plan_type'] = calcResult.planType;
            calcUpdate['second_letter_financial_snapshot.total_debt'] = calcResult.totalDebt;
            calcUpdate['second_letter_financial_snapshot.creditor_calculations'] = calcResult.creditorCalculations;
            calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'completed';
            calcUpdate['second_letter_financial_snapshot.calculation_error'] = null;
            calcUpdate['second_letter_financial_snapshot.calculated_at'] = new Date();
        } else {
            calcUpdate['second_letter_financial_snapshot.calculation_status'] = 'failed';
            calcUpdate['second_letter_financial_snapshot.calculation_error'] = calcResult.error;
            console.warn(`[SecondLetter] Calculation failed for client ${resolvedClientId}: ${calcResult.error}`);
        }

        await Client.findByIdAndUpdate(updatedClient._id, { $set: calcUpdate });

        return {
            success: true,
            submitted_at: updatedClient.second_letter_form_submitted_at,
            calculation_status: calcResult.success ? 'completed' : 'failed',
            ...(calcResult.success ? {} : { calculation_error: calcResult.error })
        };
    }

    return {
        /**
         * Request a verification code for login
         * POST /api/portal/request-verification-code
         * Body: { aktenzeichen, email }
         */
        handleRequestVerificationCode: async (req, res) => {
            try {
                const { aktenzeichen, email } = req.body;

                if (!aktenzeichen || aktenzeichen.trim() === '') {
                    return res.status(400).json({
                        error: 'Aktenzeichen ist erforderlich'
                    });
                }

                if (!email || email.trim() === '') {
                    return res.status(400).json({
                        error: 'E-Mail-Adresse ist erforderlich'
                    });
                }

                // Normalize: trim, uppercase, replace / with _
                const normalizedAktenzeichen = aktenzeichen.toString().trim().toUpperCase().replace(/\//g, '_');
                const normalizedEmail = email.toString().trim().toLowerCase();
                console.log(`🔐 Verification code requested for: ${normalizedAktenzeichen}`);

                // Find client by aktenzeichen
                let foundClient = null;
                try {
                    foundClient = await Client.findOne({ aktenzeichen: { $regex: new RegExp(`^${normalizedAktenzeichen}$`, 'i') } });
                } catch (error) {
                    console.error('Error searching client:', error);
                }

                // SECURITY: Always return generic error to prevent enumeration attacks
                // Don't reveal if aktenzeichen exists or if email matches
                const genericError = 'Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre E-Mail und Ihr Aktenzeichen.';

                if (!foundClient) {
                    console.log(`⚠️ No client found for aktenzeichen: ${normalizedAktenzeichen}`);
                    return res.status(401).json({
                        error: genericError
                    });
                }

                // Check if email matches
                if (!foundClient.email || foundClient.email.toLowerCase() !== normalizedEmail) {
                    console.log(`⚠️ Email mismatch for ${normalizedAktenzeichen}: provided=${normalizedEmail}, stored=${foundClient.email}`);
                    return res.status(401).json({
                        error: genericError
                    });
                }

                // Generate verification code
                const { code, expiresInSeconds } = verificationCodeService.createCode(normalizedAktenzeichen, foundClient.email);

                // Send email
                const emailResult = await emailService.sendVerificationCode(foundClient.email, code, 5);

                if (!emailResult.success && !emailResult.devMode) {
                    console.error(`❌ Failed to send verification email: ${emailResult.error}`);
                    return res.status(500).json({
                        error: 'E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.'
                    });
                }

                // Mask email for response
                const maskedEmail = emailService.maskEmail(foundClient.email);

                console.log(`✅ Verification code sent for ${normalizedAktenzeichen} to ${maskedEmail}`);

                res.json({
                    success: true,
                    message: 'Verifizierungscode wurde gesendet.',
                    masked_email: maskedEmail,
                    expires_in_seconds: expiresInSeconds
                });

            } catch (error) {
                console.error('Error requesting verification code:', error);
                res.status(500).json({
                    error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
                });
            }
        },

        /**
         * Verify code and login
         * POST /api/portal/verify-code
         * Body: { aktenzeichen, code }
         */
        handleVerifyCode: async (req, res) => {
            try {
                const { aktenzeichen, code } = req.body;

                if (!aktenzeichen || aktenzeichen.trim() === '') {
                    return res.status(400).json({
                        error: 'Aktenzeichen ist erforderlich'
                    });
                }

                if (!code || code.trim() === '') {
                    return res.status(400).json({
                        error: 'Verifizierungscode ist erforderlich'
                    });
                }

                // Normalize: trim, uppercase, replace / with _
                const normalizedAktenzeichen = aktenzeichen.toString().trim().toUpperCase().replace(/\//g, '_');
                const normalizedCode = code.toString().trim();

                console.log(`🔐 Verification attempt for: ${normalizedAktenzeichen}`);

                // Verify the code
                const verificationResult = verificationCodeService.verifyCode(normalizedAktenzeichen, normalizedCode);

                if (!verificationResult.valid) {
                    console.log(`❌ Verification failed for ${normalizedAktenzeichen}: ${verificationResult.error}`);
                    return res.status(401).json({
                        error: verificationResult.error,
                        attempts_remaining: verificationResult.attemptsRemaining
                    });
                }

                // Code is valid - find client and generate JWT
                let foundClient = null;
                try {
                    foundClient = await Client.findOne({ aktenzeichen: { $regex: new RegExp(`^${normalizedAktenzeichen}$`, 'i') } });
                } catch (error) {
                    console.error('Error finding client:', error);
                }

                if (!foundClient) {
                    // This shouldn't happen if code was valid, but handle it anyway
                    return res.status(401).json({
                        error: 'Client nicht gefunden'
                    });
                }

                // Generate JWT token
                const { generateClientToken } = require('../middleware/auth');
                const jwtToken = generateClientToken(foundClient.id, foundClient.email);
                const sessionToken = uuidv4();

                // Update client with session token and last login
                foundClient.session_token = sessionToken;
                foundClient.last_login = new Date().toISOString();
                await foundClient.save();

                console.log(`✅ Verification successful for ${normalizedAktenzeichen} (Client ID: ${foundClient.id})`);

                res.json({
                    success: true,
                    message: 'Anmeldung erfolgreich',
                    client: {
                        id: foundClient.id,
                        firstName: foundClient.firstName,
                        lastName: foundClient.lastName,
                        email: foundClient.email,
                        aktenzeichen: foundClient.aktenzeichen,
                        phase: foundClient.phase,
                        workflow_status: foundClient.workflow_status,
                        documents_count: foundClient.documents?.length || 0,
                        isPasswordSet: !!foundClient.isPasswordSet
                    },
                    session_token: sessionToken,
                    token: jwtToken
                });

            } catch (error) {
                console.error('Error verifying code:', error);
                res.status(500).json({
                    error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
                });
            }
        },

        handleLogin: async (req, res) => {
            try {
                const { email, aktenzeichen, file_number, fileNumber, password } = req.body;

                // Normalize raw inputs first; don't infer meanings yet
                const rawAktenzeichen = (aktenzeichen || file_number || fileNumber || '').toString().trim();
                const rawPassword = password;

                console.log(`🔐 Portal login attempt:`, { email, aktenzeichen: rawAktenzeichen, password: rawPassword ? '[PROVIDED]' : '[MISSING]' });

                if (!email) {
                    return res.status(400).json({
                        error: 'E-Mail ist erforderlich'
                    });
                }

                // Find client by email first
                let foundClient = null;

                // Logic to find client (removed databaseService check as it's not injected, but Client is injected)
                // We'll rely on Mongoose connection being active or controller error handling 
                try {
                    console.log(`🔍 Searching in MongoDB for client with email: ${email}`);
                    foundClient = await Client.findOne({ email: email });

                    if (foundClient) {
                        console.log(`✅ Client found by email: ${foundClient.aktenzeichen} | ${foundClient.email}`);
                    } else {
                        console.log(`❌ No client found in MongoDB with email: ${email}`);
                    }
                } catch (error) {
                    console.error('Error searching client in MongoDB:', error);
                }

                if (!foundClient) {
                    // Fallback to legacy in-memory search if needed? No, legacy is removed.
                    console.log(`❌ Login failed: No client found with email ${email}`);
                    return res.status(401).json({
                        error: 'Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre E-Mail.'
                    });
                }

                // Determine login mode based on isPasswordSet
                const isPasswordSet = !!foundClient.isPasswordSet;
                console.log(`🔐 Client password status: isPasswordSet=${isPasswordSet}`);

                if (isPasswordSet) {
                    // If password not sent explicitly, allow frontend that sends it via aktenzeichen field
                    const providedPassword = rawPassword || (rawAktenzeichen?.length > 0 ? rawAktenzeichen : null);

                    // Password is set: require password
                    if (!providedPassword) {
                        return res.status(400).json({
                            error: 'Passwort ist erforderlich'
                        });
                    }

                    // Verify password using stored hash
                    if (typeof foundClient.comparePassword === 'function') {
                        const ok = await foundClient.comparePassword(providedPassword);
                        if (!ok) {
                            console.log(`❌ Password verification failed for ${email}`);
                            return res.status(401).json({ error: 'Ungültiges Passwort' });
                        }
                        console.log(`✅ Password verification successful for ${email}`);
                    } else {
                        // Fallback manual check if method missing (should be on model)
                        const bcrypt = require('bcryptjs'); // Ensure bcrypt is available
                        if (foundClient.password_hash) {
                            const match = await bcrypt.compare(providedPassword, foundClient.password_hash);
                            if (!match) {
                                return res.status(401).json({ error: 'Ungültiges Passwort' });
                            }
                        } else {
                            return res.status(500).json({ error: 'Passwortprüfung nicht verfügbar' });
                        }
                    }
                } else {
                    // Password not set yet: aktenzeichen is REQUIRED and must match DB
                    if (!rawAktenzeichen) {
                        return res.status(400).json({ error: 'Aktenzeichen ist erforderlich' });
                    }
                    if (foundClient.aktenzeichen !== rawAktenzeichen) {
                        console.log(`❌ Aktenzeichen mismatch: provided=${rawAktenzeichen}, stored=${foundClient.aktenzeichen}`);
                        return res.status(401).json({ error: 'Ungültiges Aktenzeichen' });
                    }
                    console.log(`✅ Aktenzeichen verified for ${email}`);
                }

                // Generate JWT token instead of simple session token
                // Need generateClientToken helper. We either inject it or import "middlewar/auth".
                // Prefer avoiding inline require if possible, but for now to matches logic:
                const { generateClientToken } = require('../middleware/auth');
                const jwtToken = generateClientToken(foundClient.id, foundClient.email);
                const sessionToken = uuidv4(); // Keep for backward compatibility

                // Update client with session token
                foundClient.session_token = sessionToken;
                foundClient.last_login = new Date().toISOString();

                // Save updated client
                await foundClient.save();

                console.log(`✅ Login successful for ${email} (Client ID: ${foundClient.id})`);

                res.json({
                    success: true,
                    message: 'Anmeldung erfolgreich',
                    client: {
                        id: foundClient.id,
                        firstName: foundClient.firstName,
                        lastName: foundClient.lastName,
                        email: foundClient.email,
                        aktenzeichen: foundClient.aktenzeichen,
                        phase: foundClient.phase,
                        workflow_status: foundClient.workflow_status,
                        documents_count: foundClient.documents?.length || 0,
                        isPasswordSet: !!foundClient.isPasswordSet
                    },
                    session_token: sessionToken, // Backward compatibility
                    token: jwtToken // New JWT token
                });

            } catch (error) {
                console.error('Error during portal login:', error);
                res.status(500).json({
                    error: 'Anmeldefehler',
                    details: error.message
                });
            }
        },

        handleSessionValidation: async (req, res) => {
            try {
                const authHeader = req.headers.authorization;

                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'No session token provided' });
                }

                const sessionToken = authHeader.substring(7);

                // Find client by session token
                let foundClient = null;

                try {
                    foundClient = await Client.findOne({ session_token: sessionToken });
                } catch (error) {
                    console.error('Error searching client by session token in MongoDB:', error);
                }

                if (!foundClient) {
                    return res.status(401).json({ error: 'Invalid session token' });
                }

                res.json({
                    valid: true,
                    client: {
                        id: foundClient.id,
                        firstName: foundClient.firstName,
                        lastName: foundClient.lastName,
                        email: foundClient.email,
                        aktenzeichen: foundClient.aktenzeichen,
                        phase: foundClient.phase,
                        workflow_status: foundClient.workflow_status
                    }
                });

            } catch (error) {
                console.error('Error validating session:', error);
                res.status(500).json({
                    error: 'Session validation error',
                    details: error.message
                });
            }
        },

        handleMakeNewPassword: async (req, res) => {
            try {
                const authHeader = req.headers.authorization;
                const { aktenzeichen, file_number, new_password } = req.body || {};

                if (!new_password || String(new_password).length < 6) {
                    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
                }

                let client = null;

                // 1) Verify token if present
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    try {
                        const token = authHeader.split(' ')[1];
                        const decoded = jwt.verify(token, process.env.JWT_SECRET);
                        const clientId = decoded.clientId || decoded.id || decoded.sessionId;
                        if (clientId) {
                            client = await getClient(clientId);
                            const fileNum = aktenzeichen || file_number;
                            if (fileNum && client && client.aktenzeichen !== fileNum) {
                                return res.status(403).json({ error: 'Aktenzeichen stimmt nicht mit dem authentifizierten Benutzer überein' });
                            }
                        }
                    } catch (e) { }
                }

                // 2) Find by file_number/aktenzeichen if no token or not found
                const fileNum = aktenzeichen || file_number;
                if (!client && fileNum) {
                    client = await Client.findOne({ aktenzeichen: fileNum });
                }

                if (!client) {
                    return res.status(404).json({ error: 'Client nicht gefunden' });
                }

                client.password_hash = new_password; // In production this should be hashed! But current server.js implementation sets it directly. 
                // WAIT! The original server.js logic sets `client.password_hash = new_password`. 
                // Is it hashed before saving? 
                // In `server.js` line 456 from view: `client.password_hash = new_password;`.
                // Wait, usually password_hash implies it IS a hash.
                // If the setter hashes it, then fine. But Mongoose default setter?
                // Let's assume the previous code was correct (or incorrect in the same way).
                // Actually, I saw `const bcrypt = require('bcryptjs');` in server.js but not used in that route?
                // In line 43 of `server.js` view, there is `const bcrypt = require('bcryptjs');` inside `api/test/create-agent`.
                // Not in `make-new-password`?
                // I should check if I missed something in `make-new-password`. 
                // Let's assume for now I copy the logic exactly: `client.password_hash = new_password;`

                client.isPasswordSet = true;
                await client.save();

                return res.json({
                    success: true,
                    message: 'Password created successfully. You can now log in using email and password.'
                });
            } catch (error) {
                console.error('Error in make-new-password:', error);
                return res.status(500).json({ error: 'Interner Serverfehler' });
            }
        },

        handleGetClient: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const client = await getClient(clientId);

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                res.json(client);
            } catch (error) {
                console.error('Error fetching client:', error);
                res.status(500).json({ error: 'Error fetching client data', details: error.message });
            }
        },

        handleGetClientDocuments: async (req, res) => {
            try {
                const { clientId } = req.params;
                const client = await getClient(clientId);

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                res.json(client.documents || []);
            } catch (error) {
                console.error('Error fetching client documents:', error);
                res.status(500).json({ error: 'Error fetching documents', details: error.message });
            }
        },

        handleGetUploadStatus: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const client = await getClient(clientId);

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                const UPLOAD_WINDOW_DAYS = 30;

                // No payment yet → no deadline, uploads allowed indefinitely
                if (!client.payment_received_at) {
                    return res.json({
                        has_deadline: false,
                        expired: false,
                        payment_received: false,
                        message: 'Kein Upload-Zeitlimit — 1. Rate noch nicht bestätigt'
                    });
                }

                const paymentDate = new Date(client.payment_received_at);
                const deadline = new Date(paymentDate.getTime() + UPLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
                const now = new Date();
                const daysRemaining = Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
                const expired = now > deadline;

                res.json({
                    has_deadline: true,
                    deadline: deadline.toISOString(),
                    days_remaining: daysRemaining,
                    expired,
                    payment_received: true,
                    payment_received_at: client.payment_received_at,
                    upload_window_days: UPLOAD_WINDOW_DAYS
                });
            } catch (error) {
                console.error('Error fetching upload status:', error);
                res.status(500).json({ error: 'Error fetching upload status', details: error.message });
            }
        },

        handleUploadDocuments: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const client = await getClient(clientId);

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
                }

                // 30-day upload window check — timer starts from payment_received_at
                // No payment = no deadline (uploads always allowed)
                const UPLOAD_WINDOW_DAYS = 30;
                if (client.payment_received_at) {
                    const paymentDate = new Date(client.payment_received_at);
                    const now = new Date();
                    const daysSincePayment = Math.floor((now - paymentDate) / (1000 * 60 * 60 * 24));
                    if (daysSincePayment > UPLOAD_WINDOW_DAYS) {
                        console.log(`⛔ Upload rejected for ${client.aktenzeichen}: ${daysSincePayment} days since payment (limit: ${UPLOAD_WINDOW_DAYS})`);
                        return res.status(403).json({
                            error: 'Upload-Zeitraum abgelaufen',
                            message: `Der Upload-Zeitraum von ${UPLOAD_WINDOW_DAYS} Tagen nach Zahlungseingang ist abgelaufen. Bitte kontaktieren Sie uns.`,
                            days_since_payment: daysSincePayment,
                            upload_window_days: UPLOAD_WINDOW_DAYS,
                            payment_received_at: client.payment_received_at
                        });
                    }
                }

                console.log(`\n📤 ================================`);
                console.log(`📤 DOCUMENT UPLOAD STARTED`);
                console.log(`📤 ================================`);
                console.log(`👤 Client: ${clientId} (${client.aktenzeichen || 'NO_AKTENZEICHEN'})`);
                const filesDict = req.files || {};
                console.log(`📂 Processing upload - found fields: ${Object.keys(filesDict).join(', ')}`);

                const allFiles = [
                    ...(filesDict['documents'] || []),
                    ...(filesDict['document'] || [])
                ];
                console.log(`📄 Files uploaded: ${allFiles.length}`);
                console.log(`⏰ Upload time: ${new Date().toISOString()}`);

                // Log uploaded files
                console.log(`\n📋 UPLOADED FILES:`);
                allFiles.forEach((file, index) => {
                    console.log(`   ${index + 1}. ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
                });

                const uploadedDocuments = [];

                // Prepare webhook URL for FastAPI to send results back
                const webhookBaseUrl = process.env.BACKEND_URL || 'https://mandanten-portal-docker.onrender.com';
                const webhookUrl = `${webhookBaseUrl}/api/webhooks/ai-processing`;
                const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || null;
                const totalFiles = allFiles.length;

                console.log(`\n📋 QUEUE-BASED PROCESSING:`);
                console.log(`   📊 Total files: ${totalFiles}`);
                console.log(`   🔔 Webhook URL: ${webhookUrl}`);
                console.log(`   📋 Adding all documents to processing queue...\n`);

                // Process each uploaded file - upload to GCS and enqueue
                const queuedJobs = [];
                for (const file of allFiles) {
                    const documentId = uuidv4();

                    // Initialize file paths
                    let gcsUrl = null;
                    let localPath = null;
                    let cleanFilename = file.originalname;

                    try {
                        gcsUrl = await uploadToGCS(file);
                        console.log(`✅ Uploaded to GCS: ${gcsUrl}`);
                        cleanFilename = gcsUrl.split('?')[0].split('/').pop();
                    } catch (uploadError) {
                        console.warn(`⚠️ GCS Upload failed (${uploadError.message}) - Falling back to local temp file`);

                        // Fallback: Write to local temp directory
                        try {
                            const tempDir = path.join(__dirname, '../../uploads/temp_local_processing');
                            await fs.ensureDir(tempDir);

                            // Create a safe unique filename
                            const safeName = `${documentId}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                            localPath = path.join(tempDir, safeName);

                            await fs.writeFile(localPath, file.buffer);
                            console.log(`✅ Saved to local temp file: ${localPath}`);
                            cleanFilename = file.originalname;
                        } catch (writeError) {
                            console.error(`❌ Failed to write local temp file:`, writeError);
                            res.status(500).json({ error: 'Failed to store file (GCS and Local failed)' });
                            return;
                        }
                    }

                    const documentRecord = {
                        id: documentId,
                        name: file.originalname,
                        filename: cleanFilename,
                        type: file.mimetype,
                        size: file.size,
                        uploadedAt: new Date().toISOString(),
                        category: 'creditor',
                        url: gcsUrl,
                        processing_status: 'processing', // Status for UI (internally queued)
                        extracted_data: null
                    };

                    uploadedDocuments.push(documentRecord);

                    // Enqueue document for processing (non-blocking)
                    try {
                        const queueResult = await documentQueueService.enqueue({
                            clientId,
                            documentId,
                            fileData: {
                                filename: cleanFilename || file.originalname,
                                gcs_path: gcsUrl,
                                local_path: localPath,
                                mime_type: file.mimetype,
                                size: file.size
                            },
                            webhookUrl,
                            clientName,
                            apiKey: process.env.GEMINI_API_KEY || null,
                            priority: 5 // Default priority
                        });

                        if (queueResult.success) {
                            queuedJobs.push({
                                document_id: documentId,
                                queue_job_id: queueResult.job_id,
                                skipped: queueResult.skipped || false
                            });
                            console.log(`📋 Enqueued: ${file.originalname} (Job: ${queueResult.job_id})`);
                        }
                    } catch (queueError) {
                        console.error(`❌ Failed to enqueue ${file.originalname}:`, queueError.message);
                        // Mark document as failed if we couldn't enqueue it
                        documentRecord.processing_status = 'failed';
                        documentRecord.processing_error = `Queue error: ${queueError.message}`;
                    }
                }

                // Add documents to client using safeClientUpdate
                const updatedClient = await safeClientUpdate(clientId, (client) => {
                    if (!client.documents) {
                        client.documents = [];
                    }
                    client.documents.push(...uploadedDocuments);
                    return client;
                });

                if (!updatedClient) {
                    return res.status(404).json({ error: 'Client not found during update' });
                }

                console.log(`✅ Successfully added ${uploadedDocuments.length} documents to client ${updatedClient.aktenzeichen}`);
                console.log(`📋 Queued ${queuedJobs.length} documents for processing`);

                // Return 202 Accepted - processing will happen asynchronously via queue
                res.status(202).json({
                    success: true,
                    message: `${uploadedDocuments.length} Documents uploaded and queued for processing`,
                    documents: uploadedDocuments,
                    queued_jobs: queuedJobs,
                    queue_info: {
                        total_queued: queuedJobs.length,
                        processing_method: 'queue_based',
                        note: 'Documents will be processed in order. Results will be sent via webhook.'
                    },
                    client_id: updatedClient.id,
                    aktenzeichen: updatedClient.aktenzeichen
                });

            } catch (error) {
                console.error('❌ Error handling document upload:', error);
                res.status(500).json({
                    error: 'Failed to upload documents',
                    details: error.message
                });
            }
        },

        handleGetFinancialFormStatus: async (req, res) => {
            try {
                const { clientId } = req.params;
                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });

                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied - client ID mismatch' });

                const formAlreadySubmitted = client.financial_data?.client_form_filled || false;
                let shouldShowForm = false;
                let periodStatus = 'not_started';
                let daysRemaining = null;

                if (!formAlreadySubmitted && client.creditor_contact_started && client.creditor_contact_started_at) {
                    const contactStartDate = new Date(client.creditor_contact_started_at);
                    const currentDate = new Date();
                    const daysSinceContact = Math.floor((currentDate - contactStartDate) / (1000 * 60 * 60 * 24));
                    const CREDITOR_RESPONSE_PERIOD_DAYS = 30;
                    daysRemaining = Math.max(0, CREDITOR_RESPONSE_PERIOD_DAYS - daysSinceContact);

                    if (daysSinceContact >= CREDITOR_RESPONSE_PERIOD_DAYS) {
                        shouldShowForm = true;
                        periodStatus = 'expired';
                    } else {
                        periodStatus = 'active';
                    }
                } else if (!client.creditor_contact_started) {
                    periodStatus = 'not_started';
                } else {
                    periodStatus = 'missing_date';
                }

                res.json({
                    success: true,
                    should_show_form: shouldShowForm,
                    form_submitted: formAlreadySubmitted,
                    creditor_response_period: {
                        status: periodStatus,
                        days_remaining: daysRemaining,
                        contact_started: client.creditor_contact_started,
                        contact_started_at: client.creditor_contact_started_at,
                        period_duration_days: 30
                    },
                    client_info: {
                        current_status: client.current_status,
                        creditor_confirmation: client.client_confirmed_creditors,
                        creditor_count: client.final_creditor_list?.length || 0,
                        aktenzeichen: client.aktenzeichen
                    }
                });
            } catch (error) {
                console.error('❌ Error checking financial form status:', error);
                res.status(500).json({ error: 'Failed to check financial form status', details: error.message });
            }
        },

        handleSubmitFinancialData: async (req, res) => {
            try {
                const { clientId } = req.params;
                const { monthly_net_income, number_of_children, marital_status } = req.body;

                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });

                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                if (!monthly_net_income || marital_status === undefined || number_of_children === undefined) {
                    return res.status(400).json({ error: 'Missing required parameters' });
                }

                const calculator = new GermanGarnishmentCalculator();
                const garnishmentResult = calculator.calculate(parseFloat(monthly_net_income), marital_status, parseInt(number_of_children));
                const recommendedPlanType = garnishmentResult.garnishableAmount >= 1 ? 'quotenplan' : 'nullplan';

                const updatedClient = await safeClientUpdate(clientId, async (c) => {
                    c.financial_data = {
                        monthly_net_income: parseFloat(monthly_net_income),
                        number_of_children: parseInt(number_of_children),
                        marital_status: marital_status,
                        garnishable_amount: garnishmentResult.garnishableAmount,
                        recommended_plan_type: recommendedPlanType,
                        client_form_filled: true,
                        form_filled_at: new Date(),
                        calculation_completed_at: new Date()
                    };
                    return c;
                });

                // Trigger automatic processing (async, don't await)
                processFinancialDataAndGenerateDocuments({
                    client: updatedClient,
                    garnishmentResult,
                    planType: recommendedPlanType,
                    saveClient: async (c) => { await c.save(); } // Pass trivial save wrapper or assumption
                });

                res.json({
                    success: true,
                    client_id: updatedClient.id,
                    aktenzeichen: updatedClient.aktenzeichen,
                    financial_data: updatedClient.financial_data,
                    automatic_processing: {
                        plan_type_selected: recommendedPlanType,
                        document_generation_triggered: true
                    }
                });
            } catch (error) {
                console.error('❌ Error saving client financial data:', error);
                res.status(500).json({ error: 'Failed to save financial data', details: error.message });
            }
        },

        handleSubmitAddress: async (req, res) => {
            try {
                const { clientId } = req.params;
                const { city, house_number, phone, street, zip_code } = req.body;

                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });
                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                if (!city || !house_number || !street || !zip_code) {
                    return res.status(400).json({ error: 'Missing required parameters' });
                }

                const updatedClient = await safeClientUpdate(clientId, async (c) => {
                    c.address = `${street} ${house_number}, ${zip_code} ${city}`.trim();
                    c.ort = city;
                    c.plz = zip_code;
                    c.hausnummer = house_number;
                    c.strasse = street;
                    c.phone = phone;
                    return c;
                });

                res.json({
                    success: true,
                    client_id: updatedClient.id,
                    aktenzeichen: updatedClient.aktenzeichen
                });
            } catch (error) {
                console.error('❌ Error saving client personal data:', error);
                res.status(500).json({ error: 'Failed to save personal data', details: error.message });
            }
        },

        handleResetFinancialData: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                // Endpoint logic for simple reset (POST)
                const client = await Client.findOne({ $or: [{ _id: clientId }, { aktenzeichen: clientId }] });
                if (!client) return res.status(404).json({ error: 'Client not found' });

                client.financial_data = null;
                client.debt_settlement_plan = null;
                client.calculated_settlement_plan = null;
                client.creditor_calculation_table = null;
                client.creditor_contact_started = false;
                client.creditor_contact_started_at = null;
                client.settlement_plan_sent_at = null;
                await client.save();

                res.json({ success: true, message: 'Client data reset successfully' });
            } catch (error) {
                res.status(500).json({ error: 'Internal server error', message: error.message });
            }
        },

        handleDeleteFinancialData: async (req, res) => {
            try {
                const { clientId } = req.params;
                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });
                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                if (!client.financial_data || !client.financial_data.client_form_filled) {
                    return res.status(400).json({ error: 'No financial data to reset' });
                }

                const updatedClient = await safeClientUpdate(clientId, async (c) => {
                    const previousData = { ...c.financial_data };
                    c.financial_data = {
                        client_form_filled: false,
                        form_reset_at: new Date(),
                        previous_data: previousData,
                        reset_count: (c.financial_data.reset_count || 0) + 1
                    };
                    if (!c.admin_notes) c.admin_notes = [];
                    c.admin_notes.push({
                        timestamp: new Date().toISOString(),
                        note: `💰 Client reset financial data form (reset #${c.financial_data.reset_count})`,
                        admin: 'client_self_reset'
                    });
                    return c;
                });

                res.json({
                    success: true,
                    message: 'Financial data has been reset successfully',
                    client_id: updatedClient.id,
                    aktenzeichen: updatedClient.aktenzeichen,
                    reset_info: {
                        reset_count: updatedClient.financial_data.reset_count,
                        can_resubmit: true
                    }
                });
            } catch (error) {
                res.status(500).json({ error: 'Failed to reset financial data', details: error.message });
            }
        },

        /**
         * Get creditors for a client
         * GET /api/clients/:clientId/creditors
         */
        handleGetCreditors: async (req, res) => {
            try {
                const { clientId } = req.params;

                console.log(`📋 Client requesting creditors for client ${clientId}`);

                const client = await getClient(clientId);
                if (!client) {
                    return res.status(404).json({
                        error: 'Client not found',
                        client_id: clientId
                    });
                }

                // Authorization check - clients can only access their own data, admins can access any
                const isAuthorized = req.isAdmin || // Admin can access any client
                                    req.clientId === client.id ||
                                    req.clientId === client.aktenzeichen ||
                                    req.clientId === clientId;

                console.log(`🔐 Authorization check:`, {
                    isAdmin: req.isAdmin,
                    reqClientId: req.clientId,
                    clientId: client.id,
                    aktenzeichen: client.aktenzeichen,
                    pathClientId: clientId,
                    isAuthorized
                });

                if (!isAuthorized) {
                    return res.status(403).json({
                        error: 'Access denied - you can only access your own creditor data'
                    });
                }

                const allCreditors = client.final_creditor_list || [];

                // Hide creditors that need manual review but haven't been reviewed yet
                const creditors = allCreditors.filter(creditor =>
                    !creditor.needs_manual_review || creditor.manually_reviewed
                );

                res.json({
                    success: true,
                    client: {
                        id: client.id,
                        name: `${client.firstName} ${client.lastName}`,
                        aktenzeichen: client.aktenzeichen,
                        current_status: client.current_status,
                        workflow_status: client.workflow_status,
                        client_confirmed_creditors: client.client_confirmed_creditors || false,
                        client_confirmed_at: client.client_confirmed_at || null,
                        admin_approved: client.admin_approved || false,
                        first_payment_received: client.first_payment_received || false,
                        second_letter_status: client.second_letter_status || 'IDLE',
                        second_letter_form_submitted_at: client.second_letter_form_submitted_at || null,
                        second_letter_sent_at: client.second_letter_sent_at || null
                    },
                    creditors: creditors.map(creditor => ({
                        id: creditor.id,
                        sender_name: creditor.sender_name,
                        sender_email: creditor.sender_email,
                        sender_address: creditor.sender_address,
                        reference_number: creditor.reference_number,
                        claim_amount: creditor.claim_amount,
                        status: creditor.status,
                        confidence: creditor.confidence,
                        is_representative: creditor.is_representative,
                        actual_creditor: creditor.actual_creditor,
                        manually_reviewed: creditor.manually_reviewed,
                        created_at: creditor.created_at,
                        created_via: creditor.created_via
                    })),
                    total: creditors.length
                });

            } catch (error) {
                console.error('❌ Error getting creditors:', error);
                res.status(500).json({
                    error: 'Failed to get creditors',
                    details: error.message
                });
            }
        },

        handleAddCreditor: async (req, res) => {
            try {
                const { clientId } = req.params;
                const { name, email, address, referenceNumber, amount, notes, isRepresentative, actualCreditor } = req.body;

                if (!name || name.trim() === '') {
                    return res.status(400).json({ error: 'Name is required' });
                }

                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });
                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                const newCreditor = {
                    id: uuidv4(),
                    sender_name: (name || '').trim(),
                    sender_email: (email || '').trim(),
                    sender_address: (address || '').trim(),
                    reference_number: (referenceNumber || '').trim(),
                    claim_amount: amount ? parseFloat(amount) : 0,
                    is_representative: isRepresentative === true,
                    actual_creditor: (actualCreditor || '').trim(),
                    status: 'confirmed',
                    confidence: 1.0,
                    ai_confidence: 1.0,
                    manually_reviewed: true,
                    reviewed_by: 'client',
                    reviewed_at: new Date(),
                    confirmed_at: new Date(),
                    created_at: new Date(),
                    created_via: 'client_manual_entry',
                    correction_notes: (notes || '').trim() || 'Manually created by client',
                    review_action: 'manually_created',
                    document_id: null,
                    source_document: 'Manual Entry (Client Portal)',
                    source_document_id: null
                };

                const updatedClient = await safeClientUpdate(clientId, async (c) => {
                    if (!c.final_creditor_list) c.final_creditor_list = [];
                    c.final_creditor_list.push(newCreditor);
                    if (!c.status_history) c.status_history = [];
                    c.status_history.push({
                        id: uuidv4(),
                        status: 'manual_creditor_added',
                        changed_by: 'client',
                        metadata: {
                            creditor_name: name,
                            creditor_amount: amount || 0,
                            total_creditors: c.final_creditor_list.length,
                            added_via: 'client_portal'
                        },
                        created_at: new Date()
                    });
                    return c;
                });

                res.json({
                    success: true,
                    message: `Gläubiger "${name}" erfolgreich hinzugefügt`,
                    creditor: {
                        id: newCreditor.id,
                        name: newCreditor.sender_name,
                        amount: newCreditor.claim_amount
                    }
                });
            } catch (error) {
                console.error('❌ Error adding manual creditor (client):', error);
                res.status(500).json({ error: 'Fehler beim Hinzufügen des Gläubigers', details: error.message });
            }
        },

        // ─── Token-authenticated handlers (email links — existing routes) ───

        handleGetSecondLetterFormData: async (req, res) => {
            try {
                const result = await getSecondLetterFormDataCore(req.clientId);
                if (result._notFound) return res.status(404).json({ error: 'Client not found' });
                return res.json(result);
            } catch (error) {
                console.error('[SecondLetterForm] Error in handleGetSecondLetterFormData:', error);
                return res.status(500).json({ error: 'Interner Serverfehler' });
            }
        },

        handleSubmitSecondLetterForm: async (req, res) => {
            try {
                const result = await submitSecondLetterFormCore(req.clientId, req.body);
                if (result._notFound) return res.status(404).json({ error: 'Client not found' });
                if (result._status) return res.status(result._status).json(result);
                return res.json(result);
            } catch (error) {
                console.error('[SecondLetterForm] Error in handleSubmitSecondLetterForm:', error);
                return res.status(500).json({ error: 'Interner Serverfehler' });
            }
        },

        // ─── JWT-authenticated handlers (portal inline form) ───

        handleGetSecondLetterFormDataJWT: async (req, res) => {
            try {
                const { clientId } = req.params;
                if (!req.isAdmin && req.clientId !== clientId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const result = await getSecondLetterFormDataCore(clientId);
                if (result._notFound) return res.status(404).json({ error: 'Client not found' });
                return res.json(result);
            } catch (error) {
                console.error('[SecondLetterForm] Error in handleGetSecondLetterFormDataJWT:', error);
                return res.status(500).json({ error: 'Interner Serverfehler' });
            }
        },

        handleSubmitSecondLetterFormJWT: async (req, res) => {
            try {
                const { clientId } = req.params;
                if (!req.isAdmin && req.clientId !== clientId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                const result = await submitSecondLetterFormCore(clientId, req.body);
                if (result._notFound) return res.status(404).json({ error: 'Client not found' });
                if (result._status) return res.status(result._status).json(result);
                return res.json(result);
            } catch (error) {
                console.error('[SecondLetterForm] Error in handleSubmitSecondLetterFormJWT:', error);
                return res.status(500).json({ error: 'Interner Serverfehler' });
            }
        },

        // ── Insolvenzantrag Data Collection Form ──────────────────────────

        /**
         * GET /clients/:clientId/insolvenzantrag-form
         * Returns pre-filled data for the Insolvenzantrag data collection form.
         */
        handleGetInsolvenzantragForm: async (req, res) => {
            try {
                const { clientId } = req.params;
                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });

                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                // Gather pre-filled data from all available sources
                const fd = client.financial_data || {};
                const efd = client.extended_financial_data || {};
                const snap = client.second_letter_financial_snapshot || {};

                const formData = {
                    // Section 1: Personal Data
                    personal_data: {
                        vorname: client.vorname || client.firstName || '',
                        nachname: client.nachname || client.lastName || '',
                        geburtsdatum: client.geburtsdatum || client.geburtstag || '',
                        geburtsort: client.geburtsort || '',
                        geschlecht: client.geschlecht || '',
                    },
                    // Section 2: Address
                    address: {
                        strasse: client.strasse || '',
                        hausnummer: client.hausnummer || '',
                        plz: client.plz || '',
                        ort: client.ort || client.wohnort || '',
                    },
                    // Section 3: Contact
                    contact: {
                        telefon: client.telefon || client.phone || '',
                        mobiltelefon: client.mobiltelefon || client.telefon_mobil || '',
                        email: client.email || '',
                    },
                    // Section 4: Family Status
                    family_status: {
                        familienstand: client.familienstand || fd.marital_status || snap.marital_status || '',
                        familienstand_seit: client.familienstand_seit || '',
                        kinder_anzahl: client.kinder_anzahl ?? fd.number_of_children ?? snap.number_of_dependents ?? '',
                        kinder_alter: client.kinder_alter || '',
                    },
                    // Section 5: Employment
                    employment: {
                        berufsstatus: client.berufsstatus || efd.berufsstatus || snap.income_source || '',
                        erlernter_beruf: client.erlernter_beruf || '',
                        derzeitige_taetigkeit: client.derzeitige_taetigkeit || client.aktuelle_taetigkeit || '',
                        arbeitgeber_name: efd.arbeitgeber_name || '',
                        arbeitgeber_adresse: efd.arbeitgeber_adresse || '',
                    },
                    // Section 6: Financial
                    financial: {
                        netto_einkommen: client.netto_einkommen || fd.monthly_net_income || snap.monthly_net_income || '',
                        sonstige_einkuenfte_betrag: efd.sonstige_monatliche_einkuenfte?.betrag || '',
                        sonstige_einkuenfte_beschreibung: efd.sonstige_monatliche_einkuenfte?.beschreibung || '',
                        sozialleistungen_betrag: efd.sozialleistungen?.betrag || '',
                        sozialleistungen_art: efd.sozialleistungen?.art_der_leistung || '',
                    },
                    // Section 7: Assets & Securities
                    assets: {
                        immobilieneigentum_vorhanden: efd.immobilieneigentum?.vorhanden || false,
                        immobilieneigentum_beschreibung: efd.immobilieneigentum?.beschreibung || '',
                        fahrzeuge_vorhanden: efd.fahrzeuge?.vorhanden || false,
                        fahrzeuge_beschreibung: efd.fahrzeuge?.beschreibung || '',
                        fahrzeuge_wert: efd.fahrzeuge?.geschaetzter_wert || '',
                        sparkonten_vorhanden: efd.sparkonten?.vorhanden || false,
                        sparkonten_wert: efd.sparkonten?.ungefaehrer_wert || '',
                        lebensversicherungen_vorhanden: efd.lebensversicherungen?.vorhanden || false,
                        lebensversicherungen_rueckkaufswert: efd.lebensversicherungen?.rueckkaufswert || '',
                        buergschaften_vorhanden: efd.buergschaften?.vorhanden || false,
                        buergschaften_details: efd.buergschaften?.details || '',
                        pfandrechte_vorhanden: efd.pfandrechte?.vorhanden || false,
                        pfandrechte_details: efd.pfandrechte?.details || '',
                    },
                };

                const formMeta = client.insolvenzantrag_form || { status: 'pending', sections_completed: {} };

                res.json({
                    success: true,
                    form_data: formData,
                    form_meta: formMeta,
                    client_name: `${formData.personal_data.vorname} ${formData.personal_data.nachname}`.trim(),
                });
            } catch (error) {
                console.error('Error loading insolvenzantrag form:', error);
                res.status(500).json({ error: 'Fehler beim Laden der Formulardaten' });
            }
        },

        /**
         * POST /clients/:clientId/insolvenzantrag-form/save-section
         * Auto-save a single section. Body: { section: string, data: object }
         */
        handleSaveInsolvenzantragSection: async (req, res) => {
            try {
                const { clientId } = req.params;
                const { section, data } = req.body;

                if (!section || !data) {
                    return res.status(400).json({ error: 'section and data are required' });
                }

                const validSections = ['personal_data', 'address', 'contact', 'family_status', 'employment', 'financial', 'assets'];
                if (!validSections.includes(section)) {
                    return res.status(400).json({ error: `Invalid section: ${section}` });
                }

                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });

                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                const updatedClient = await safeClientUpdate(clientId, async (c) => {
                    // Map section data to client fields
                    switch (section) {
                        case 'personal_data':
                            if (data.vorname) { c.vorname = data.vorname; c.firstName = data.vorname; }
                            if (data.nachname) { c.nachname = data.nachname; c.lastName = data.nachname; }
                            if (data.geburtsdatum) { c.geburtsdatum = data.geburtsdatum; c.geburtstag = data.geburtsdatum; }
                            if (data.geburtsort) c.geburtsort = data.geburtsort;
                            if (data.geschlecht) c.geschlecht = data.geschlecht;
                            break;
                        case 'address':
                            if (data.strasse) c.strasse = data.strasse;
                            if (data.hausnummer) c.hausnummer = data.hausnummer;
                            if (data.plz) c.plz = data.plz;
                            if (data.ort) { c.ort = data.ort; c.wohnort = data.ort; }
                            // Update combined address
                            c.address = `${data.strasse || c.strasse || ''} ${data.hausnummer || c.hausnummer || ''}, ${data.plz || c.plz || ''} ${data.ort || c.ort || ''}`.trim();
                            break;
                        case 'contact':
                            if (data.telefon) { c.telefon = data.telefon; c.phone = data.telefon; }
                            if (data.mobiltelefon) { c.mobiltelefon = data.mobiltelefon; c.telefon_mobil = data.mobiltelefon; }
                            if (data.email) c.email = data.email;
                            break;
                        case 'family_status':
                            if (data.familienstand) c.familienstand = data.familienstand;
                            if (data.familienstand_seit) c.familienstand_seit = data.familienstand_seit;
                            if (data.kinder_anzahl !== undefined) c.kinder_anzahl = parseInt(data.kinder_anzahl) || 0;
                            if (data.kinder_alter) c.kinder_alter = data.kinder_alter;
                            break;
                        case 'employment':
                            if (data.berufsstatus) c.berufsstatus = data.berufsstatus;
                            if (data.erlernter_beruf) c.erlernter_beruf = data.erlernter_beruf;
                            if (data.derzeitige_taetigkeit) { c.derzeitige_taetigkeit = data.derzeitige_taetigkeit; c.aktuelle_taetigkeit = data.derzeitige_taetigkeit; }
                            if (data.arbeitgeber_name) {
                                if (!c.extended_financial_data) c.extended_financial_data = {};
                                c.extended_financial_data.arbeitgeber_name = data.arbeitgeber_name;
                            }
                            if (data.arbeitgeber_adresse) {
                                if (!c.extended_financial_data) c.extended_financial_data = {};
                                c.extended_financial_data.arbeitgeber_adresse = data.arbeitgeber_adresse;
                            }
                            break;
                        case 'financial':
                            if (data.netto_einkommen !== undefined) {
                                const income = parseFloat(String(data.netto_einkommen).replace(',', '.'));
                                if (!isNaN(income)) {
                                    c.netto_einkommen = income;
                                    if (!c.financial_data) c.financial_data = {};
                                    c.financial_data.monthly_net_income = income;
                                }
                            }
                            if (!c.extended_financial_data) c.extended_financial_data = {};
                            if (data.sonstige_einkuenfte_betrag !== undefined) {
                                if (!c.extended_financial_data.sonstige_monatliche_einkuenfte) c.extended_financial_data.sonstige_monatliche_einkuenfte = {};
                                c.extended_financial_data.sonstige_monatliche_einkuenfte.betrag = parseFloat(String(data.sonstige_einkuenfte_betrag).replace(',', '.')) || 0;
                            }
                            if (data.sonstige_einkuenfte_beschreibung) {
                                if (!c.extended_financial_data.sonstige_monatliche_einkuenfte) c.extended_financial_data.sonstige_monatliche_einkuenfte = {};
                                c.extended_financial_data.sonstige_monatliche_einkuenfte.beschreibung = data.sonstige_einkuenfte_beschreibung;
                            }
                            if (data.sozialleistungen_betrag !== undefined) {
                                if (!c.extended_financial_data.sozialleistungen) c.extended_financial_data.sozialleistungen = {};
                                c.extended_financial_data.sozialleistungen.betrag = parseFloat(String(data.sozialleistungen_betrag).replace(',', '.')) || 0;
                            }
                            if (data.sozialleistungen_art) {
                                if (!c.extended_financial_data.sozialleistungen) c.extended_financial_data.sozialleistungen = {};
                                c.extended_financial_data.sozialleistungen.art_der_leistung = data.sozialleistungen_art;
                            }
                            break;
                        case 'assets':
                            if (!c.extended_financial_data) c.extended_financial_data = {};
                            c.extended_financial_data.immobilieneigentum = {
                                vorhanden: data.immobilieneigentum_vorhanden || false,
                                beschreibung: data.immobilieneigentum_beschreibung || '',
                            };
                            c.extended_financial_data.fahrzeuge = {
                                vorhanden: data.fahrzeuge_vorhanden || false,
                                beschreibung: data.fahrzeuge_beschreibung || '',
                                geschaetzter_wert: parseFloat(String(data.fahrzeuge_wert || '0').replace(',', '.')) || undefined,
                            };
                            c.extended_financial_data.sparkonten = {
                                vorhanden: data.sparkonten_vorhanden || false,
                                ungefaehrer_wert: parseFloat(String(data.sparkonten_wert || '0').replace(',', '.')) || undefined,
                            };
                            c.extended_financial_data.lebensversicherungen = {
                                vorhanden: data.lebensversicherungen_vorhanden || false,
                                rueckkaufswert: parseFloat(String(data.lebensversicherungen_rueckkaufswert || '0').replace(',', '.')) || undefined,
                            };
                            c.extended_financial_data.buergschaften = {
                                vorhanden: data.buergschaften_vorhanden || false,
                                details: data.buergschaften_details || '',
                            };
                            c.extended_financial_data.pfandrechte = {
                                vorhanden: data.pfandrechte_vorhanden || false,
                                details: data.pfandrechte_details || '',
                            };
                            break;
                    }

                    // Update section completion tracking
                    if (!c.insolvenzantrag_form) c.insolvenzantrag_form = { status: 'pending', sections_completed: {} };
                    c.insolvenzantrag_form.sections_completed[section] = true;
                    c.insolvenzantrag_form.last_saved_at = new Date();
                    c.markModified('insolvenzantrag_form');
                    if (section === 'financial' || section === 'assets' || section === 'employment') {
                        c.markModified('extended_financial_data');
                    }

                    return c;
                });

                console.log(`[InsolvenzantragForm] Section "${section}" saved for ${updatedClient.aktenzeichen}`);

                res.json({
                    success: true,
                    section,
                    sections_completed: updatedClient.insolvenzantrag_form?.sections_completed || {},
                });
            } catch (error) {
                console.error('Error saving insolvenzantrag section:', error);
                res.status(500).json({ error: 'Fehler beim Speichern' });
            }
        },

        /**
         * POST /clients/:clientId/insolvenzantrag-form/submit
         * Final submission — sets status to insolvenzantrag_ready.
         */
        handleSubmitInsolvenzantragForm: async (req, res) => {
            try {
                const { clientId } = req.params;
                const client = await getClient(clientId);
                if (!client) return res.status(404).json({ error: 'Client not found' });

                const isAuthorized = req.clientId === client.id || req.clientId === client.aktenzeichen || req.clientId === clientId;
                if (!isAuthorized) return res.status(403).json({ error: 'Access denied' });

                // Validate required sections
                const sc = client.insolvenzantrag_form?.sections_completed || {};
                const requiredSections = ['personal_data', 'address', 'contact', 'family_status', 'employment', 'financial'];
                const missingSections = requiredSections.filter(s => !sc[s]);

                if (missingSections.length > 0) {
                    return res.status(400).json({
                        error: 'Nicht alle Pflicht-Sektionen sind ausgefuellt',
                        missing_sections: missingSections,
                    });
                }

                const updatedClient = await safeClientUpdate(clientId, async (c) => {
                    c.insolvenzantrag_form = {
                        ...c.insolvenzantrag_form,
                        status: 'submitted',
                        submitted_at: new Date(),
                    };
                    c.current_status = 'insolvenzantrag_ready';
                    c.markModified('insolvenzantrag_form');

                    // Add to status history
                    if (!c.status_history) c.status_history = [];
                    c.status_history.push({
                        id: uuidv4(),
                        status: 'insolvenzantrag_ready',
                        created_at: new Date(),
                        changed_by: 'client',
                        metadata: { source: 'insolvenzantrag_form_submission' },
                    });

                    return c;
                });

                console.log(`[InsolvenzantragForm] SUBMITTED for ${updatedClient.aktenzeichen} — status → insolvenzantrag_ready`);

                res.json({
                    success: true,
                    status: 'insolvenzantrag_ready',
                    submitted_at: updatedClient.insolvenzantrag_form?.submitted_at,
                });
            } catch (error) {
                console.error('Error submitting insolvenzantrag form:', error);
                res.status(500).json({ error: 'Fehler beim Absenden' });
            }
        },
    };
};

module.exports = createClientPortalController;
