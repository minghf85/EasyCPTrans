import { useState } from "react";
import { Search, Copy, Check, Trash2, Pin, Settings, Clock } from "lucide-react";
import "./App.css";

function App() {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 模拟剪贴板历史数据
  const [history, setHistory] = useState([
    { id: "1", type: "text", content: "https://tauri.app", time: "10 mins ago", pinned: true },
    { id: "2", type: "text", content: "npm install -D tailwindcss", time: "1 hour ago", pinned: false },
    { id: "3", type: "text", content: "这是一段复制的示例文本内容", time: "2 hours ago", pinned: false },
    { id: "4", type: "image", content: "[图片内容]", time: "yesterday", pinned: false },
  ]);

  const handleCopy = (id: string, content: string) => {
    // 实际环境中应使用 tauri clipboard 写入
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePin = (id: string) => {
    setHistory(history.map(item => item.id === id ? { ...item, pinned: !item.pinned } : item));
  };

  const removeItem = (id: string) => {
    setHistory(history.filter(item => item.id !== id));
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col text-slate-800 font-sans">
      {/* 顶部标题栏/搜索栏 */}
      <header className="flex items-center px-4 py-3 bg-white shadow-sm z-10 sticky top-0" data-tauri-drag-region>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-1.5 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"
            placeholder="Search clipboard..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="ml-3 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* 历史记录列表 */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.filter(i => i.content.toLowerCase().includes(search.toLowerCase())).map((item) => (
          <div 
            key={item.id} 
            className="group flex flex-col bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer relative"
            onDoubleClick={() => handleCopy(item.id, item.content)}
          >
            {/* 内容区域 */}
            <div className="text-sm font-medium text-slate-700 line-clamp-3 mb-2">
              {item.type === 'text' ? item.content : <span className="italic text-slate-400">Image content...</span>}
            </div>
            
            {/* 底部信息与操作按钮 */}
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{item.time}</span>
              </div>
              
              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => togglePin(item.id)}
                  className={`p-1.5 rounded hover:bg-slate-100 ${item.pinned ? 'text-blue-500' : 'text-slate-400'}`}
                  title="Pin"
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleCopy(item.id, item.content)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-500"
                  title="Copy"
                >
                  {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button 
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 如果固定了，显示一个小图标指示 */}
            {item.pinned && (
              <Pin className="absolute top-2 right-2 w-3 h-3 text-blue-500 transform rotate-45" />
            )}
          </div>
        ))}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Clock className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">No clipboard history yet</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
