import { Card, CardBody, CardHeader } from "@heroui/react";
import { useTranslation } from "react-i18next";

interface ConnectionsData {
  pool?: number | null;
  tcps?: number | null;
  udps?: number | null;
}

interface ConnectionsStatsCardProps {
  connectionsData: ConnectionsData;
}

export const ConnectionsStatsCard = ({
  connectionsData,
}: ConnectionsStatsCardProps) => {
  const { t } = useTranslation("tunnels");
  // 计算TCP和UDP连接数
  const tcpConnections = connectionsData.tcps || 0;
  const udpConnections = connectionsData.udps || 0;
  const totalConnections = tcpConnections + udpConnections;

  // 计算百分比用于显示比例
  const tcpPercentage =
    totalConnections > 0 ? (tcpConnections / totalConnections) * 100 : 50;
  const udpPercentage =
    totalConnections > 0 ? (udpConnections / totalConnections) * 100 : 50;

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
              d="M18 10h-4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2ZM6 4h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{t("details.statsTabs.connections")}</h3>
          </div>
        </CardHeader>
        <CardBody>
          {/* 主要内容区域 */}
          <div className="flex flex-row items-center justify-between">
            <div className="flex rounded-lg overflow-hidden  w-full">
              {/* TCP连接部分 */}
              <div
                className="p-3 flex-1 flex flex-col items-center relative bg-purple-50 dark:bg-purple-950/30 "
                style={{
                  minWidth: "100px",
                }}
              >
                <div className="text-sm md:text-base  font-bold mb-1 text-purple-700 dark:text-purple-300">
                  {tcpConnections}
                </div>
                <div className="text-xs font-medium opacity-90  text-purple-600 dark:text-purple-400">
                  {t("details.trafficStats.tcpConnections")}
                </div>
              </div>

              {/* UDP连接部分 */}
              <div
                className="p-3 flex-1 flex flex-col items-center bg-orange-50 dark:bg-orange-950/30"
                style={{
                  minWidth: "100px",
                }}
              >
                <div className="text-sm md:text-base  font-bold mb-1 text-orange-700 dark:text-orange-300">
                  {udpConnections}
                </div>
                <div className="text-xs font-medium opacity-90  text-orange-600 dark:text-orange-400">
                  {t("details.trafficStats.udpConnections")}
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
