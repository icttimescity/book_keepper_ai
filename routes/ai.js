const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!process.env.AGNES_API_KEY) {
      return res.status(500).json({ error: 'Chưa cấu hình AGNES_API_KEY' });
    }

    const response = await fetch(process.env.AGNES_API_URL || 'https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AGNES_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.AGNES_MODEL || 'agnes-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 800
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || data?.error || JSON.stringify(data);
      return res.status(response.status).json({ error: message });
    }


    res.json({
      text: data.choices?.[0]?.message?.content || 'Không có nội dung trả về.'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
