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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("endpoints");

  const columns = [
    {
      key: "status",
      label: t("table.columns.status"),
    },
    {
      key: "info",
      label: t("table.columns.info"),
    },
    {
      key: "api",
      label: t("table.columns.api"),
    },
    {
      key: "tunnels",
      label: t("table.columns.tunnels"),
    },
    {
      key: "actions",
      label: t("table.columns.actions"),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px] animate-pulse">
        <p className="text-default-500">{t("page.loading")}</p>
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-center space-y-4">
          <p className="text-xl text-default-500">{t("page.noEndpoints")}</p>
          <p className="text-sm text-default-400">{t("page.noEndpointsDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <Table
      aria-label={t("page.title")}
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
                  {t("table.apiPath")}: {endpoint.apiPath}
                </span>
                <span className="text-tiny text-default-400 font-mono">
                  {t("table.apiKeyPlaceholder")}: {endpoint.apiKey}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <span className="text-lg font-semibold">
                  {endpoint.tunnelCount}
                </span>
                <span className="text-tiny text-default-400">
                  {t("table.instances", { count: endpoint.tunnelCount })}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <ButtonGroup>
                {endpoint.status !== "ONLINE" ? (
                  <Button
                    isIconOnly
                    color="success"
                    size="sm"
                    title={t("actions.connect")}
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
                    title={t("actions.disconnect")}
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
                  title={t("actions.edit")}
                  variant="light"
                  onPress={() => onEdit?.(endpoint.id)}
                >
                  <FontAwesomeIcon className="w-4 h-4" icon={faPenToSquare} />
                </Button>
                <Button
                  isIconOnly
                  color="danger"
                  size="sm"
                  title={t("actions.delete")}
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
