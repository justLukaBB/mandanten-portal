const { generateAdminToken } = require('../middleware/auth');
const AdminUser = require('../models/AdminUser');

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
