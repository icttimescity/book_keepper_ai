const express = require('express');
const router = express.Router();
const repository = require('../services/bookRepository');

router.get('/', async (req, res) => {
  try {
    const result = await repository.listBooks(req.query);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[GET /api/books]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const result = await repository.getCategories();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[GET /api/books/categories]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/random', async (_req, res) => {
  try {
    const result = await repository.getRandomBook();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[GET /api/books/random]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health', async (_req, res) => {
  res.json({
    success: true,
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY),
    offlineFallback: true
  });
});

module.exports = router;
