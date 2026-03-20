const express = require('express');
const router = express.Router();
const db = require('../db');
const { execSync } = require('child_process');

// GET /api/executive/summary — aggregated read-only dashboard data
// Strictly no mutations — no POST/PUT/DELETE on this router.
router.get('/summary', (req, res) => {
  try {
    // Active agents — last_active within 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeAgents = db.prepare(`
      SELECT COUNT(*) as count FROM agents
      WHERE status = 'active'
        AND last_active IS NOT NULL
        AND last_active > ?
    `).get(fiveMinAgo);

    const totalAgents = db.prepare(`
      SELECT COUNT(*) as count FROM agents WHERE status = 'active'
    `).get();

    // Task counts
    const taskCounts = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'pending'     THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'done'        THEN 1 END) as done,
        COUNT(*) as total
      FROM tasks
    `).get();

    // Eng task counts
    const engTaskCounts = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'backlog'     THEN 1 END) as backlog,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'review'      THEN 1 END) as review,
        COUNT(CASE WHEN status = 'done'        THEN 1 END) as done,
        COUNT(*) as total
      FROM eng_tasks
    `).get();

    // Recent agent activity — last 10 activities
    const recentActivity = db.prepare(`
      SELECT name, designation, current_activity, last_active, avatar_url
      FROM agents
      WHERE current_activity IS NOT NULL
        AND last_active IS NOT NULL
      ORDER BY last_active DESC
      LIMIT 10
    `).all();

    // Last deploy timestamp — read from /data/last_deploy.txt if it exists
    let lastDeploy = null;
    try {
      const fs = require('fs');
      const deployFile = '/data/last_deploy.txt';
      if (fs.existsSync(deployFile)) {
        lastDeploy = fs.readFileSync(deployFile, 'utf8').trim();
      }
    } catch (_) {
      lastDeploy = null;
    }

    // Fallback: try git log for last commit timestamp
    if (!lastDeploy) {
      try {
        lastDeploy = execSync('git -C /app log -1 --format=%cI 2>/dev/null', { timeout: 2000 })
          .toString().trim() || null;
      } catch (_) {
        lastDeploy = null;
      }
    }

    res.json({
      agents: {
        active_now: activeAgents.count,
        total_active: totalAgents.count
      },
      tasks: {
        pending: taskCounts.pending,
        in_progress: taskCounts.in_progress,
        done: taskCounts.done,
        total: taskCounts.total
      },
      eng_tasks: {
        backlog: engTaskCounts.backlog,
        in_progress: engTaskCounts.in_progress,
        review: engTaskCounts.review,
        done: engTaskCounts.done,
        total: engTaskCounts.total
      },
      recent_activity: recentActivity,
      last_deploy: lastDeploy,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
