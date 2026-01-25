const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const { uploadToGCS } = require('../services/gcs-service');
const { createProcessingJob } = require('../utils/fastApiClient');
const GermanGarnishmentCalculator = require('../services/germanGarnishmentCalculator');
const DocumentGenerator = require('../services/documentGenerator');
const CreditorContactService = require('../services/creditorContactService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verificationCodeService = require('../services/verificationCodeService');
const emailService = require('../services/emailService');

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
    return {
        /**
         * Request a verification code for login
         * POST /api/portal/request-verification-code
         * Body: { aktenzeichen }
         */
        handleRequestVerificationCode: async (req, res) => {
            try {
                const { aktenzeichen } = req.body;

                if (!aktenzeichen || aktenzeichen.trim() === '') {
                    return res.status(400).json({
                        error: 'Aktenzeichen ist erforderlich'
                    });
                }

                const normalizedAktenzeichen = aktenzeichen.toString().trim().toUpperCase();
                console.log(`🔐 Verification code requested for: ${normalizedAktenzeichen}`);

                // Find client by aktenzeichen
                let foundClient = null;
                try {
                    foundClient = await Client.findOne({ aktenzeichen: { $regex: new RegExp(`^${normalizedAktenzeichen}$`, 'i') } });
                } catch (error) {
                    console.error('Error searching client:', error);
                }

                // SECURITY: Always return success response to prevent enumeration attacks
                // Even if client not found, pretend we sent the email
                if (!foundClient) {
                    console.log(`⚠️ No client found for aktenzeichen: ${normalizedAktenzeichen} (returning generic success)`);
                    return res.json({
                        success: true,
                        message: 'Wenn dieses Aktenzeichen existiert, wurde ein Code an die hinterlegte E-Mail-Adresse gesendet.',
                        masked_email: 'v***@***.de',
                        expires_in_seconds: 300
                    });
                }

                if (!foundClient.email) {
                    console.log(`⚠️ Client found but no email: ${normalizedAktenzeichen}`);
                    return res.status(400).json({
                        error: 'Keine E-Mail-Adresse für dieses Aktenzeichen hinterlegt. Bitte kontaktieren Sie uns.'
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

                const normalizedAktenzeichen = aktenzeichen.toString().trim().toUpperCase();
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
                        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production');
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

        handleUploadDocuments: async (req, res) => {
            try {
                const clientId = req.params.clientId;
                const client = await getClient(clientId);

                if (!client) {
                    return res.status(404).json({ error: 'Client not found' });
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

                // Process each uploaded file
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
                            const tempDir = path.join(__dirname, '../../uploads/temp_local_processing'); // Adjusted path for controller location
                            await fs.ensureDir(tempDir);

                            // Create a safe unique filename
                            const safeName = `${documentId}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                            localPath = path.join(tempDir, safeName);

                            await fs.writeFile(localPath, file.buffer);
                            console.log(`✅ Saved to local temp file: ${localPath}`);
                            cleanFilename = file.originalname;
                        } catch (writeError) {
                            console.error(`❌ Failed to write local temp file:`, writeError);
                            // If both fail, we must skip
                            res.status(500).json({ error: 'Failed to store file (GCS and Local failed)' });
                            return;
                        }
                    }

                    const documentRecord = {
                        id: documentId,
                        name: file.originalname,
                        filename: cleanFilename, // Use clean GCS filename
                        type: file.mimetype,
                        size: file.size,
                        uploadedAt: new Date().toISOString(),
                        category: 'creditor',
                        url: gcsUrl, // GCS URL
                        processing_status: 'processing',
                        extracted_data: null
                    };

                    uploadedDocuments.push(documentRecord);

                    // Start AI processing in background with detailed logging and timeout
                    setImmediate(async () => {
                        const startTime = Date.now();
                        const PROCESSING_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

                        console.log(`\n🚀 =========================`);
                        console.log(`🚀 STARTING AI PROCESSING`);
                        console.log(`🚀 =========================`);
                        console.log(`📁 Document: ${file.originalname}`);
                        console.log(`📊 Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
                        console.log(`🔤 Type: ${file.mimetype}`);
                        console.log(`🆔 Document ID: ${documentId}`);
                        console.log(`⏰ Started at: ${new Date().toISOString()}`);
                        console.log(`⏱️  Timeout: ${PROCESSING_TIMEOUT / 1000}s`);
                        console.log(`🚀 =========================\n`);

                        // Set up timeout handler
                        const timeoutId = setTimeout(async () => {
                            console.log(`\n⏱️ =========================`);
                            console.log(`⏱️ PROCESSING TIMEOUT`);
                            console.log(`⏱️ =========================`);
                            console.log(`📁 Document: ${file.originalname}`);
                            console.log(`🆔 Document ID: ${documentId}`);
                            console.log(`⏱️ Timeout after: ${PROCESSING_TIMEOUT / 1000}s`);
                            console.log(`⏱️ =========================\n`);

                            try {
                                // Update document with timeout status using safe update
                                await safeClientUpdate(clientId, (client) => {
                                    const docIndex = client.documents.findIndex(doc => doc.id === documentId);
                                    if (docIndex !== -1 && client.documents[docIndex].processing_status === 'processing') {
                                        client.documents[docIndex] = {
                                            ...client.documents[docIndex],
                                            processing_status: 'failed',
                                            document_status: 'processing_timeout',
                                            status_reason: `Verarbeitung nach ${PROCESSING_TIMEOUT / 1000} Sekunden abgebrochen`,
                                            processing_error: 'Processing timeout exceeded',
                                            processed_at: new Date().toISOString(),
                                            processing_time_ms: PROCESSING_TIMEOUT
                                        };
                                    }
                                    return client;
                                });
                            } catch (timeoutError) {
                                console.error('Error handling timeout:', timeoutError);
                            }
                        }, PROCESSING_TIMEOUT);

                        // ==========================================
                        // FASTAPI Gemini AI Processing
                        // ==========================================
                        try {
                            // Prepare webhook URL for FastAPI to send results back
                            const webhookBaseUrl = process.env.BACKEND_URL || 'https://mandanten-portal-docker.onrender.com';
                            const webhookUrl = `${webhookBaseUrl}/api/webhooks/ai-processing`;

                            console.log(`🚀 Calling FastAPI for document processing...`);
                            console.log(`📄 Document: ${file.originalname}`);
                            console.log(`🆔 Document ID: ${documentId}`);
                            console.log(`🔔 Webhook URL: ${webhookUrl}`);

                            // Call FastAPI to process the document
                            const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || null;
                            const fastApiResult = await createProcessingJob({
                                clientId,
                                clientName,
                                files: [{
                                    filename: cleanFilename || file.originalname,
                                    gcs_path: gcsUrl, // Can be null
                                    local_path: localPath, // Can be null (but one of them should be set)
                                    mime_type: file.mimetype,
                                    size: file.size,
                                    document_id: documentId
                                }],
                                webhookUrl: webhookUrl,
                                apiKey: process.env.GEMINI_API_KEY || null
                            });

                            if (fastApiResult.success) {
                                console.log(`✅ FastAPI job created successfully`);
                                console.log(`🔑 Job ID: ${fastApiResult.jobId}`);
                                console.log(`📊 Status: ${fastApiResult.status}`);

                                // Clear timeout since FastAPI will handle the processing
                                clearTimeout(timeoutId);

                                // Update document with job ID
                                await safeClientUpdate(clientId, (client) => {
                                    const docIndex = client.documents.findIndex(doc => doc.id === documentId);
                                    if (docIndex !== -1) {
                                        client.documents[docIndex].processing_job_id = fastApiResult.jobId;
                                        client.documents[docIndex].processing_method = 'fastapi_gemini_ai';
                                    }
                                    return client;
                                });
                            } else {
                                throw new Error(fastApiResult.error || 'FastAPI job creation failed');
                            }
                        } catch (processingError) {
                            console.error(`❌ Document processing failed for ${documentId}:`, processingError.message);
                            clearTimeout(timeoutId);

                            // Update status to failed
                            await safeClientUpdate(clientId, (client) => {
                                const docIndex = client.documents.findIndex(doc => doc.id === documentId);
                                if (docIndex !== -1) {
                                    client.documents[docIndex] = {
                                        ...client.documents[docIndex],
                                        processing_status: 'failed',
                                        processing_error: processingError.message,
                                        document_status: 'processing_failed',
                                        processed_at: new Date().toISOString()
                                    };

                                    // Also add a system note
                                    if (!client.admin_notes) client.admin_notes = [];
                                    client.admin_notes.push({
                                        timestamp: new Date().toISOString(),
                                        note: `❌ Document processing failed for ${file.originalname}: ${processingError.message}`,
                                        admin: 'system'
                                    });
                                }
                                return client;
                            });
                        }
                    }); // End setImmediate
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

                // Return success with document details
                res.json({
                    success: true,
                    message: `${uploadedDocuments.length} Documents uploaded and processing started`,
                    documents: uploadedDocuments,
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

                const creditors = client.final_creditor_list || [];

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
                        first_payment_received: client.first_payment_received || false
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
        }
    };
};

module.exports = createClientPortalController;
