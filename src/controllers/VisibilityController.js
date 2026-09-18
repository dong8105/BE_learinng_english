const visibilityService = require('../services/VisibilityService');
const { verifySignedToken } = require('../../security');

class VisibilityController {
    async getSettings(req, res, next) {
        try {
            const authHeader = req.headers['authorization'];
            let currentUser = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                currentUser = verifySignedToken(token);
            }

            const settings = await visibilityService.getEffectiveSettings(currentUser);
            res.json(settings);
        } catch (err) {
            console.error('Error fetching visibility settings:', err);
            res.status(500).json({ error: 'Failed to fetch visibility settings' });
        }
    }

    async updateSettings(req, res, next) {
        try {
            const result = await visibilityService.updateGlobalSettings(req.body);
            res.json({ success: true, settings: result });
        } catch (err) {
            console.error('Error saving visibility settings:', err);
            res.status(500).json({ error: 'Failed to save visibility settings' });
        }
    }

    async getCustomUsers(req, res, next) {
        try {
            const customUserIds = await visibilityService.getCustomUserIds();
            res.json({ success: true, customUserIds });
        } catch (err) {
            console.error('Error fetching custom users list:', err);
            res.status(500).json({ error: 'Failed to fetch custom users list' });
        }
    }

    async getUserVisibility(req, res, next) {
        try {
            const { id } = req.params;
            const result = await visibilityService.getUserVisibility(id);
            res.json(result);
        } catch (err) {
            console.error('Error fetching user visibility settings:', err);
            res.status(500).json({ error: 'Failed to fetch user visibility settings' });
        }
    }

    async saveUserVisibility(req, res, next) {
        try {
            const { id } = req.params;
            const result = await visibilityService.saveUserVisibility(id, req.body);
            res.json(result);
        } catch (err) {
            console.error('Error saving user visibility settings:', err);
            res.status(500).json({ error: 'Failed to save user visibility settings' });
        }
    }

    async deleteUserVisibility(req, res, next) {
        try {
            const { id } = req.params;
            const result = await visibilityService.deleteUserVisibility(id);
            res.json(result);
        } catch (err) {
            console.error('Error deleting user visibility settings:', err);
            res.status(500).json({ error: 'Failed to delete user visibility settings' });
        }
    }
}

module.exports = new VisibilityController();
