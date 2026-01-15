// @ts-nocheck
/* eslint-disable */
"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar, Trash2, Camera, X, Utensils, Cloud, BrainCircuit, Loader2, Flame, ClipboardList, Activity, Dumbbell, Droplets } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// === 設定區 ===
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzClBk-cmKDI3cgp1jshvUVo-1mkgq6unU39FeCA6wyqkjTjvMbSVIcRXrUA5MLzYcV/exec";

// ⚠️⚠️⚠️【重要】請填入您的新 API 金鑰 (AIzaSy...) ⚠️⚠️⚠️
const GEMINI_API_KEY = "AIzaSyA0_eNpZC6Ujvmbs6GJAg_HV8jaJp6o6uU"; 
const AI_MODEL = "gemini-2.5-flash"; 

// === 運動消耗標準 ===
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

// === Gemini AI 分析 (多功能版) ===
const analyzeWithGemini = async (base64Image: string, type: 'food' | 'weight' | 'activity' | 'water', context?: string) => {
  try {
    const cleanBase64 = base64Image.split(',')[1];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    let promptText = "";
    // 根據不同情境設定不同指令
    if (type === 'food') {
      promptText = "請辨識圖片食物。只回傳純 JSON：{ \"name\": \"食物名稱\", \"calories\": 數字(大卡) }。例如：{ \"name\": \"便當\", \"calories\": 800 }。無法辨識回傳 calories: 0";
    } else if (type === 'weight') {
      promptText = "請讀取圖片中體重計的數字。只回傳純 JSON：{ \"value\": 數字 }。例如看到 75.5kg，回傳 { \"value\": 75.5 }。";
    } else if (type === 'activity') {
      promptText = `請讀取圖片中儀表板或手錶的數據。目標是找出「${context}」的數值。只回傳純 JSON：{ \"value\": 數字 }。例如看到 5000步，回傳 { \"value\": 5000 }。`;
    } else if (type === 'water') {
      promptText = "請預估圖片中容器的水量(ml)。只回傳純 JSON：{ \"value\": 數字 }。例如看到一杯水，回傳 { \"value\": 300 }。";
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
  const [waterData, setWaterData] = useState<Record<string, number>>({}); // 喝水紀錄 { "2026-01-15": 1500 }

  const [weightVal, setWeightVal] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 6)));
  
  // UI 狀態
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanType, setScanType] = useState<'food' | 'weight' | 'activity' | 'water'>('food'); // 記錄現在要掃什麼
  const [scanContext, setScanContext] = useState<string>(''); // 記錄掃描的細節 (如: 'walk', 'run')
  
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

  // 通用相機觸發
  const triggerCamera = (type: 'food' | 'weight' | 'activity' | 'water', context: string = '') => {
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

          // === AI 分析核心邏輯 ===
          const result = await analyzeWithGemini(compressedBase64, scanType, scanContext);
          setAnalyzing(false);

          if (result.error) {
             alert(`辨識失敗: ${result.msg}`);
             return;
          }

          // 根據掃描類型處理結果
          if (scanType === 'food') {
             // 飲食邏輯
             const category = scanContext; // 這裡 context 存的是 '早餐' 等
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
          
          } else if (scanType === 'weight') {
             // 體重邏輯
             const weight = parseFloat(result.value);
             if (!isNaN(weight)) {
                setWeightVal(weight.toString()); // 自動填入輸入框
                setAiResult({ title: "體重計讀數", value: `${weight} kg` });
             }

          } else if (scanType === 'activity') {
             // 運動邏輯
             const val = parseFloat(result.value);
             if (!isNaN(val)) {
                const actId = scanContext; // context 存的是 'walk' 或 'run'
                handleActivityChange(actId, 'actual', val.toString());
                setAiResult({ title: "運動數據", value: `${val}` });
             }

          } else if (scanType === 'water') {
             // 喝水邏輯
             const vol = parseFloat(result.value);
             if (!isNaN(vol)) {
                setWaterData(prev => ({ ...prev, [todayKey]: (prev[todayKey] || 0) + vol }));
                setAiResult({ title: "補充水分", value: `+${vol} ml` });
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
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" capture="environment" />

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
              <span className="font-bold text-slate-700">AI 正在辨識中...</span>
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
        
        {/* 體重圖表 (新增相機按鈕) */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
           <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-xl">
             <button onClick={() => shift(-7)} className="p-2 text-slate-500"><ChevronLeft size={20} /></button>
             <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Calendar size={16} className="text-blue-500"/> {chartData[0].name} ~ {chartData[6].name}</div>
             <button onClick={() => shift(7)} className="p-2 text-slate-500"><ChevronRight size={20} /></button>
          </div>
          <div className="h-[150px] w-full">
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
          <div className="flex gap-2 mt-4 items-center">
            {/* 體重相機按鈕 */}
            <button onClick={() => triggerCamera('weight')} className="p-2 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200">
                <Camera size={24} />
            </button>
            <input type="number" step="0.1" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} placeholder="輸入體重" className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-xl text-lg"/>
            <button onClick={addWeight} className="bg-blue-600 text-white px-4 rounded-xl shadow"><Plus size={24} /></button>
          </div>
        </section>

        {/* 喝水追蹤 (新增區塊) */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-full text-blue-500"><Droplets size={24} /></div>
                <div>
                    <h2 className="font-bold text-slate-700">今日喝水</h2>
                    <p className="text-xs text-slate-400">目標 2000ml</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-blue-600">{waterIntake} <span className="text-sm font-normal text-slate-400">ml</span></span>
                <button onClick={() => triggerCamera('water')} className="p-2 bg-blue-50 text-blue-500 rounded-full border border-blue-200 hover:bg-blue-100">
                    <Camera size={20} />
                </button>
            </div>
        </section>

        {/* 一日活動表格 (新增相機按鈕) */}
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
                                        {/* 只有走路和跑步顯示相機 */}
                                        {act.allowScan && (
                                            <button onClick={() => triggerCamera('activity', act.id)} className="text-blue-400 bg-blue-50 p-1 rounded hover:bg-blue-100"><Camera size={14}/></button>
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
                      <button onClick={() => triggerCamera('food', category)} className="flex-shrink-0 w-20 h-20 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center text-blue-400 bg-white active:bg-blue-50">
                        <Camera size={24} />
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