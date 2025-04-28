// Import scheduler
import scheduler from './utils/scheduler.js';

// Initialize scheduler in production environment
if (process.env.NODE_ENV === 'production') {
  scheduler.init();
  console.log('✅ Automated tasks scheduler initialized');
} 