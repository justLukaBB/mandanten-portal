const { generateAdminToken } = require('../middleware/auth');
const AdminUser = require('../models/AdminUser');

/**
 * Controller for Admin Authentication
 */
class AdminAuthController {
    /**
     * Get current admin user info (token validation + fresh data)
     * GET /api/admin/me
     */
    me = async (req, res) => {
        try {
            const admin = await AdminUser.findOne({
                id: req.adminId,
                is_active: true
            });

            if (!admin) {
                return res.status(401).json({ error: 'Admin-Benutzer nicht gefunden oder deaktiviert' });
            }

            const response = {
                success: true,
                user: {
                    id: admin.id,
                    email: admin.email,
                    first_name: admin.first_name,
                    last_name: admin.last_name,
                    role: admin.role,
                    kanzleiId: admin.kanzleiId
                }
            };

            // If role or kanzleiId changed since token was issued, send a fresh token
            if (admin.role !== req.adminRole || admin.kanzleiId !== req.kanzleiId) {
                response.token = generateAdminToken(admin.id, admin.kanzleiId, admin.role);
            }

            res.json(response);
        } catch (error) {
            console.error('Error fetching admin profile:', error);
            res.status(500).json({ error: 'Fehler beim Laden des Profils' });
        }
    }

    /**
     * Handle Admin Login
     * POST /api/admin/login
     */
    login = async (req, res) => {
        try {
            const { email, password } = req.body;

            const admin = await AdminUser.findOne({
                email: email.toLowerCase(),
                is_active: true
            });

            if (!admin) {
                return res.status(401).json({
                    error: 'Ungültige Admin-Anmeldedaten'
                });
            }

            const isValid = await admin.comparePassword(password);
            if (!isValid) {
                return res.status(401).json({
                    error: 'Ungültige Admin-Anmeldedaten'
                });
            }

            // Update last login
            admin.last_login = new Date();
            await admin.save();

            // Generate admin JWT token with kanzleiId
            const token = generateAdminToken(admin.id, admin.kanzleiId, admin.role);

            res.json({
                success: true,
                message: 'Admin-Anmeldung erfolgreich',
                token,
                user: {
                    id: admin.id,
                    email: admin.email,
                    first_name: admin.first_name,
                    last_name: admin.last_name,
                    role: admin.role,
                    kanzleiId: admin.kanzleiId
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
