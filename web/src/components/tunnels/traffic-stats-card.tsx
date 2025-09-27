import { Card, CardBody, CardHeader } from "@heroui/react";

interface TrafficData {
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
  ping?: number | null;
}

interface TrafficStatsCardProps {
  trafficData: TrafficData;
  formatTrafficValue: (bytes: number) => { value: string; unit: string };
}

export const TrafficStatsCard = ({
  trafficData,
  formatTrafficValue,
}: TrafficStatsCardProps) => {
  // 计算TCP和UDP总和用于比例显示
  const tcpTotal = trafficData.tcpRx + trafficData.tcpTx;
  const udpTotal = trafficData.udpRx + trafficData.udpTx;
  const grandTotal = tcpTotal + udpTotal;

  // 计算百分比用于显示比例
  const tcpPercentage = grandTotal > 0 ? (tcpTotal / grandTotal) * 100 : 50;
  const udpPercentage = grandTotal > 0 ? (udpTotal / grandTotal) * 100 : 50;

  // 格式化各个数值
  const { value: tcpRxValue, unit: tcpRxUnit } = formatTrafficValue(
    trafficData.tcpRx,
  );
  const { value: tcpTxValue, unit: tcpTxUnit } = formatTrafficValue(
    trafficData.tcpTx,
  );
  const { value: udpRxValue, unit: udpRxUnit } = formatTrafficValue(
    trafficData.udpRx,
  );
  const { value: udpTxValue, unit: udpTxUnit } = formatTrafficValue(
    trafficData.udpTx,
  );

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
              d="M12.748 3.572c.059-.503-.532-.777-.835-.388L4.111 13.197c-.258.33-.038.832.364.832h6.988c.285 0 .506.267.47.57l-.68 5.83c-.06.502.53.776.834.387l7.802-10.013c.258-.33.038-.832-.364-.832h-6.988c-.285 0-.506-.267-.47-.57z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">流量累计</h3>
          </div>
        </CardHeader>
        <CardBody>
          {/* 主要内容区域 */}
          <div className="flex flex-row items-center justify-between ">
            <div className="flex rounded-lg overflow-hidden mt-2 w-full">
              {/* TCP 流量部分 */}
              <div
                className="p-4 flex-1 flex flex-col items-center relative bg-blue-50 dark:bg-blue-950/30"
                style={{
                  flex: `${tcpPercentage}`,
                  minWidth: "100px",
                }}
              >
                <div className="text-sm md:text-lg font-bold mb-1 text-blue-700 dark:text-blue-300">
                  ↓{tcpRxValue}
                  {tcpRxUnit} | ↑{tcpTxValue}
                  {tcpTxUnit}
                </div>
                <div className="text-xs font-medium opacity-90 text-blue-600 dark:text-blue-400">
                  TCP流量
                </div>
              </div>

              {/* UDP 流量部分 */}
              <div
                className="p-4 flex-1 flex flex-col items-center bg-green-50 dark:bg-green-950/30 "
                style={{
                  flex: `${udpPercentage}`,
                  minWidth: "100px",
                }}
              >
                <div className="text-sm md:text-lg font-bold mb-1 text-green-700 dark:text-green-300">
                  ↓{udpRxValue}
                  {udpRxUnit} | ↑{udpTxValue}
                  {udpTxUnit}
                </div>
                <div className="text-xs font-medium opacity-90 text-green-600 dark:text-green-400">
                  UDP流量
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
