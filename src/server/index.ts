import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { appConfig, setGlobalNodesCache } from './context.js';
import { requireAuth } from './middlewares/auth.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { subRouter } from './routes/sub.js';
import {
  ensureCustomSource,
  ensureCustomProxyGroup,
  ensureAllSourceProxyGroups,
  collectNodesFromSources,
} from './services/profile-service.js';
import { saveConfig } from '../storage/db.js';

// Run initial source and group alignment
ensureCustomSource(appConfig);
ensureCustomProxyGroup(appConfig);
ensureAllSourceProxyGroups(appConfig);
saveConfig(appConfig);

// Initialize in-memory cache directly from persisted source nodes
setGlobalNodesCache(collectNodesFromSources(appConfig));

const app = express();
const PORT = process.env.PORT || appConfig.settings?.port || 3456;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Auth routes (handles /api/auth/status, /api/auth/login, etc.)
app.use('/api', authRouter);

// Protect all other /api routes
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/status') || req.path.startsWith('/auth/login')) {
    return next();
  }
  return requireAuth(req, res, next);
});

// Admin REST API
app.use(apiRouter);

// Subscription serving routes (/s/:subToken...)
app.use(subRouter);

// Legacy /sub routes return silent 404
app.all('/sub', (req, res) => {
  res.removeHeader('X-Powered-By');
  res.status(404).type('text/plain').send('404 Not Found');
});
app.all('/sub/*', (req, res) => {
  res.removeHeader('X-Powered-By');
  res.status(404).type('text/plain').send('404 Not Found');
});

// Static files (Web UI)
const webDistPath = path.resolve(process.cwd(), 'web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/s/')) {
      res.sendFile(path.join(webDistPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log('-------------------------------------------------------');
  console.log(`SubOne listening on http://localhost:${PORT}`);
  console.log(`Authentication: ${appConfig.settings?.adminPassword ? 'Enabled' : 'Disabled (No password set)'}`);
  if (appConfig.profiles && appConfig.profiles.length > 0) {
    console.log(`Default subscription: http://localhost:${PORT}/s/${appConfig.profiles[0].token}`);
  }
  console.log('-------------------------------------------------------');
});

export default app;
