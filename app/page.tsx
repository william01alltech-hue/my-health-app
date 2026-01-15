// @ts-nocheck
/* eslint-disable */
"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar, Trash2, Camera, X, Utensils } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// 定義飲食類別與限制
const MEAL_LIMITS: Record<string, number> = {
  '早餐': 3,
  '午餐': 3,
  '晚餐': 3,
  '其他': 10
};

export default function HealthApp() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 體重資料
  const [weightData, setWeightData] = useState<{date: string, weight: number}[]>([]); 
  const [weightVal, setWeightVal] = useState('');
  
  // 飲食資料：結構為 { 日期: { 早餐: [img1, img2], 午餐: [] ... } }
  const [dietData, setDietData] = useState<Record<string, Record<string, string[]>>>({});
  
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 6)));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);

  useEffect(() => {
    const savedWeight = localStorage.getItem('Health_Weight_Final');
    const savedDiet = localStorage.getItem('Health_Diet_Final');
    
    if (savedWeight) setWeightData(JSON.parse(savedWeight));
    if (savedDiet) setDietData(JSON.parse(savedDiet));
    
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('Health_Weight_Final', JSON.stringify(weightData));
      localStorage.setItem('Health_Diet_Final', JSON.stringify(dietData));
    }
  }, [weightData, dietData, isInitialized]);

  // --- 體重相關邏輯 ---
  const addWeight = () => {
    const v = parseFloat(weightVal);
    if (!isNaN(v) && v > 0) {
      const now = new Date();
      const dateKey = now.toISOString().split('T')[0];
      setWeightData(prev => {
        const clean = prev.filter(r => r.date !== dateKey);
        return [...clean, { date: dateKey, weight: v }];
      });
      setWeightVal('');
    }
  };

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

  const shift = (days: number) => {
    const newDate = new Date(startDate);
    newDate.setDate(startDate.getDate() + days);
    setStartDate(newDate);
  };

  // --- 飲食照片相關邏輯 ---
  
  // 取得今天的日期 Key (格式: 2026-01-14)
  const todayKey = new Date().toISOString().split('T')[0];

  // 觸發檔案選擇
  const handleCameraClick = (category: string) => {
    const currentImages = dietData[todayKey]?.[category] || [];
    if (currentImages.length >= MEAL_LIMITS[category]) {
      alert(`${category} 最多只能上傳 ${MEAL_LIMITS[category]} 張照片喔！`);
      return;
    }
    setCurrentCategory(category);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // 處理圖片上傳與壓縮
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentCategory) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // 簡單壓縮邏輯：縮小尺寸以節省空間
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxWidth = 800; // 限制最大寬度
          const scale = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * scale;
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7); // 70% 品質

          setDietData(prev => {
            const dayRecord = prev[todayKey] || {};
            const categoryImages = dayRecord[currentCategory] || [];
            return {
              ...prev,
              [todayKey]: {
                ...dayRecord,
                [currentCategory]: [...categoryImages, compressedBase64]
              }
            };
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
    // 清空 input 讓同一張圖可以重複選
    e.target.value = '';
  };

  // 刪除照片
  const removePhoto = (category: string, index: number) => {
    if(!confirm('確定刪除這張照片嗎？')) return;
    setDietData(prev => {
      const dayRecord = prev[todayKey];
      const newImages = [...dayRecord[category]];
      newImages.splice(index, 1);
      return {
        ...prev,
        [todayKey]: { ...dayRecord, [category]: newImages }
      };
    });
  };

  const clearAll = () => {
    if(confirm('確定要清空所有資料嗎？(包含體重與照片)')) {
        setWeightData([]);
        setDietData({});
    }
  };

  if (!isInitialized) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 pb-20 font-sans text-slate-900">
      
      {/* 隱藏的檔案輸入框 */}
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        capture="environment" // 優先呼叫手機相機
      />

      <div className="bg-blue-600 text-white p-4 rounded-b-3xl shadow-lg mb-4 text-center relative">
        <h1 className="text-lg font-bold">2026 健康管理</h1>
        <p className="text-xs opacity-90">體重監控 & 飲食紀錄</p>
        <button onClick={clearAll} className="absolute right-4 top-4 opacity-50 hover:opacity-100">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-4">
        
        {/* === 區塊 1: 體重週報表 (維持原樣) === */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
          <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-xl">
            <button onClick={() => shift(-7)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronLeft size={20} /></button>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Calendar size={16} className="text-blue-500"/>
              {chartData[0].name} ~ {chartData[6].name}
            </div>
            <button onClick={() => shift(7)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronRight size={20} /></button>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} axisLine={false} tickLine={false} dy={10} interval={0} />
                <YAxis domain={['auto', 'auto']} ticks={customTicks} tickFormatter={(v) => v.toFixed(1)} tick={{fontSize: 10, fontWeight: 'bold', fill: '#334155'}} axisLine={false} tickLine={false}/>
                <Tooltip formatter={(v: number) => [v.toFixed(1) + ' kg']} />
                <ReferenceLine y={70} stroke="red" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff'}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex gap-2 mt-4">
            <input 
              type="number" step="0.1" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} 
              placeholder="輸入體重" 
              className="flex-1 px-4 py-2 bg-white text-black border border-slate-300 rounded-xl text-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={addWeight} className="bg-blue-600 text-white px-4 rounded-xl shadow active:scale-95"><Plus size={24} /></button>
          </div>
        </section>

        {/* === 區塊 2: 飲食照片紀錄 (新功能) === */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
          <div className="flex items-center gap-2 mb-4">
            <Utensils className="text-blue-600" size={20} />
            <h2 className="font-bold text-slate-700">今日飲食 ({todayKey})</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {Object.keys(MEAL_LIMITS).map((category) => {
              const currentPhotos = dietData[todayKey]?.[category] || [];
              const limit = MEAL_LIMITS[category];
              const isFull = currentPhotos.length >= limit;

              return (
                <div key={category} className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-slate-700">{category}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${isFull ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      {currentPhotos.length} / {limit}
                    </span>
                  </div>

                  {/* 照片展示區 */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {/* 上傳按鈕 */}
                    {!isFull && (
                      <button 
                        onClick={() => handleCameraClick(category)}
                        className="flex-shrink-0 w-20 h-20 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center text-blue-400 bg-white active:bg-blue-50 transition-colors"
                      >
                        <Camera size={24} />
                        <span className="text-[10px] mt-1">新增</span>
                      </button>
                    )}

                    {/* 已上傳照片縮圖 */}
                    {currentPhotos.map((photo, idx) => (
                      <div key={idx} className="relative flex-shrink-0 w-20 h-20">
                        <img src={photo} alt="meal" className="w-full h-full object-cover rounded-lg shadow-sm border border-slate-200" />
                        <button 
                          onClick={() => removePhoto(category, idx)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}