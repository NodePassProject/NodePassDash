"use client";

import React from "react";
import { TrafficOverviewChart } from "@/components/ui/traffic-overview-chart";

// 模拟流量数据 - 添加更多时间点来测试时间格式化
const mockTrafficData = [
  { time: "2024-01-01 00:00:00", tcpIn: 1024 * 1024, tcpOut: 512 * 1024, udpIn: 256 * 1024, udpOut: 128 * 1024 },
  { time: "2024-01-01 01:00:00", tcpIn: 2048 * 1024, tcpOut: 1024 * 1024, udpIn: 512 * 1024, udpOut: 256 * 1024 },
  { time: "2024-01-01 02:00:00", tcpIn: 1536 * 1024, tcpOut: 768 * 1024, udpIn: 384 * 1024, udpOut: 192 * 1024 },
  { time: "2024-01-01 03:00:00", tcpIn: 3072 * 1024, tcpOut: 1536 * 1024, udpIn: 768 * 1024, udpOut: 384 * 1024 },
  { time: "2024-01-01 04:00:00", tcpIn: 2560 * 1024, tcpOut: 1280 * 1024, udpIn: 640 * 1024, udpOut: 320 * 1024 },
  { time: "2024-01-01 05:00:00", tcpIn: 1792 * 1024, tcpOut: 896 * 1024, udpIn: 448 * 1024, udpOut: 224 * 1024 },
  { time: "2024-01-01 06:00:00", tcpIn: 2304 * 1024, tcpOut: 1152 * 1024, udpIn: 576 * 1024, udpOut: 288 * 1024 },
  { time: "2024-01-01 07:00:00", tcpIn: 2816 * 1024, tcpOut: 1408 * 1024, udpIn: 704 * 1024, udpOut: 352 * 1024 },
];

// 生成最近24小时的数据
const generateRecentData = () => {
  const data = [];
  const now = new Date();
  
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    data.push({
      time: time.toISOString(),
      tcpIn: Math.random() * 2048 * 1024 + 512 * 1024,
      tcpOut: Math.random() * 1024 * 1024 + 256 * 1024,
      udpIn: Math.random() * 512 * 1024 + 128 * 1024,
      udpOut: Math.random() * 256 * 1024 + 64 * 1024,
    });
  }
  
  return data;
};

export default function TestTrafficChartPage() {
  const [timeRange, setTimeRange] = React.useState<"7Days" | "3Days" | "24Hours" | "12Hours">("24Hours");
  const [useRecentData, setUseRecentData] = React.useState(true);

  const data = useRecentData ? generateRecentData() : mockTrafficData;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">流量总耗组件测试</h1>
      
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setUseRecentData(!useRecentData)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600"
        >
          {useRecentData ? "使用模拟数据" : "使用最近24小时数据"}
        </button>
      </div>
      
      <div className="max-w-6xl">
        <TrafficOverviewChart 
          data={data}
          loading={false}
          timeRange={timeRange}
          onTimeRangeChange={(range) => {
            console.log('时间范围变化:', range);
            setTimeRange(range);
          }}
        />
      </div>
      
      <div className="bg-default-100 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">组件特性：</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>支持时间范围切换：7Days, 3Days, 24Hours, 12Hours</li>
          <li>显示四个流量指标：TCP In, TCP Out, UDP In, UDP Out</li>
          <li>自动计算变化率和趋势</li>
          <li>智能单位转换（B, KB, MB, GB, TB）</li>
          <li>响应式设计，支持移动端和桌面端</li>
          <li>基于 Recharts 的平滑区域图表</li>
          <li><strong>新的时间格式化：</strong>横坐标显示相对时间（如 2h, 30m），Tooltip 显示实际时间</li>
        </ul>
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h3 className="text-md font-semibold mb-2 text-blue-700 dark:text-blue-300">时间格式化说明：</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-blue-600 dark:text-blue-400">
          <li><strong>横坐标：</strong>显示相对时间，超过24小时显示天数（如 2d），超过1小时显示小时（如 3h），超过5分钟显示分钟（如 15m），5分钟内显示实际时间</li>
          <li><strong>Tooltip：</strong>24小时内显示时分（如 14:30），超过24小时显示月日时分（如 12-25 14:30）</li>
          <li><strong>参考实现：</strong>完全按照 @/components/ui/speed-chart 的时间格式化逻辑</li>
        </ul>
      </div>
    </div>
  );
}
