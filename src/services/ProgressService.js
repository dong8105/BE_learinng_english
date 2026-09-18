const progressRepository = require('../repositories/ProgressRepository');
const userRepository = require('../repositories/UserRepository');
const { getPool } = require('../db/connection');

class ProgressService {
    async getUserProgress(userId, type) {
        const row = await progressRepository.getProgress(userId, type);
        if (!row) {
            return { progressType: type, data: null };
        }

        let parsed = {};
        try {
            parsed = JSON.parse(row.data);
        } catch {
            parsed = row.data;
        }

        return {
            progressType: type,
            data: parsed,
            updatedAt: row.updated_at
        };
    }

    async saveUserProgress(userId, type, data) {
        if (data === undefined) {
            throw { status: 400, message: 'Dữ liệu tiến trình không được để trống' };
        }
        const stringified = typeof data === 'string' ? data : JSON.stringify(data);
        await progressRepository.saveProgress(userId, type, stringified);
        return { success: true, progressType: type };
    }

    async getMetrics() {
        const data = await progressRepository.getMetrics();
        const users = await this.getUsersWithStreaks();

        let activeStreakCount = 0;
        let activeTodayCount = 0;
        let maxStreak = 0;
        let totalStreakSum = 0;
        const streakDistribution = {
            zero: 0,
            oneToThree: 0,
            fourToSeven: 0,
            eightToThirty: 0,
            moreThanThirty: 0
        };

        for (const u of users) {
            const count = u.streak?.count || 0;
            if (u.streak?.isOnlineToday) activeTodayCount++;
            if (u.streak?.isStreakActive && count > 0) activeStreakCount++;
            if (count > maxStreak) maxStreak = count;
            totalStreakSum += count;

            if (count === 0) streakDistribution.zero++;
            else if (count <= 3) streakDistribution.oneToThree++;
            else if (count <= 7) streakDistribution.fourToSeven++;
            else if (count <= 30) streakDistribution.eightToThirty++;
            else streakDistribution.moreThanThirty++;
        }

        // Top 5 học viên có streak cao nhất
        const topStreaks = [...users]
            .filter(u => (u.streak?.count || 0) > 0)
            .sort((a, b) => (b.streak?.count || 0) - (a.streak?.count || 0))
            .slice(0, 5)
            .map(u => ({
                id: u.id,
                username: u.username,
                name: u.name,
                role: u.role,
                count: u.streak.count,
                isOnlineToday: u.streak.isOnlineToday
            }));

        const presenceService = require('./PresenceService');
        const onlineStats = presenceService.getOnlineStats();

        const mem = process.memoryUsage();
        return {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            db: 'connected',
            ...data,
            userAnalytics: {
                totalUsers: data.totalUsers,
                totalAdmins: data.totalAdmins,
                totalLearners: data.totalLearners,
                activeTodayCount,
                activeStreakCount,
                maxStreak,
                avgStreak: users.length > 0 ? (totalStreakSum / users.length).toFixed(1) : '0',
                newUsers7d: data.newUsers7d,
                newUsers30d: data.newUsers30d,
                streakDistribution,
                topStreaks
            },
            onlineStats,
            memory: {
                rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB'
            }
        };
    }

    async getUsersWithStreaks() {
        const pool = getPool();
        const [rows] = await pool.query(`
            SELECT 
                u.id, 
                u.username, 
                u.name, 
                u.role, 
                u.created_at,
                p.data as streak_data,
                p.updated_at as streak_updated_at,
                pv.updated_at as last_activity_at
            FROM users u
            LEFT JOIN user_progress p ON p.user_id = u.id AND p.progress_type = 'streak'
            LEFT JOIN (
                SELECT user_id, MAX(updated_at) as updated_at 
                FROM user_progress 
                GROUP BY user_id
            ) pv ON pv.user_id = u.id
            ORDER BY u.created_at DESC
        `);

        const todayStr = new Date().toDateString();
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toDateString();

        return rows.map(r => {
            let streakCount = 0;
            let lastActiveDate = null;
            let lastActiveTimestamp = null;
            let isOnlineToday = false;
            let isStreakActive = false;

            if (r.streak_data) {
                try {
                    const parsed = JSON.parse(r.streak_data);
                    streakCount = typeof parsed.streakCount === 'number' 
                        ? parsed.streakCount 
                        : parseInt(parsed.streakCount || '0', 10) || 0;
                    lastActiveDate = parsed.lastActiveDate || null;
                    lastActiveTimestamp = parsed.lastActiveTimestamp || null;
                    isOnlineToday = lastActiveDate === todayStr;
                    isStreakActive = lastActiveDate === todayStr || lastActiveDate === yesterdayStr;
                } catch (e) {
                    console.error('Error parsing streak data for user:', r.id, e);
                }
            }

            return {
                id: r.id,
                username: r.username,
                name: r.name,
                role: r.role,
                createdAt: r.created_at,
                lastActivityAt: r.last_activity_at || r.streak_updated_at || r.created_at,
                streak: {
                    count: streakCount,
                    lastActiveDate,
                    lastActiveTimestamp,
                    isOnlineToday,
                    isStreakActive,
                    updatedAt: r.streak_updated_at
                }
            };
        });
    }

    async updateUserStreak(userId, streakCount, lastActiveDate) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw { status: 404, message: 'Người dùng không tồn tại' };
        }

        const count = Math.max(0, parseInt(streakCount || 0, 10));
        const effectiveDate = lastActiveDate || new Date().toDateString();

        const streakPayload = {
            streakCount: count,
            lastActiveDate: effectiveDate,
            lastActiveTimestamp: Date.now()
        };

        await progressRepository.saveProgress(userId, 'streak', JSON.stringify(streakPayload));
        return streakPayload;
    }
}

module.exports = new ProgressService();
