const { generateAdminToken } = require('../middleware/auth');

/**
 * Controller for Admin Authentication
 */
class AdminAuthController {
    /**
     * Handle Admin Login
     * POST /api/admin/login
     */
    login = async (req, res) => {
        try {
            const { email, password } = req.body;

            // TODO: Replace with proper admin user management
            // For now, use environment variables for admin credentials
            const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mandanten-portal.de';
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // CHANGE THIS!

            if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
                return res.status(401).json({
                    error: 'Ungültige Admin-Anmeldedaten'
                });
            }

            // Generate admin JWT token
            const token = generateAdminToken(email);

            res.json({
                success: true,
                message: 'Admin-Anmeldung erfolgreich',
                token,
                user: {
                    email,
                    role: 'admin'
                }
            });

        } catch (error) {
            console.error('Error during admin login:', error);
            res.status(500).json({
                error: 'Anmeldefehler',
                details: error.message
            });
        }
    }
}

module.exports = new AdminAuthController();
