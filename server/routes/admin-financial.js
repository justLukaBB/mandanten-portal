const express = require('express');
const router = express.Router();
const createAdminFinancialController = require('../controllers/adminFinancialController');
const { authenticateAdmin } = require('../middleware/auth');
const { rateLimits } = require('../middleware/security'); // If rate limits are needed

// Factory function to inject dependencies
module.exports = (dependencies) => {
    const adminFinancialController = createAdminFinancialController(dependencies);

    // --- Financial & Debt Calculation Routes ---

    // Calculate Garnishable Income (Protected)
    router.post('/clients/:clientId/calculate-garnishable-income', authenticateAdmin, adminFinancialController.calculateGarnishableIncome);

    // Get Total Debt
    router.get('/clients/:clientId/total-debt', authenticateAdmin, adminFinancialController.getTotalDebt);

    // Calculate Creditor Quotas
    router.post('/clients/:clientId/calculate-creditor-quotas', authenticateAdmin, adminFinancialController.calculateCreditorQuotas);

    // Restructuring Analysis
    router.post('/clients/:clientId/restructuring-analysis', authenticateAdmin, adminFinancialController.generateRestructuringAnalysis);

    // Financial Overview
    router.get('/clients/:clientId/financial-overview', authenticateAdmin, adminFinancialController.getFinancialOverview);

    // Admin Update Creditor Response
    router.post('/admin/clients/:clientId/creditor-response', authenticateAdmin, adminFinancialController.updateCreditorResponse);

    // Save Financial Data
    router.post('/clients/:clientId/financial-data', authenticateAdmin, adminFinancialController.saveFinancialData);

    // Generate Settlement Plan
    router.post('/clients/:clientId/generate-settlement-plan', authenticateAdmin, adminFinancialController.generateSettlementPlan);

    // Get Settlement Plan
    router.get('/clients/:clientId/settlement-plan', authenticateAdmin, adminFinancialController.getSettlementPlan);

    return router;
};
