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

            // TODO: Replace with proper admin user management (DB-backed)
            const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

            if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
                console.error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set');
                return res.status(500).json({ error: 'Server-Konfigurationsfehler' });
            }

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
