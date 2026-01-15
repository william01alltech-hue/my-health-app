// @ts-nocheck
/* eslint-disable */
"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar, Trash2, Camera, X, Utensils, Cloud, BrainCircuit, Loader2, Flame, ClipboardList, Activity, Dumbbell } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// === 設定區 ===
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzClBk-cmKDI3cgp1jshvUVo-1mkgq6unU39FeCA6wyqkjTjvMbSVIcRXrUA5MLzYcV/exec";

// ⚠️⚠️⚠️ 請在此填入您的新 API 金鑰 (不要留空，也不要用舊的) ⚠️⚠️⚠️
const GEMINI_API_KEY = "AIzaSyChNbDhHMShbTIrJZC2zshvIUdhvp7RAf0"; 
const AI_MODEL = "gemini-2.5-flash"; 

// === 運動消耗標準 (每單位消耗卡路里) ===
const ACTIVITY_STANDARDS = [
  { id: 'walk', name: '走路', unit: '步', kcal: 0.04, defaultTarget: 6000 },
  { id: 'run', name: '跑步', unit: '公里', kcal: 60, defaultTarget: 5 },
  { id: 'pushup', name: '伏地挺身', unit: '次', kcal: 0.4, defaultTarget: 30 },
  { id: 'crunch', name: '捲腹', unit: '次', kcal: 0.3, defaultTarget: 30 },
];

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
  } catch (err) {
    console.error("雲端備份失敗:", err);
  }
};

// === Gemini AI 分析 ===
const analyzeWithGemini = async (base64Image: string) => {
  try {
    const cleanBase64 = base64Image.split(',')[1];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: "請辨識圖片食物。請務必只回傳純 JSON 格式，不要有 markdown 標記。格式：{ \"name\": \"食物名稱\", \"calories\": 數字(大卡) }。例如：{ \"name\": \"炸雞腿便當\", \"calories\": 850 }。若無法辨識，回傳 { \"name\": \"未知食物\", \"calories\": 0 }。" },
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
    if (data.error) return { name: `Error: ${data.error.message}`, calories: 0 };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { name: "無法辨識", calories: 0 };

    const cleanText = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    return result;

  } catch (error) {
    console.error(error);
    return { name: "連線失敗", calories: 0 };
  }
};

const MEAL_LIMITS: Record<string, number> = { '早餐': 3, '午餐': 3, '晚餐': 3, '其他': 10 };
const CATEGORIES = ['早餐', '午餐', '晚餐', '其他'];

export default function HealthApp() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 資料狀態
  const [weightData, setWeightData] = useState<{date: string, weight: number}[]>([]); 
  const [dietData, setDietData] = useState<Record<string, Record<string, string[]>>>({});
  const [foodLog, setFoodLog] = useState<Record<string, Record<string, {name: string, cal: number}[]>>>({});
  
  // 新增：運動紀錄 { "2026-01-15": { walk: {target: 6000, actual: 5000}, ... } }
  const [activityData, setActivityData] = useState<Record<string, Record<string, {target: number, actual: number}>>>({});

  const [weightVal, setWeightVal] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 6)));
  
  // UI 狀態
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{name: string, calories: number} | null>(null);

  // 初始化與存檔
  useEffect(() => {
    const savedWeight = localStorage.getItem('Health_Weight_Final');
    const savedDiet = localStorage.getItem('Health_Diet_Final');
    const savedLog = localStorage.getItem('Health_FoodLog_V5');
    const savedActivity = localStorage.getItem('Health_Activity_V1');
    
    if (savedWeight) setWeightData(JSON.parse(savedWeight));
    if (savedDiet) setDietData(JSON.parse(savedDiet));
    if (savedLog) setFoodLog(JSON.parse(savedLog));
    if (savedActivity) setActivityData(JSON.parse(savedActivity));
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('Health_Weight_Final', JSON.stringify(weightData));
      localStorage.setItem('Health_Diet_Final', JSON.stringify(dietData));
      localStorage.setItem('Health_FoodLog_V5', JSON.stringify(foodLog));
      localStorage.setItem('Health_Activity_V1', JSON.stringify(activityData));
    }
  }, [weightData, dietData, foodLog, activityData, isInitialized]);

  const todayKey = new Date().toISOString().split('T')[0];

  // 圖表資料
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

  const shift = (days: number) => {
    const newDate = new Date(startDate);
    newDate.setDate(startDate.getDate() + days);
    setStartDate(newDate);
  };

  // 運動輸入處理
  const handleActivityChange = (id: string, field: 'target' | 'actual', value: string) => {
    const num = parseFloat(value) || 0;
    setActivityData(prev => {
      const today = prev[todayKey] || {};
      const current = today[id] || { target: ACTIVITY_STANDARDS.find(a=>a.id===id)?.defaultTarget || 0, actual: 0 };
      return {
        ...prev,
        [todayKey]: {
          ...today,
          [id]: { ...current, [field]: num }
        }
      };
    });
  };

  const handleCameraClick = (category: string) => {
    if ((dietData[todayKey]?.[category] || []).length >= MEAL_LIMITS[category]) {
      alert("照片數量已達上限");
      return;
    }
    setCurrentCategory(category);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentCategory) {
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

          setDietData(prev => {
            const dayRecord = prev[todayKey] || {};
            const categoryImages = dayRecord[currentCategory] || [];
            return { ...prev, [todayKey]: { ...dayRecord, [currentCategory]: [...categoryImages, compressedBase64] } };
          });

          const result = await analyzeWithGemini(compressedBase64);
          setAnalyzing(false);
          setAiResult(result);

          if (result.calories >= 0) {
            setFoodLog(prev => {
                const dayLog = prev[todayKey] || {};
                const catLog = dayLog[currentCategory] || [];
                return {
                    ...prev,
                    [todayKey]: { ...dayLog, [currentCategory]: [...catLog, { name: result.name, cal: result.calories }] }
                };
            });
          }

          uploadToCloud({ date: todayKey, type: `${currentCategory}-AI`, value: `${result.name} (${result.calories} kcal)` });
          uploadToCloud({ date: todayKey, type: currentCategory, value: compressedBase64 });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removePhoto = (category: string, index: number) => {
    if(!confirm('確定刪除這張照片與對應的熱量紀錄嗎？')) return;
    setDietData(prev => {
      const dayRecord = prev[todayKey];
      const newImages = [...dayRecord[category]];
      newImages.splice(index, 1);
      return { ...prev, [todayKey]: { ...dayRecord, [category]: newImages } };
    });
    setFoodLog(prev => {
        const dayLog = prev[todayKey];
        if(!dayLog || !dayLog[category]) return prev;
        const newLog = [...dayLog[category]];
        newLog.splice(index, 1);
        return { ...prev, [todayKey]: { ...dayLog, [category]: newLog } };
    });
  };

  const clearAll = () => {
    if(confirm('確定清空所有資料？')) {
      setWeightData([]); setDietData({}); setFoodLog({}); setActivityData({});
    }
  };

  // 計算表格資料
  const getTableData = () => {
    const log = foodLog[todayKey] || {};
    const rows = [];
    const totals = { '早餐': 0, '午餐': 0, '晚餐': 0, '其他': 0 };

    for (let i = 0; i < 10; i++) {
        const rowData = {};
        CATEGORIES.forEach(cat => {
            const item = log[cat]?.[i];
            if (item) {
                rowData[cat] = item.cal;
                totals[cat] += item.cal;
            } else {
                rowData[cat] = '';
            }
        });
        rows.push({ index: i + 1, ...rowData });
    }
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    return { rows, totals, grandTotal };
  };

  // 計算運動資料
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
            <div className="text-2xl font-black flex items-center justify-center gap-1">
              <Flame className="text-orange-400 fill-orange-400" size={20} />
              {grandTotal}
            </div>
          </div>
          <div className="text-center pb-1 text-xl font-bold opacity-50">-</div>
          <div className="text-center">
            <p className="text-blue-100 text-xs mb-1">消耗</p>
            <div className="text-2xl font-black flex items-center justify-center gap-1">
              <Activity className="text-green-300" size={20} />
              {totalBurn}
            </div>
          </div>
          <div className="text-center pb-1 text-xl font-bold opacity-50">=</div>
          <div className="text-center">
            <p className="text-blue-100 text-xs mb-1">淨值</p>
            <div className="text-3xl font-black text-yellow-300">
              {grandTotal - totalBurn}
            </div>
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
              <span className="font-bold text-slate-700">AI 正在計算熱量...</span>
            </>
          ) : (
            <>
              <div className="bg-green-100 p-2 rounded-full"><BrainCircuit className="text-green-600" size={24} /></div>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-sm">{aiResult?.name}</p>
                <p className="text-orange-600 font-bold text-lg">+{aiResult?.calories} kcal</p>
              </div>
              <button onClick={() => setAiResult(null)} className="bg-slate-100 p-1 rounded-full"><X size={16}/></button>
            </>
          )}
        </div>
      )}

      <div className="max-w-md mx-auto px-4 space-y-4">
        {/* 體重圖表 */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
           <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-xl">
            <button onClick={() => shift(-7)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronLeft size={20} /></button>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Calendar size={16} className="text-blue-500"/>
              {chartData[0].name} ~ {chartData[6].name}
            </div>
            <button onClick={() => shift(7)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronRight size={20} /></button>
          </div>
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" tick={{fontSize: 11}} axisLine={false} tickLine={false} dy={10} interval={0} />
                <YAxis domain={['auto', 'auto']} ticks={customTicks} tickFormatter={(v) => v.toFixed(1)} tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false}/>
                <Tooltip />
                <ReferenceLine y={70} stroke="red" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb'}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-2 mt-4">
            <input type="number" step="0.1" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} placeholder="輸入體重" className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-xl text-lg"/>
            <button onClick={addWeight} className="bg-blue-600 text-white px-4 rounded-xl shadow"><Plus size={24} /></button>
          </div>
        </section>

        {/* 🆕 一日活動表格 (可輸入) */}
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
                                <td className="p-2 border-r border-slate-300 font-bold text-slate-700">{act.name}</td>
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

        {/* 飲食照片列表 */}
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
                      <button onClick={() => handleCameraClick(category)} className="flex-shrink-0 w-20 h-20 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center text-blue-400 bg-white active:bg-blue-50">
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

        {/* 卡路里計算總表 */}
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
                            {CATEGORIES.map(c => (
                                <th key={c} className="p-2 border-r border-slate-300 min-w-[60px]">{c}</th>
                            ))}
                        </tr>
                        <tr className="bg-slate-50 border-b border-slate-300 text-xs text-slate-500">
                            <th className="p-1 border-r border-slate-300"></th>
                            {CATEGORIES.map(c => (
                                <th key={c} className="p-1 border-r border-slate-300">卡路里</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.index} className="border-b border-slate-200 hover:bg-slate-50">
                                <td className="p-2 border-r border-slate-300 font-mono text-slate-400">{row.index}</td>
                                {CATEGORIES.map(cat => (
                                    <td key={cat} className="p-2 border-r border-slate-300 text-slate-700 font-medium">
                                        {row[cat]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        <tr className="bg-blue-50 border-b border-slate-300 font-bold text-blue-800">
                            <td className="p-2 border-r border-slate-300">合計</td>
                            {CATEGORIES.map(cat => (
                                <td key={cat} className="p-2 border-r border-slate-300">
                                    {totals[cat] > 0 ? totals[cat] : ''}
                                </td>
                            ))}
                        </tr>
                        <tr className="bg-blue-600 text-white font-bold">
                            <td className="p-2 border-r border-blue-500">總計</td>
                            <td colSpan={4} className="p-2 text-center text-lg">
                                {grandTotal} kcal
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

      </div>
    </div>
  );
}