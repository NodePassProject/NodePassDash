import { Card, CardBody, CardHeader } from "@heroui/react";

interface NetworkQualityData {
  ping?: number | null;
  pool?: number | null;
}

interface NetworkQualityCardProps {
  networkData: NetworkQualityData;
}

export const NetworkQualityCard = ({
  networkData,
}: NetworkQualityCardProps) => {
  const ping = networkData.ping || 0;
  const pool = networkData.pool || 0;

  // 计算延迟质量等级 (越低越好)
  const getLatencyQuality = (latency: number) => {
    if (latency === 0) return { level: "", percentage: 0 };
    if (latency <= 50) return { level: "优秀", percentage: 90 };
    if (latency <= 100) return { level: "良好", percentage: 70 };
    if (latency <= 200) return { level: "一般", percentage: 50 };

    return { level: "较差", percentage: 30 };
  };

  // 计算连接池质量等级 (适中最好)
  const getPoolQuality = (poolCount: number) => {
    if (poolCount === 0) return { level: "无空闲", percentage: 50 };
    if (poolCount <= 10) return { level: "重负载", percentage: 80 };
    if (poolCount <= 50) return { level: "中负载", percentage: 90 };
    if (poolCount <= 100) return { level: "轻负载", percentage: 70 };
    return { level: "空负载", percentage: 40 };
  };

  const latencyQuality = getLatencyQuality(ping);
  const poolQuality = getPoolQuality(pool);

  // 使用百分比来显示质量比例
  const latencyPercentage = latencyQuality.percentage;
  const poolPercentage = poolQuality.percentage;

  return (
    <div
      className="col-span-1"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        maxWidth: "100%",
      }}
    >
      <Card className="relative p-2 cursor-pointer transition-all duration-300 ">
        <CardHeader className="flex items-center   pb-0">
          <svg
            className="text-blue-500 mr-1"
            height="20"
            viewBox="0 0 24 24"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0m10-6v6l4 2"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">网络质量</h3>
          </div>
        </CardHeader>
        <CardBody>
          {/* 主要内容区域 */}
          <div className="flex flex-row items-center justify-between ">
            <div className="flex rounded-lg overflow-hidden w-full">
              {/* 延迟质量部分 */}
              <div
                className="p-3 flex-1 flex flex-col items-center relative bg-pink-50 dark:bg-pink-950/30"
                style={{
                  minWidth: "100px",
                }}
              >
                <div className="text-sm md:text-base font-bold mb-1 text-pink-700 dark:text-pink-300">
                  {ping >= 0 ? `${ping}ms` : "—"}
                </div>
                <div className="text-xs font-medium opacity-90 text-pink-600 dark:text-pink-400">
                  延迟 {latencyQuality.level}
                </div>
              </div>

              {/* 池连接质量部分 */}
              <div
                className="p-3 flex-1 flex flex-col items-center bg-cyan-50 dark:bg-cyan-950/30"
                style={{
                  minWidth: "100px",
                }}
              >
                <div className="text-sm md:text-base  font-bold mb-1 text-cyan-700 dark:text-cyan-300">
                  {pool}
                </div>
                <div className="text-xs font-medium opacity-90 text-cyan-600 dark:text-cyan-400">
                  池 {poolQuality.level}
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
