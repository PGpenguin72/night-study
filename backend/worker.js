// Cloudflare Worker 後端入口
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 處理 CORS (讓你的網頁可以跨網域呼叫這個 API)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // 2. API: 前端獲取當前座位狀態 (GET /api/seats)
    if (url.pathname === '/api/seats' && request.method === 'GET') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      
      // 從 D1 資料庫 JOIN 學生與今日狀態
      const { results } = await env.DB.prepare(`
        SELECT s.seat_number as seat, s.name, COALESCE(d.status, 'expected') as status
        FROM students s 
        LEFT JOIN daily_status d ON s.id = d.student_id AND d.date = ?
      `).bind(today).all();
      
      return Response.json(results, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // 3. API: 讀卡機刷卡端點 (POST /api/check-in)
    if (url.pathname === '/api/check-in' && request.method === 'POST') {
      const { rfid_tag, time_scanned } = await request.json();
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

      // 尋找學生
      const student = await env.DB.prepare('SELECT id, name FROM students WHERE rfid_tag = ?').bind(rfid_tag).first();
      
      if (!student) {
        return Response.json({ error: '無效的卡片' }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      // 檢查當前狀態 (實作狀態切換機)
      const currentRecord = await env.DB.prepare('SELECT status FROM daily_status WHERE date = ? AND student_id = ?')
                                        .bind(today, student.id).first();
      
      let newStatus = 'present';
      let actionType = 'ENTRY';

      if (!currentRecord) {
        // 首次簽到 (判斷是否遲到, 假設 18:10 為基準)
        const isLate = time_scanned >= '18:10:00';
        newStatus = isLate ? 'late' : 'present';
        
        await env.DB.prepare('INSERT INTO daily_status (date, student_id, status, arrival_time) VALUES (?, ?, ?, ?)')
                    .bind(today, student.id, newStatus, time_scanned).run();
      } else {
        // 切換狀態: 在席 <-> 暫離
        newStatus = currentRecord.status === 'present' ? 'temp_leave' : 'present';
        actionType = newStatus === 'temp_leave' ? 'LEAVE_TEMP' : 'RETURN_TEMP';
        
        await env.DB.prepare('UPDATE daily_status SET status = ? WHERE date = ? AND student_id = ?')
                    .bind(newStatus, today, student.id).run();
      }

      // 寫入歷史 Log
      await env.DB.prepare('INSERT INTO attendance_logs (student_id, action_type) VALUES (?, ?)')
                  .bind(student.id, actionType).run();

      return Response.json({ success: true, name: student.name, status: newStatus }, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    return new Response("Not found", { status: 404 });
  },

  // 4. 定時排程 (Cron Trigger): 每天晚上將 D1 資料寫回 Google Sheets (YYYYMMDD)
  async scheduled(event, env, ctx) {
    // 這裡實作呼叫 Google Sheets API 的批次寫入邏輯
    // 這樣老師還是可以打開試算表看到最完整的統計結果！
    console.log("執行每日同步至 Google Sheets...");
  }
};