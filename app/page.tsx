// @ts-nocheck
/* eslint-disable */
"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar, Trash2, Camera, X, Utensils, Cloud, BrainCircuit, Loader2, Flame, ClipboardList, Activity, Dumbbell, Droplets, ImageUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// === 設定區 ===
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzClBk-cmKDI3cgp1jshvUVo-1mkgq6unU39FeCA6wyqkjTjvMbSVIcRXrUA5MLzYcV/exec";

// ⚠️⚠️⚠️【重要】已填入您的新 API 金鑰 ⚠️⚠️⚠️
const GEMINI_API_KEY = "AIzaSyCOdlPAEPhbAllN4_E3qhyL0RFUhK8u_Xo"; 
const AI_MODEL = "gemini-2.5-flash"; 

// === 運動消耗標準 ===
// allowScan: true 代表該項目可以上傳圖片 (走路、跑步)
const ACTIVITY_STANDARDS = [
  { id: 'walk', name: '走路', unit: '步', kcal: 0.04, defaultTarget: 6000, allowScan: true },
  { id: 'run', name: '跑步', unit: '公里', kcal: 60, defaultTarget: 5, allowScan: true },
  { id: 'pushup', name: '伏地挺身', unit: '次', kcal: 0.4, defaultTarget: 30, allowScan: false },
  { id: 'crunch', name: '捲腹', unit: '次', kcal: 0.3, defaultTarget: 30, allowScan: false },
];

const MEAL_LIMITS: Record<string, number> = { '早餐': 3, '午餐': 3, '晚餐': 3, '其他': 10 };
const CATEGORIES = ['早餐', '午餐', '晚餐', '其他'];

// === 雲端上傳 ===
const uploadToCloud = async (data: any) => {
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log("已發送至雲端:", data.type);
  } catch (err) { console.error("雲端備份失敗:", err); }
};

// === Gemini AI 分析 (V10.0 截圖特化版) ===
const analyzeWithGemini = async (base64Image: string, type: 'food' | 'combo' | 'activity', context?: string) => {
  try {
    const cleanBase64 = base64Image.split(',')[1];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    let promptText = "";
    
    if (type === 'food') {
      promptText = "請辨識圖片中的食物。只回傳純 JSON：{ \"name\": \"食物名稱\", \"calories\": 數字(大卡) }。例如：{ \"name\": \"便當\", \"calories\": 800 }。若無法辨識回傳 calories: 0";
    
    } else if (type === 'combo') {
      // 體重 + 喝水 二合一指令
      promptText = "這是一張健康紀錄的截圖或照片。請同時尋找「體重(kg)」與「水量(ml)」。只回傳純 JSON：{ \"weight\": 數字或0, \"water\": 數字或0 }。例如看到體重計顯示 75.5，水杯約 300ml，回傳 { \"weight\": 75.5, \"water\": 300 }。若只看到其中一樣，另一樣回傳 0。";
    
    } else if (type === 'activity') {
      // 走路或跑步
      const actName = context === 'walk' ? '走路步數' : '跑步距離(公里)';
      promptText = `請辨識圖片中關於「${actName}」的數值。只回傳純 JSON：{ \"value\": 數字 }。例如看到 5200步，回傳 { \"value\": 5200 }。看到 3.5公里，回傳 { \"value\": 3.5 }。`;
    }

    const payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
        ]
      }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) return { error: true, msg: data.error.message };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { error: true, msg: "AI 無回傳" };

    const cleanText = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanText);

  } catch (error) {
    console.error(error);
    return { error: true, msg: "連線失敗" };
  }
};

export default function HealthApp() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 資料狀態
  const [weightData, setWeightData] = useState<{date: string, weight: number}[]>([]); 
  const [dietData, setDietData] = useState<Record<string, Record<string, string[]>>>({});
  const [foodLog, setFoodLog] = useState<Record<string, Record<string, {name: string, cal: number}[]>>>({});
  const [activityData, setActivityData] = useState<Record<string, Record<string, {target: number, actual: number}>>>({});
  const [waterData, setWaterData] = useState<Record<string, number>>({}); 

  const [weightVal, setWeightVal] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 6)));
  
  // UI 狀態
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanType, setScanType] = useState<'food' | 'combo' | 'activity'>('food');
  const [scanContext, setScanContext] = useState<string>('');
  
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{title: string, value: string} | null>(null);

  // 初始化與存檔
  useEffect(() => {
    const savedWeight = localStorage.getItem('Health_Weight_Final');
    const savedDiet = localStorage.getItem('Health_Diet_Final');
    const savedLog = localStorage.getItem('Health_FoodLog_V5');
    const savedActivity = localStorage.getItem('Health_Activity_V1');
    const savedWater = localStorage.getItem('Health_Water_V1');
    
    if (savedWeight) setWeightData(JSON.parse(savedWeight));
    if (savedDiet) setDietData(JSON.parse(savedDiet));
    if (savedLog) setFoodLog(JSON.parse(savedLog));
    if (savedActivity) setActivityData(JSON.parse(savedActivity));
    if (savedWater) setWaterData(JSON.parse(savedWater));
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('Health_Weight_Final', JSON.stringify(weightData));
      localStorage.setItem('Health_Diet_Final', JSON.stringify(dietData));
      localStorage.setItem('Health_FoodLog_V5', JSON.stringify(foodLog));
      localStorage.setItem('Health_Activity_V1', JSON.stringify(activityData));
      localStorage.setItem('Health_Water_V1', JSON.stringify(waterData));
    }
  }, [weightData, dietData, foodLog, activityData, waterData, isInitialized]);

  const todayKey = new Date().toISOString().split('T')[0];

  // 圖表
  const chartData = useMemo(() => {
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const record = weightData.find(r => r.date === key);
      result.push({ name: label, fullDate: key, weight: record ? record.weight : null });
    }
    return result;
  }, [weightData, startDate]);

  const customTicks = useMemo(() => {
    const activeWeights = chartData.map(d => d.weight).filter(w => w !== null) as number[];
    if (activeWeights.length === 0) return [70, 72, 74, 76, 78, 80];
    const min = Math.min(...activeWeights);
    const max = Math.max(...activeWeights);
    const axisMin = Math.floor(min) - 1; 
    const axisMax = Math.ceil(max) + 1;
    const ticks = [];
    for (let i = axisMin; i <= axisMax; i += 0.2) ticks.push(parseFloat(i.toFixed(1)));
    return ticks;
  }, [chartData]);

  // 觸發上傳 (移除 capture 屬性，讓手機優先選檔案/相簿)
  const triggerUpload = (type: 'food' | 'combo' | 'activity', context: string = '') => {
    setScanType(type);
    setScanContext(context);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnalyzing(true);
      setAiResult(null);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxWidth = 800;
          const scale = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * scale;
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);

          // === AI 分析 ===
          const result = await analyzeWithGemini(compressedBase64, scanType, scanContext);
          setAnalyzing(false);

          if (result.error) {
             alert(`辨識失敗: ${result.msg}`);
             return;
          }

          // === 依類型處理結果 ===
          if (scanType === 'food') {
             // 飲食
             const category = scanContext;
             setDietData(prev => {
                const dayRecord = prev[todayKey] || {};
                const list = dayRecord[category] || [];
                return { ...prev, [todayKey]: { ...dayRecord, [category]: [...list, compressedBase64] } };
             });
             if (result.calories >= 0) {
                setFoodLog(prev => {
                    const dayLog = prev[todayKey] || {};
                    const list = dayLog[category] || [];
                    return { ...prev, [todayKey]: { ...dayLog, [category]: [...list, { name: result.name, cal: result.calories }] } };
                });
             }
             setAiResult({ title: result.name, value: `+${result.calories} kcal` });
          
          } else if (scanType === 'combo') {
             // 體重 + 喝水 (二合一)
             let msg = [];
             
             // 處理體重
             const w = parseFloat(result.weight);
             if (w > 0) {
                 setWeightVal(w.toString()); // 自動填入輸入框
                 msg.push(`體重: ${w}kg`);
             }
             
             // 處理喝水
             const vol = parseFloat(result.water);
             if (vol > 0) {
                 setWaterData(prev => ({ ...prev, [todayKey]: (prev[todayKey] || 0) + vol }));
                 msg.push(`喝水: +${vol}ml`);
             }

             if (msg.length > 0) {
                 setAiResult({ title: "二合一辨識成功", value: msg.join(" / ") });
             } else {
                 setAiResult({ title: "辨識結果", value: "未發現數值" });
             }

          } else if (scanType === 'activity') {
             // 走路或跑步
             const val = parseFloat(result.value);
             if (!isNaN(val)) {
                const actId = scanContext;
                handleActivityChange(actId, 'actual', val.toString());
                const unit = actId === 'walk' ? '步' : '公里';
                setAiResult({ title: "運動數據更新", value: `${val} ${unit}` });
             }
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const addWeight = () => {
    const v = parseFloat(weightVal);
    if (!isNaN(v) && v > 0) {
      setWeightData(prev => {
        const clean = prev.filter(r => r.date !== todayKey);
        return [...clean, { date: todayKey, weight: v }];
      });
      uploadToCloud({ date: todayKey, type: '體重', value: v.toString() });
      setWeightVal('');
    }
  };

  const handleActivityChange = (id: string, field: 'target' | 'actual', value: string) => {
    const num = parseFloat(value) || 0;
    setActivityData(prev => {
      const today = prev[todayKey] || {};
      const current = today[id] || { target: ACTIVITY_STANDARDS.find(a=>a.id===id)?.defaultTarget || 0, actual: 0 };
      return { ...prev, [todayKey]: { ...today, [id]: { ...current, [field]: num } } };
    });
  };

  const removePhoto = (category: string, index: number) => {
    if(!confirm('刪除此紀錄？')) return;
    setDietData(prev => {
      const day = prev[todayKey];
      const newImgs = [...day[category]]; newImgs.splice(index, 1);
      return { ...prev, [todayKey]: { ...day, [category]: newImgs } };
    });
    setFoodLog(prev => {
        const day = prev[todayKey];
        if(!day?.[category]) return prev;
        const newLog = [...day[category]]; newLog.splice(index, 1);
        return { ...prev, [todayKey]: { ...day, [category]: newLog } };
    });
  };

  const clearAll = () => {
    if(confirm('清空所有資料？')) {
      setWeightData([]); setDietData({}); setFoodLog({}); setActivityData({}); setWaterData({});
    }
  };

  // 數據計算
  const getTableData = () => {
    const log = foodLog[todayKey] || {};
    const rows = [];
    const totals = { '早餐': 0, '午餐': 0, '晚餐': 0, '其他': 0 };
    for (let i = 0; i < 10; i++) {
        const rowData = {};
        CATEGORIES.forEach(cat => {
            const item = log[cat]?.[i];
            if (item) { rowData[cat] = item.cal; totals[cat] += item.cal; } else { rowData[cat] = ''; }
        });
        rows.push({ index: i + 1, ...rowData });
    }
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    return { rows, totals, grandTotal };
  };

  const getActivityStats = () => {
    const todayActs = activityData[todayKey] || {};
    let totalBurn = 0;
    const stats = ACTIVITY_STANDARDS.map(act => {
        const record = todayActs[act.id] || { target: act.defaultTarget, actual: 0 };
        const burn = Math.round(record.actual * act.kcal);
        totalBurn += burn;
        return { ...act, ...record, burn };
    });
    return { stats, totalBurn };
  };

  const { rows, totals, grandTotal } = getTableData();
  const { stats, totalBurn } = getActivityStats();
  const waterIntake = waterData[todayKey] || 0;

  if (!isInitialized) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 pb-20 font-sans text-slate-900">
      {/* 隱藏的 input，移除 capture 以支援截圖上傳 */}
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* Header */}
      <div className="bg-blue-600 text-white p-4 rounded-b-3xl shadow-lg mb-4 relative">
        <h1 className="text-lg font-bold flex items-center justify-center gap-2">
          2026 健康管理 <Cloud size={16} className="opacity-80"/>
        </h1>
        <div className="mt-4 flex justify-around items-end">
          <div className="text-center">
            <p className="text-blue-100 text-xs mb-1">攝取</p>
            <div className="text-2xl font-black flex items-center justify-center gap-1"><Flame className="text-orange-400 fill-orange-400" size={20} />{grandTotal}</div>
          </div>
          <div className="text-center pb-1 text-xl font-bold opacity-50">-</div>
          <div className="text-center">
            <p className="text-blue-100 text-xs mb-1">消耗</p>
            <div className="text-2xl font-black flex items-center justify-center gap-1"><Activity className="text-green-300" size={20} />{totalBurn}</div>
          </div>
          <div className="text-center pb-1 text-xl font-bold opacity-50">=</div>
          <div className="text-center">
            <p className="text-blue-100 text-xs mb-1">淨值</p>
            <div className="text-3xl font-black text-yellow-300">{grandTotal - totalBurn}</div>
          </div>
        </div>
        <button onClick={clearAll} className="absolute right-4 top-4 opacity-50 hover:opacity-100"><Trash2 size={18}/></button>
      </div>

      {/* AI 彈窗 */}
      {(analyzing || aiResult) && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-white shadow-2xl border-2 border-blue-500 rounded-2xl p-4 w-[90%] max-w-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          {analyzing ? (
            <>
              <Loader2 className="animate-spin text-blue-600" size={24} />
              <span className="font-bold text-slate-700">AI 正在判讀截圖...</span>
            </>
          ) : (
            <>
              <div className="bg-green-100 p-2 rounded-full"><BrainCircuit className="text-green-600" size={24} /></div>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-sm">{aiResult?.title}</p>
                <p className="text-blue-600 font-bold text-lg">{aiResult?.value}</p>
              </div>
              <button onClick={() => setAiResult(null)} className="bg-slate-100 p-1 rounded-full"><X size={16}/></button>
            </>
          )}
        </div>
      )}

      <div className="max-w-md mx-auto px-4 space-y-4">
        
        {/* 體重與喝水 (合併區塊) */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
           {/* 日期切換 */}
           <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-xl">
             <button onClick={() => shift(-7)} className="p-2 text-slate-500"><ChevronLeft size={20} /></button>
             <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Calendar size={16} className="text-blue-500"/> {chartData[0].name} ~ {chartData[6].name}</div>
             <button onClick={() => shift(7)} className="p-2 text-slate-500"><ChevronRight size={20} /></button>
          </div>

          {/* 圖表 */}
          <div className="h-[150px] w-full mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} ticks={customTicks} tickFormatter={(v) => v.toFixed(1)} tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false}/>
                <Tooltip />
                <ReferenceLine y={70} stroke="red" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb'}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 喝水顯示 */}
          <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl mb-4">
             <div className="flex items-center gap-2 text-blue-600 font-bold">
                 <Droplets size={20}/> 今日喝水
             </div>
             <span className="text-xl font-black text-blue-800">{waterIntake} <span className="text-sm font-normal">ml</span></span>
          </div>

          {/* 整合控制區 */}
          <div className="flex gap-2 items-center">
            {/* 體重+喝水 二合一上傳按鈕 */}
            <button onClick={() => triggerUpload('combo')} className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl shadow active:scale-95">
                <ImageUp size={20} />
                <span className="text-xs font-bold">上傳截圖</span>
            </button>
            <input type="number" step="0.1" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} placeholder="輸入體重" className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-xl text-lg"/>
            <button onClick={addWeight} className="bg-blue-600 text-white px-4 rounded-xl shadow"><Plus size={24} /></button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">💡 點擊「上傳截圖」可同時辨識體重與水量</p>
        </section>

        {/* 一日活動表格 */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
            <div className="flex items-center gap-2 mb-4">
                <Dumbbell className="text-green-600" size={20} />
                <h2 className="font-bold text-slate-700">一日活動 ({todayKey})</h2>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-300">
                <table className="w-full text-center text-sm border-collapse">
                    <thead>
                        <tr className="bg-green-50 border-b border-slate-300 font-bold text-slate-700">
                            <th className="p-2 border-r border-slate-300 w-20">項目</th>
                            <th className="p-2 border-r border-slate-300">目標</th>
                            <th className="p-2 border-r border-slate-300">實際</th>
                            <th className="p-2 border-r border-slate-300 w-12">單位</th>
                            <th className="p-2">卡路里</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.map((act) => (
                            <tr key={act.id} className="border-b border-slate-200">
                                <td className="p-2 border-r border-slate-300 font-bold text-slate-700">
                                    <div className="flex flex-col items-center gap-1">
                                        {act.name}
                                        {/* 只有走路和跑步顯示上傳按鈕 */}
                                        {act.allowScan && (
                                            <button onClick={() => triggerUpload('activity', act.id)} className="text-blue-500 bg-blue-50 p-1 rounded hover:bg-blue-100 flex items-center gap-1 text-[10px]">
                                                <ImageUp size={12}/> 截圖
                                            </button>
                                        )}
                                    </div>
                                </td>
                                <td className="p-1 border-r border-slate-300">
                                    <input type="number" value={act.target} onChange={(e) => handleActivityChange(act.id, 'target', e.target.value)} className="w-full text-center bg-transparent outline-none text-slate-400" />
                                </td>
                                <td className="p-1 border-r border-slate-300">
                                    <input type="number" value={act.actual || ''} onChange={(e) => handleActivityChange(act.id, 'actual', e.target.value)} className="w-full text-center bg-blue-50 rounded py-1 font-bold text-blue-600 outline-none focus:ring-1 focus:ring-blue-400" placeholder="0" />
                                </td>
                                <td className="p-2 border-r border-slate-300 text-xs text-slate-500">{act.unit}</td>
                                <td className="p-2 font-mono text-orange-600">{act.burn > 0 ? act.burn : '-'}</td>
                            </tr>
                        ))}
                        <tr className="bg-green-600 text-white font-bold">
                            <td colSpan={4} className="p-2 text-right pr-4">運動消耗總計</td>
                            <td className="p-2 text-center text-lg">{totalBurn}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        {/* 飲食照片與總表 (維持不變) */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
          <div className="flex items-center gap-2 mb-4">
            <Utensils className="text-blue-600" size={20} />
            <h2 className="font-bold text-slate-700">飲食照片</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {CATEGORIES.map((category) => {
              const currentPhotos = dietData[todayKey]?.[category] || [];
              const limit = MEAL_LIMITS[category];
              return (
                <div key={category} className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                     <span className="font-bold text-slate-700">{category}</span>
                     <span className="text-xs text-slate-400">{currentPhotos.length}/{limit}</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {currentPhotos.length < limit && (
                      <button onClick={() => triggerUpload('food', category)} className="flex-shrink-0 w-20 h-20 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center text-blue-400 bg-white active:bg-blue-50">
                        <Camera size={24} />
                        <span className="text-[10px]">上傳</span>
                      </button>
                    )}
                    {currentPhotos.map((photo, idx) => (
                      <div key={idx} className="relative flex-shrink-0 w-20 h-20">
                        <img src={photo} alt="meal" className="w-full h-full object-cover rounded-lg shadow-sm" />
                        <button onClick={() => removePhoto(category, idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        
        {/* 卡路里計算表格 (維持不變) */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50 mb-8">
            <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="text-blue-600" size={20} />
                <h2 className="font-bold text-slate-700">卡路里計算 ({todayKey})</h2>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-300">
                <table className="w-full text-center text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-100 border-b border-slate-300">
                            <th className="p-2 border-r border-slate-300 w-10">#</th>
                            {CATEGORIES.map(c => <th key={c} className="p-2 border-r border-slate-300 min-w-[60px]">{c}</th>)}
                        </tr>
                        <tr className="bg-slate-50 border-b border-slate-300 text-xs text-slate-500">
                            <th className="p-1 border-r border-slate-300"></th>
                            {CATEGORIES.map(c => <th key={c} className="p-1 border-r border-slate-300">卡路里</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.index} className="border-b border-slate-200 hover:bg-slate-50">
                                <td className="p-2 border-r border-slate-300 font-mono text-slate-400">{row.index}</td>
                                {CATEGORIES.map(cat => <td key={cat} className="p-2 border-r border-slate-300 text-slate-700 font-medium">{row[cat]}</td>)}
                            </tr>
                        ))}
                        <tr className="bg-blue-50 border-b border-slate-300 font-bold text-blue-800">
                            <td className="p-2 border-r border-slate-300">合計</td>
                            {CATEGORIES.map(cat => <td key={cat} className="p-2 border-r border-slate-300">{totals[cat] > 0 ? totals[cat] : ''}</td>)}
                        </tr>
                        <tr className="bg-blue-600 text-white font-bold">
                            <td className="p-2 border-r border-blue-500">總計</td>
                            <td colSpan={4} className="p-2 text-center text-lg">{grandTotal} kcal</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

      </div>
    </div>
  );
}