import type { Endpoint, EndpointStatusType } from "@/lib/types";

import React from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  ButtonGroup,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLink,
  faLinkSlash,
  faPenToSquare,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import { cn } from "@/lib/utils";
import { ServerIcon } from "@/components/ui/server-icon";
import { ServerIconRed } from "@/components/ui/server-red-icon";

interface EndpointListProps {
  endpoints: Endpoint[];
  onConnect?: (id: string) => void;
  onDisconnect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  loading?: boolean;
}

const getStatusColor = (
  status: EndpointStatusType,
): "default" | "primary" | "secondary" | "success" | "warning" | "danger" => {
  switch (status) {
    case "ONLINE":
      return "success";
    case "OFFLINE":
    case "DISCONNECT":
      return "warning";
    case "FAIL":
      return "danger";
    default:
      return "default";
  }
};

const StatusChip = ({ status }: { status: EndpointStatusType }) => {
  return (
    <Chip color={getStatusColor(status)} size="sm" variant="flat">
      {status}
    </Chip>
  );
};

export function EndpointList({
  endpoints,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  loading = false,
}: EndpointListProps) {
  const columns = [
    {
      key: "status",
      label: "状态",
    },
    {
      key: "info",
      label: "主控信息",
    },
    {
      key: "api",
      label: "API 配置",
    },
    {
      key: "tunnels",
      label: "隧道数量",
    },
    {
      key: "actions",
      label: "操作",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px] animate-pulse">
        <p className="text-default-500">加载主控列表...</p>
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-center space-y-4">
          <p className="text-xl text-default-500">暂无主控节点</p>
          <p className="text-sm text-default-400">
            点击"添加主控"按钮开始添加主控节点
          </p>
        </div>
      </div>
    );
  }

  return (
    <Table
      aria-label="主控列表"
      classNames={{
        base: cn(
          "border dark:border-default-100 border-transparent rounded-medium",
          "bg-content1 dark:bg-content1/50",
        ),
        td: "text-small text-default-500",
        th: "text-small font-medium text-default-700 bg-default-100/50",
        tbody: "divide-y divide-default-100",
      }}
    >
      <TableHeader>
        {columns.map((column) => (
          <TableColumn key={column.key}>{column.label}</TableColumn>
        ))}
      </TableHeader>
      <TableBody>
        {endpoints.map((endpoint) => (
          <TableRow key={endpoint.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                {endpoint.status === "ONLINE" ? (
                  <ServerIcon size={32} />
                ) : (
                  <ServerIconRed size={32} />
                )}
                <StatusChip status={endpoint.status} />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium text-foreground">
                  {endpoint.ip}
                </span>
                <span className="text-tiny text-default-400">
                  {endpoint.url}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium text-foreground">
                  路径: {endpoint.apiPath}
                </span>
                <span className="text-tiny text-default-400 font-mono">
                  密钥: {endpoint.apiKey}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <span className="text-lg font-semibold">
                  {endpoint.tunnelCount}
                </span>
                <span className="text-tiny text-default-400">个实例</span>
              </div>
            </TableCell>
            <TableCell>
              <ButtonGroup>
                {endpoint.status !== "ONLINE" ? (
                  <Button
                    isIconOnly
                    color="success"
                    size="sm"
                    title="连接"
                    variant="light"
                    onPress={() => onConnect?.(endpoint.id)}
                  >
                    <FontAwesomeIcon className="w-4 h-4" icon={faLink} />
                  </Button>
                ) : (
                  <Button
                    isIconOnly
                    color="warning"
                    size="sm"
                    title="断开"
                    variant="light"
                    onPress={() => onDisconnect?.(endpoint.id)}
                  >
                    <FontAwesomeIcon className="w-4 h-4" icon={faLinkSlash} />
                  </Button>
                )}
                <Button
                  isIconOnly
                  color="primary"
                  size="sm"
                  title="编辑"
                  variant="light"
                  onPress={() => onEdit?.(endpoint.id)}
                >
                  <FontAwesomeIcon className="w-4 h-4" icon={faPenToSquare} />
                </Button>
                <Button
                  isIconOnly
                  color="danger"
                  size="sm"
                  title="删除"
                  variant="light"
                  onPress={() => onDelete?.(endpoint.id)}
                >
                  <FontAwesomeIcon className="w-4 h-4" icon={faTrash} />
                </Button>
              </ButtonGroup>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
