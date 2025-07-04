// src/web/routes/schedule.js
router.get('/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/schedule.html'));
});

// 스케줄 API
router.post('/api/schedule/save', async (req, res) => {
    const { date, userId, times } = req.body;
    // DB에 저장하는 로직
});

router.get('/api/schedule/:month', async (req, res) => {
    const { month } = req.params;
    // 해당 월의 스케줄 데이터 반환
});