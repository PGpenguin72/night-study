import React, { useState, useEffect, useRef } from 'react';

// ==========================================
// 系統與環境變數設定
// ==========================================
const API_BASE_URL = 'https://night-study-api.tu28291797.workers.dev'; // 替換成你的 Cloudflare Worker 網址
const POLLING_INTERVAL = 5000; // 每 5 秒更新一次畫面

// 白卡卡號 (避免預覽環境報錯，改為字串常數。正式上線時可替換回環境變數)
const ADMIN_CARD_ID = '1616594319'; 

// 嚴格遵守專屬設定顏色
const COLORS = {
  bg: '#F9EBD7',         // 背景填充
  unreserved: '#D0C5A8', // 灰色填充：無人預約
  present: '#F1B928',    // 黃色填充：已抵達/暫離
  expected: '#F1B928',   // 黃色外框：尚未抵達 (夜自習前)
  absent: '#E9671B',     // 橘紅填充：尚未到達 (曠課/遲到)
};

// 為了讓預覽畫面有東西看，加回測試用的假資料
const INITIAL_STUDENTS = [
  { id: '1', seat: 2, name: '王小明', status: 'expected' },
  { id: '2', seat: 5, name: '陳大文', status: 'present' },
  { id: '3', seat: 14, name: '林心如', status: 'absent' },
  { id: '4', seat: 22, name: '張志豪', status: 'expected' },
  { id: '5', seat: 35, name: '李佳穎', status: 'present' },
  { id: '6', seat: 40, name: '黃建國', status: 'temp_leave' },
];

export default function AttendanceBoard() {
  // 系統核心狀態 (預設載入假資料)
  const [time, setTime] = useState(new Date());
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [systemStatus, setSystemStatus] = useState('系統初始化中... (目前為展示模式)');
  const [isOnline, setIsOnline] = useState(false);
  const [lastScannedCard, setLastScannedCard] = useState(null);

  // 管理員(白卡)模式狀態
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminTimer, setAdminTimer] = useState(0);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const adminTimerRef = useRef(null);

  // 1. 真實時鐘自動更新
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. 與 Cloudflare Worker 進行資料同步 (Polling)
  const fetchSeats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/seats`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
      // 如果資料庫有資料，才覆蓋掉我們的測試假資料
      if (data && data.length > 0) {
        setStudents(data);
      }
      setIsOnline(true);
      setSystemStatus('連線正常 / 讀卡機待命中');
    } catch (err) {
      setIsOnline(false);
      // 故意不覆蓋畫面，讓預覽還能顯示假資料
      setSystemStatus('後端未連線，目前顯示測試資料');
    }
  };

  useEffect(() => {
    fetchSeats(); // 初始載入
    const syncTimer = setInterval(fetchSeats, POLLING_INTERVAL); // 定時輪詢
    return () => clearInterval(syncTimer);
  }, []);

  // 3. ✨ 核心：處理實體讀卡機刷卡 (鍵盤模擬器) ✨
  useEffect(() => {
    let inputBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const currentTime = Date.now();
      
      // 【防呆機制】大於 100ms 視為人類打字
      if (currentTime - lastKeyTime > 100) {
        inputBuffer = '';
      }
      lastKeyTime = currentTime;

      // 讀卡機輸入完畢的 Enter
      if (e.key === 'Enter' && inputBuffer.length > 0) {
        const scannedId = inputBuffer;
        inputBuffer = ''; // 清空
        
        // 白卡判斷
        if (scannedId === ADMIN_CARD_ID) {
          setIsAdminMode(true);
          setAdminTimer(60);
          setSystemStatus('教師已刷白卡，進入管理模式');
          return;
        }

        // 正常學生刷卡
        try {
          setSystemStatus(`處理刷卡中... (${scannedId})`);
          
          // 樂觀 UI 測試顯示
          setLastScannedCard(scannedId);
          setTimeout(() => setLastScannedCard(null), 3000);
          setSystemStatus(`卡號 ${scannedId} 已受理，等待後端回應...`);
          
        } catch (error) {
          setSystemStatus(`❌ 刷卡傳送失敗`);
        }

      } else if (e.key.length === 1) {
        inputBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 4. 管理員模式倒數計時邏輯
  useEffect(() => {
    if (isAdminMode) {
      adminTimerRef.current = setInterval(() => {
        setAdminTimer(prev => {
          if (prev <= 1) {
            setIsAdminMode(false);
            setSelectedSeat(null);
            setSystemStatus('管理模式逾時，已自動退出');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(adminTimerRef.current);
    }
    return () => clearInterval(adminTimerRef.current);
  }, [isAdminMode]);

  const resetAdminTimer = () => { if (isAdminMode) setAdminTimer(60); };

  // 5. 處理教師手動修正
  const handleAdminFix = async (studentId, fixType) => {
    resetAdminTimer();
    try {
      // 樂觀更新畫面
      setStudents(prev => prev.map(s => {
        if (s.id !== studentId) return s;
        let newStatus = s.status;
        if (fixType === 'force_present') newStatus = 'present';
        if (fixType === 'force_absent') newStatus = 'absent';
        if (fixType === 'leave') newStatus = 'leave_approved';
        return { ...s, status: newStatus };
      }));
      setSystemStatus(`已手動修正學生狀態`);
    } catch (err) {
      alert("狀態修改失敗");
    } finally {
      setSelectedSeat(null);
    }
  };

  // 統計數據
  const stats = {
    expected: 42, 
    present: students.filter(s => s.status === 'present' || s.status === 'temp_leave').length,
    absent: students.filter(s => s.status === 'absent' || s.status === 'expected').length,
  };

  const formattedDate = `${time.getFullYear()} / ${String(time.getMonth() + 1).padStart(2, '0')} / ${String(time.getDate()).padStart(2, '0')}`;
  const formattedTime = `${String(time.getHours()).padStart(2, '0')} : ${String(time.getMinutes()).padStart(2, '0')} : ${String(time.getSeconds()).padStart(2, '0')}`;

  // 渲染座位
  const renderSeats = () => {
    const seats = [];
    for (let i = 1; i <= 42; i++) {
      const student = students.find(s => s.seat === i);
      
      let seatStyle = {};
      let seatClass = `relative flex flex-col items-center justify-center p-2 h-16 rounded-xl shadow-sm transition-all duration-300 overflow-hidden ${isAdminMode ? 'cursor-pointer hover:ring-4 hover:ring-blue-400' : ''}`;
      let content = <span className="text-gray-500 text-xs font-bold">{i}</span>;

      if (student) {
        if (student.status === 'present') {
          seatStyle = { backgroundColor: COLORS.present, color: '#4a3500' };
          seatClass += " border-4 border-transparent font-bold shadow-md";
        } else if (student.status === 'expected') {
          seatStyle = { backgroundColor: 'transparent', borderColor: COLORS.expected, color: '#6b5000' };
          seatClass += " border-4 border-solid font-bold animate-pulse";
        } else if (student.status === 'temp_leave') {
          seatStyle = { backgroundColor: COLORS.present, borderColor: '#ffffff', color: '#4a3500' };
          seatClass += " border-4 border-dashed font-bold opacity-80";
        } else if (student.status === 'absent') {
          seatStyle = { backgroundColor: COLORS.absent, color: '#ffffff' };
          seatClass += " border-4 border-transparent font-bold shadow-md";
        } else if (student.status === 'leave_approved') {
          seatStyle = { backgroundColor: '#A0AEC0', color: '#ffffff' };
          seatClass += " border-4 border-transparent font-bold shadow-md opacity-80";
        }
        
        content = (
          <>
            <span className="absolute top-1 left-2 text-[10px] opacity-60 font-black">{i}</span>
            <span className="text-sm tracking-widest">{student.name}</span>
          </>
        );
      } else {
        seatStyle = { backgroundColor: COLORS.unreserved, color: '#7a7059' };
        seatClass += " opacity-50 border-2 border-transparent";
      }

      seats.push(
        <div 
          key={i} className={seatClass} style={seatStyle}
          onClick={() => {
            if (isAdminMode && student) {
              setSelectedSeat(student);
              resetAdminTimer();
            }
          }}
        >
          {content}
        </div>
      );
    }
    return seats;
  };

  return (
    <div className="min-h-screen font-sans p-6 flex flex-col selection:bg-orange-200 overflow-hidden" style={{ backgroundColor: COLORS.bg }}>
      
      {/* 頂部 Header */}
      <header className="flex justify-between items-end mb-6 border-b-2 border-[#D0C5A8] pb-4">
        <div className="text-4xl font-black text-gray-800 tracking-wider flex items-baseline gap-4">
          101 教室
          <span className="text-lg font-bold text-gray-500 tracking-normal bg-white px-3 py-1 rounded-full shadow-sm">
            夜自習點名系統
          </span>
          {isAdminMode && (
            <span className="text-base font-bold text-white bg-red-500 px-4 py-1 rounded-full animate-pulse ml-4 shadow-md">
              管理模式啟用中 ({adminTimer}s)
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-lg font-bold text-gray-600 tracking-widest">{formattedDate}</div>
          <div className="bg-white px-5 py-2 rounded-xl shadow-sm text-3xl font-black text-gray-800 tracking-widest border border-gray-100">
            {formattedTime}
          </div>
        </div>
      </header>

      {/* 主體區塊 */}
      <main className="flex flex-1 gap-6 relative">
        
        {/* 左側：座位圖 */}
        <section className="flex-[2.5] bg-white rounded-2xl shadow-lg p-6 relative border border-gray-100 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-700">座位狀態圖</h2>
            <div className="text-sm text-gray-400 font-medium">前台 (講台方向)</div>
          </div>
          <div className="grid grid-cols-6 gap-3 flex-1 content-start">
            {renderSeats()}
          </div>
        </section>

        {/* 右側：數據統計與圖例 */}
        <section className="flex-1 flex flex-col gap-6">
          <div className="flex justify-between gap-3">
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center py-5">
              <span className="text-sm text-gray-500 font-bold mb-1">應到</span>
              <span className="text-4xl font-black text-gray-700">{stats.expected}</span>
            </div>
            <div className="flex-1 bg-white rounded-2xl shadow-md border-b-4 flex flex-col items-center py-5 transform scale-105 z-10" style={{ borderBottomColor: COLORS.present }}>
              <span className="text-sm text-gray-600 font-bold mb-1">實到</span>
              <span className="text-4xl font-black text-gray-900">{stats.present}</span>
            </div>
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center py-5">
              <span className="text-sm text-gray-500 font-bold mb-1">缺席</span>
              <span className="text-4xl font-black" style={{ color: COLORS.absent }}>{stats.absent}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 flex-1">
            <h3 className="font-bold text-gray-700 mb-2 border-b border-gray-100 pb-2">狀態圖例</h3>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded border-4" style={{ borderColor: COLORS.expected }}></div>
              <span className="text-sm font-bold text-gray-600">預期抵達 (尚未到)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: COLORS.present }}></div>
              <span className="text-sm font-bold text-gray-600">已抵達 (在席)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded border-2 border-dashed border-white shadow-inner" style={{ backgroundColor: COLORS.present }}></div>
              <span className="text-sm font-bold text-gray-600">暫離 (如廁)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded" style={{ backgroundColor: COLORS.absent }}></div>
              <span className="text-sm font-bold text-gray-600">遲到 / 曠課 / 未到</span>
            </div>
          </div>

          {/* 系統提示區塊 (用來顯示最後一次刷卡的卡號，方便除錯) */}
          <div className={`rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[100px] transition-all ${lastScannedCard ? 'bg-blue-50 border-blue-300' : 'bg-transparent border-[#D0C5A8]'}`}>
            {lastScannedCard ? (
              <>
                 <span className="text-xs font-bold text-blue-500 mb-1">收到讀卡機訊號：</span>
                 <span className="text-2xl font-mono font-bold text-blue-800 tracking-widest">{lastScannedCard}</span>
              </>
            ) : (
              <span className="text-gray-500 font-bold text-lg tracking-widest opacity-50">請感應卡片簽到</span>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2 shadow-inner">
             <div className="flex items-center justify-between">
                <span className="font-bold text-gray-400 text-sm">網路連線</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className={`${isOnline ? 'text-green-400' : 'text-red-500'} font-mono text-xs tracking-wider`}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
             </div>
             <div className="text-gray-300 font-mono text-xs border-t border-gray-700 pt-2 mt-1">
                {'>'} {systemStatus}
             </div>
          </div>

        </section>

        {/* 管理員手動修正 Modal */}
        {isAdminMode && selectedSeat && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 rounded-2xl backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-96 max-w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">非明顯錯誤回報</h3>
                <button onClick={() => setSelectedSeat(null)} className="text-gray-400 hover:text-gray-800 font-bold text-xl">&times;</button>
              </div>
              <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">正在處理學生：</p>
                <p className="text-xl font-black text-indigo-700">{selectedSeat.name}</p>
                <p className="text-sm mt-2 text-gray-600">系統目前狀態：<span className="font-bold bg-gray-200 px-2 py-0.5 rounded">{selectedSeat.status}</span></p>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={() => handleAdminFix(selectedSeat.id, 'force_present')} className="w-full text-left p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 hover:bg-green-100 transition shadow-sm">
                  <div className="font-bold text-lg mb-1">強制簽到 (人在現場)</div>
                  <div className="text-xs opacity-80">解決：忘記刷卡、刷卡機沒感應到</div>
                </button>
                <button onClick={() => handleAdminFix(selectedSeat.id, 'force_absent')} className="w-full text-left p-4 bg-orange-50 text-orange-700 rounded-xl border border-orange-200 hover:bg-orange-100 transition shadow-sm">
                  <div className="font-bold text-lg mb-1">取消簽到 (人不在現場)</div>
                  <div className="text-xs opacity-80">解決：代刷卡、刷完人就跑了</div>
                </button>
                <button onClick={() => handleAdminFix(selectedSeat.id, 'leave')} className="w-full text-left p-4 bg-gray-50 text-gray-700 rounded-xl border border-gray-200 hover:bg-gray-100 transition shadow-sm">
                  <div className="font-bold text-lg mb-1">登錄請假</div>
                  <div className="text-xs opacity-80">解決：家長已致電請假</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}